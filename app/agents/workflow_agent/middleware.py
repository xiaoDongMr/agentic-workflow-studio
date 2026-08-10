from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from typing import Any, override

from langchain.agents.middleware import AgentMiddleware
from langchain_core.messages import ToolMessage
from langgraph.graph import END
from langgraph.prebuilt.tool_node import ToolCallRequest
from langgraph.types import Command

from app.agents.workflow_agent.sandbox import WorkflowSandboxResolver
from app.agents.workflow_agent.schemas import (
    WorkflowClarificationQuestion,
    WorkflowMetadataProposal,
    WorkflowSandboxRequirement,
)
from app.agents.workflow_agent.state import WorkflowAgentState


SANDBOX_TOOL_CAPABILITIES = {
    "run_node_skill": ["python", "filesystem"],
}


def _tool_message(
    request: ToolCallRequest,
    content: str,
    *,
    status: str | None = None,
) -> ToolMessage:
    kwargs: dict[str, Any] = {}
    if status is not None:
        kwargs["status"] = status
    return ToolMessage(
        content=content,
        tool_call_id=str(request.tool_call.get("id") or "missing_tool_call_id"),
        name=str(request.tool_call.get("name") or ""),
        **kwargs,
    )


def _state_from_request(request: ToolCallRequest) -> dict[str, Any]:
    runtime = request.runtime
    state = getattr(runtime, "state", None) if runtime is not None else None
    return state if isinstance(state, dict) else {}


class WorkflowClarificationMiddleware(AgentMiddleware[WorkflowAgentState]):
    state_schema = WorkflowAgentState

    def _handle(self, request: ToolCallRequest) -> Command:
        args = request.tool_call.get("args") or {}
        questions = [
            WorkflowClarificationQuestion.model_validate(item)
            for item in args.get("questions") or []
        ]
        if not questions:
            return Command(
                update={
                    "messages": [
                        _tool_message(
                            request,
                            "Clarification requires at least one question",
                            status="error",
                        )
                    ]
                }
            )
        payload = {
            "summary": str(args.get("summary") or "需要补充关键信息"),
            "questions": [question.model_dump() for question in questions],
        }
        return Command(
            update={
                "messages": [
                    _tool_message(
                        request,
                        json.dumps(payload, ensure_ascii=False),
                    )
                ],
                "workflowClarification": payload,
            },
            goto=END,
        )

    @override
    def wrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], ToolMessage | Command],
    ) -> ToolMessage | Command:
        if request.tool_call.get("name") != "workflow_ask_clarification":
            return handler(request)
        return self._handle(request)

    @override
    async def awrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[
            [ToolCallRequest],
            Awaitable[ToolMessage | Command],
        ],
    ) -> ToolMessage | Command:
        if request.tool_call.get("name") != "workflow_ask_clarification":
            return await handler(request)
        return self._handle(request)


class WorkflowMetadataMiddleware(AgentMiddleware[WorkflowAgentState]):
    state_schema = WorkflowAgentState

    def _handle(self, request: ToolCallRequest) -> Command:
        args = request.tool_call.get("args") or {}
        proposal = WorkflowMetadataProposal.model_validate(args)
        payload = proposal.model_dump()
        return Command(
            update={
                "messages": [
                    _tool_message(
                        request,
                        json.dumps(payload, ensure_ascii=False),
                    )
                ],
                "workflowMetadata": payload,
            },
            goto=END,
        )

    @override
    def wrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], ToolMessage | Command],
    ) -> ToolMessage | Command:
        if request.tool_call.get("name") != "generate_workflow_metadata":
            return handler(request)
        return self._handle(request)

    @override
    async def awrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[
            [ToolCallRequest],
            Awaitable[ToolMessage | Command],
        ],
    ) -> ToolMessage | Command:
        if request.tool_call.get("name") != "generate_workflow_metadata":
            return await handler(request)
        return self._handle(request)


class WorkflowSandboxMiddleware(AgentMiddleware[WorkflowAgentState]):
    state_schema = WorkflowAgentState

    def __init__(self, resolver: WorkflowSandboxResolver | None = None) -> None:
        super().__init__()
        self._resolver = resolver or WorkflowSandboxResolver()

    @staticmethod
    def _requires_sandbox(request: ToolCallRequest) -> bool:
        return request.tool_call.get("name") in {
            "request_workflow_sandbox",
            *SANDBOX_TOOL_CAPABILITIES,
        }

    @override
    def wrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], ToolMessage | Command],
    ) -> ToolMessage | Command:
        if not self._requires_sandbox(request):
            return handler(request)
        return _tool_message(
            request,
            "Workflow sandbox resolution requires asynchronous execution",
            status="error",
        )

    @override
    async def awrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[
            [ToolCallRequest],
            Awaitable[ToolMessage | Command],
        ],
    ) -> ToolMessage | Command:
        if not self._requires_sandbox(request):
            return await handler(request)

        state = _state_from_request(request)
        raw_request = state.get("workflowAssistant") or {}
        raw_workflow = raw_request.get("workflow") or {}
        workflow_id = str(raw_workflow.get("id") or "")
        resolution = await self._resolver.resolve(workflow_id)
        args = request.tool_call.get("args") or {}
        tool_name = str(request.tool_call.get("name") or "")
        requested_capabilities = (
            [str(item) for item in args.get("requested_capabilities") or []]
            if tool_name == "request_workflow_sandbox"
            else SANDBOX_TOOL_CAPABILITIES.get(tool_name, [])
        )
        if resolution.bound:
            active_sandbox = state.get("sandbox") or {}
            if (
                tool_name != "request_workflow_sandbox"
                and active_sandbox.get("sandbox_id") == resolution.sandbox_id
            ):
                return await handler(request)
            payload = {
                "workflowId": resolution.workflow_id,
                "sandboxId": resolution.sandbox_id,
                "sandboxUrl": resolution.sandbox_url,
                "imageId": resolution.image_id,
                "bindingStatus": "bound",
                "requestedCapabilities": requested_capabilities,
            }
            if tool_name != "request_workflow_sandbox":
                payload["instruction"] = (
                    f"Sandbox is ready. Call {tool_name} again to continue."
                )
            return Command(
                update={
                    "messages": [
                        _tool_message(
                            request,
                            json.dumps(payload, ensure_ascii=False),
                        )
                    ],
                    "sandbox": {"sandbox_id": resolution.sandbox_id},
                }
            )

        requirement = WorkflowSandboxRequirement(
            workflowId=resolution.workflow_id or workflow_id,
            reason=str(
                args.get("reason")
                or resolution.reason
                or f"{tool_name} requires a bound workflow sandbox"
            ),
            requestedCapabilities=requested_capabilities,
        )
        return Command(
            update={
                "messages": [
                    _tool_message(
                        request,
                        requirement.model_dump_json(),
                    )
                ],
                "workflowSandboxRequirement": requirement.model_dump(),
            },
            goto=END,
        )


__all__ = [
    "WorkflowClarificationMiddleware",
    "WorkflowMetadataMiddleware",
    "WorkflowSandboxMiddleware",
]
