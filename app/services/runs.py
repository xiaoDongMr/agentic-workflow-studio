from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid
from dataclasses import dataclass
from collections.abc import Mapping
from typing import Any

from fastapi import HTTPException, Request
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage

from app.schemas.run import RunCreateRequest
from deerflow.runtime import END_SENTINEL, HEARTBEAT_SENTINEL, ConflictError, DisconnectMode, RunContext, RunManager, RunRecord, RunStatus, StreamBridge, UnsupportedStrategyError, run_agent

logger = logging.getLogger(__name__)

_DEFAULT_ASSISTANT_ID = "lead_agent"
_CONTEXT_CONFIGURABLE_KEYS: frozenset[str] = frozenset(
    {
        "model_name",
        "mode",
        "thinking_enabled",
        "reasoning_effort",
        "is_plan_mode",
        "subagent_enabled",
        "max_concurrent_subagents",
        "agent_name",
        "is_bootstrap",
    }
)


def _resolve_thread_id(body: RunCreateRequest) -> str:
    thread_id = (body.config or {}).get("configurable", {}).get("thread_id")
    if thread_id:
        return str(thread_id)
    return str(uuid.uuid4())


def _format_sse(event: str, data: Any, *, event_id: str | None = None) -> str:
    payload = json.dumps(data, default=str, ensure_ascii=False)
    parts = [f"event: {event}", f"data: {payload}"]
    if event_id:
        parts.append(f"id: {event_id}")
    parts.append("")
    parts.append("")
    return "\n".join(parts)


def _normalize_stream_modes(raw: list[str] | str | None) -> list[str]:
    if raw is None:
        return ["values"]
    if isinstance(raw, str):
        return [raw]
    return raw if raw else ["values"]


def _normalize_input(raw_input: dict[str, Any] | None) -> dict[str, Any]:
    if raw_input is None:
        return {}

    messages = raw_input.get("messages")
    if not isinstance(messages, list):
        return raw_input

    converted = []
    for msg in messages:
        if isinstance(msg, dict):
            role = msg.get("role", msg.get("type", "user"))
            content = msg.get("content", "")
            if role in ("user", "human"):
                converted.append(HumanMessage(content=content))
            else:
                converted.append(HumanMessage(content=content))
        else:
            converted.append(msg)
    return {**raw_input, "messages": converted}


def _merge_run_context_overrides(config: dict[str, Any], context: Mapping[str, Any] | None) -> None:
    if not context:
        return

    configurable = config.setdefault("configurable", {})
    runtime_context = config.setdefault("context", {})
    for key in _CONTEXT_CONFIGURABLE_KEYS:
        if key in context:
            if isinstance(configurable, dict):
                configurable.setdefault(key, context[key])
            if isinstance(runtime_context, dict):
                runtime_context.setdefault(key, context[key])


def _inject_authenticated_user_context(config: dict[str, Any], request: Request) -> None:
    user = getattr(request.state, "user", None)
    user_id = getattr(user, "id", None)
    if user_id is None:
        return

    runtime_context = config.setdefault("context", {})
    if isinstance(runtime_context, dict):
        runtime_context["user_id"] = str(user_id)


def _resolve_agent_factory():
    from deerflow.agents.lead_agent.agent import make_lead_agent

    return make_lead_agent


def _build_run_config(
    thread_id: str,
    request_config: dict[str, Any] | None,
    metadata: dict[str, Any] | None,
    *,
    assistant_id: str | None = None,
) -> dict[str, Any]:
    config: dict[str, Any] = {"recursion_limit": 100}

    if request_config:
        if "context" in request_config:
            context_value = request_config["context"]
            if context_value is None:
                config["context"] = {}
            elif isinstance(context_value, Mapping):
                config["context"] = dict(context_value)
            else:
                raise ValueError("request config 'context' must be a mapping or null.")
        else:
            configurable = {"thread_id": thread_id}
            configurable.update(request_config.get("configurable", {}))
            config["configurable"] = configurable

        for key, value in request_config.items():
            if key not in ("configurable", "context"):
                config[key] = value
    else:
        config["configurable"] = {"thread_id": thread_id}

    if assistant_id and assistant_id != _DEFAULT_ASSISTANT_ID:
        normalized = assistant_id.strip().lower().replace("_", "-")
        if not normalized or not re.fullmatch(r"[a-z0-9-]+", normalized):
            raise ValueError(f"Invalid assistant_id {assistant_id!r}: must contain only letters, digits, and hyphens after normalization.")

        if "configurable" in config:
            target = config["configurable"]
        elif "context" in config:
            target = config["context"]
        else:
            target = config.setdefault("configurable", {})

        if isinstance(target, dict) and "agent_name" not in target:
            target["agent_name"] = normalized

    if metadata:
        config.setdefault("metadata", {}).update(metadata)

    return config


@dataclass(slots=True)
class RunService:
    stream_bridge: StreamBridge
    run_manager: RunManager
    run_context: RunContext

    async def build_stream_response(self, body: RunCreateRequest, request: Request) -> StreamingResponse:
        thread_id = _resolve_thread_id(body)
        record = await self._start_run(body, thread_id, request)
        return StreamingResponse(
            self._sse_consumer(record, request),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
                "Content-Location": f"/api/threads/{thread_id}/runs/{record.run_id}",
            },
        )

    async def _start_run(self, body: RunCreateRequest, thread_id: str, request: Request) -> RunRecord:
        disconnect = DisconnectMode.cancel if body.on_disconnect == "cancel" else DisconnectMode.continue_

        try:
            record = await self.run_manager.create_or_reject(
                thread_id,
                body.assistant_id,
                on_disconnect=disconnect,
                metadata=body.metadata or {},
                kwargs={"input": body.input, "config": body.config},
                multitask_strategy=body.multitask_strategy,
            )
        except ConflictError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except UnsupportedStrategyError as exc:
            raise HTTPException(status_code=501, detail=str(exc)) from exc

        await self._sync_thread_metadata(thread_id, body)

        try:
            task = self._create_run_task(record, body, thread_id, request)
        except ValueError as exc:
            await self.run_manager.set_status(record.run_id, RunStatus.error, error=str(exc))
            await self.stream_bridge.publish(record.run_id, "error", {"message": str(exc)})
            await self.stream_bridge.publish_end(record.run_id)
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        record.task = task
        return record

    async def _sync_thread_metadata(self, thread_id: str, body: RunCreateRequest) -> None:
        thread_store = getattr(self.run_context, "thread_store", None)
        if thread_store is None:
            return

        try:
            existing = await thread_store.get(thread_id, user_id=None)
            if existing is None:
                await thread_store.create(
                    thread_id,
                    user_id=None,
                    assistant_id=body.assistant_id,
                    metadata=body.metadata,
                )
            else:
                await thread_store.update_status(thread_id, "running", user_id=None)
        except Exception:
            logger.warning("Failed to sync thread metadata for %s", thread_id, exc_info=True)

    def _create_run_task(self, record: RunRecord, body: RunCreateRequest, thread_id: str, request: Request) -> asyncio.Task:
        agent_factory = _resolve_agent_factory()
        graph_input = _normalize_input(body.input)
        config = _build_run_config(thread_id, body.config, body.metadata, assistant_id=body.assistant_id)
        _merge_run_context_overrides(config, body.context)
        _inject_authenticated_user_context(config, request)
        stream_modes = _normalize_stream_modes(body.stream_mode)

        return asyncio.create_task(
            run_agent(
                self.stream_bridge,
                self.run_manager,
                record,
                ctx=self.run_context,
                agent_factory=agent_factory,
                graph_input=graph_input,
                config=config,
                stream_modes=stream_modes,
                stream_subgraphs=body.stream_subgraphs,
                interrupt_before=body.interrupt_before,
                interrupt_after=body.interrupt_after,
            )
        )

    async def _sse_consumer(self, record: RunRecord, request: Request):
        last_event_id = request.headers.get("Last-Event-ID")
        try:
            async for entry in self.stream_bridge.subscribe(record.run_id, last_event_id=last_event_id):
                if await request.is_disconnected():
                    break

                if entry is HEARTBEAT_SENTINEL:
                    yield ": heartbeat\n\n"
                    continue

                if entry is END_SENTINEL:
                    yield _format_sse("end", None, event_id=entry.id or None)
                    return

                yield _format_sse(entry.event, entry.data, event_id=entry.id or None)
        finally:
            if record.status in (RunStatus.pending, RunStatus.running):
                if record.on_disconnect == DisconnectMode.cancel:
                    await self.run_manager.cancel(record.run_id)
