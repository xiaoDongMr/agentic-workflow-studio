from __future__ import annotations

import asyncio
import json
import logging
import re
from dataclasses import dataclass
from typing import Any, Protocol

from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.messages import HumanMessage, SystemMessage

from deerflow.config.app_config import AppConfig
from deerflow.models import create_chat_model

from app.services.log_utils import preview_text, summarize_content
from app.services.workflow_events import build_workflow_event, emit_workflow_event

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class VisionInput:
    name: str
    kind: str  # "image" | "video"
    urls: tuple[str, ...]


@dataclass(frozen=True)
class LlmInvokeRequest:
    node_id: str
    node_title: str
    model: str | None
    thinking_enabled: bool
    reasoning_effort: str | None
    system_prompt: str
    user_prompt: str | list[Any]
    temperature: float
    max_tokens: int
    timeout_seconds: int


@dataclass(frozen=True)
class LlmInvokeResult:
    content: str
    reasoning_content: str = ""


class LlmModelProvider(Protocol):
    async def invoke(self, request: LlmInvokeRequest) -> LlmInvokeResult:
        ...


def render_prompt_template(template: str, values: dict[str, Any]) -> str:
    def replace(match: re.Match[str]) -> str:
        path = match.group(1).strip()
        value = _get_by_path(values, path)
        if value is None:
            return ""
        return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)

    return re.sub(r"\{\{\s*([^{}]+?)\s*\}\}", replace, template)


def build_prompt_scope(node_input: dict[str, Any], variables: dict[str, Any], run_input: dict[str, Any]) -> dict[str, Any]:
    return {
        **node_input,
        "input": node_input.get("input", node_input),
        "variables": variables,
        "context": run_input,
    }


def build_llm_request(
    *,
    node_id: str,
    node_title: str,
    model: str | None,
    system_prompt_template: str,
    user_prompt_template: str,
    node_input: dict[str, Any],
    variables: dict[str, Any],
    run_input: dict[str, Any],
    temperature: float,
    max_tokens: int,
    timeout_seconds: int,
    thinking_enabled: bool = False,
    reasoning_effort: str | None = None,
    vision_inputs: list[VisionInput] | None = None,
) -> LlmInvokeRequest:
    scope = build_prompt_scope(node_input, variables, run_input)
    user_template = user_prompt_template or "{{input}}"
    user_prompt = build_user_content(user_template, scope, vision_inputs or [])
    return LlmInvokeRequest(
        node_id=node_id,
        node_title=node_title,
        model=model,
        thinking_enabled=thinking_enabled,
        reasoning_effort=reasoning_effort,
        system_prompt=render_prompt_template(system_prompt_template, scope),
        user_prompt=user_prompt,
        temperature=temperature,
        max_tokens=max_tokens,
        timeout_seconds=max(timeout_seconds, 1),
    )


def _media_content_block(kind: str, url: str) -> dict[str, Any]:
    if kind == "video":
        return {"type": "video_url", "video_url": {"url": url}}
    return {"type": "image_url", "image_url": {"url": url}}


def build_user_content(
    template: str,
    scope: dict[str, Any],
    vision_inputs: list[VisionInput],
) -> str | list[Any]:
    """Render the user prompt, weaving vision media into multimodal content blocks.

    When the template references a vision variable (e.g. ``{{photo}}``) the media is
    inserted at that position; any vision input not referenced in the template is
    appended after the rendered text. Without vision inputs the plain rendered text
    is returned so text-only calls stay unchanged.
    """
    if not vision_inputs:
        return render_prompt_template(template, scope)

    vision_by_name = {item.name: item for item in vision_inputs}
    referenced: set[str] = set()
    blocks: list[Any] = []
    text_buffer = ""

    def flush_text() -> None:
        nonlocal text_buffer
        if text_buffer:
            blocks.append({"type": "text", "text": text_buffer})
            text_buffer = ""

    pattern = re.compile(r"\{\{\s*([^{}]+?)\s*\}\}")
    last_end = 0
    for match in pattern.finditer(template):
        text_buffer += template[last_end:match.start()]
        last_end = match.end()
        path = match.group(1).strip()
        root = _template_root_name(path)
        vision = vision_by_name.get(root)
        if vision is not None:
            referenced.add(vision.name)
            flush_text()
            for url in vision.urls:
                blocks.append(_media_content_block(vision.kind, url))
            continue
        value = _get_by_path(scope, path)
        if value is not None:
            text_buffer += value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)

    text_buffer += template[last_end:]
    flush_text()

    for item in vision_inputs:
        if item.name in referenced:
            continue
        for url in item.urls:
            blocks.append(_media_content_block(item.kind, url))

    if not blocks:
        return ""
    if len(blocks) == 1 and blocks[0].get("type") == "text":
        return blocks[0]["text"]
    return blocks


def _template_root_name(path: str) -> str:
    parts = _parse_template_path(path)
    if parts and isinstance(parts[0], str):
        return parts[0]
    return ""


class DeerFlowModelProvider:
    def __init__(self, app_config: AppConfig | None):
        self.app_config = app_config

    async def invoke(self, request: LlmInvokeRequest) -> LlmInvokeResult:
        model_kwargs: dict[str, Any] = {"temperature": request.temperature}
        if request.max_tokens > 0:
            model_kwargs["max_tokens"] = request.max_tokens
        if request.thinking_enabled and request.reasoning_effort in {"low", "medium", "high"}:
            model_kwargs["reasoning_effort"] = request.reasoning_effort
        logger.info(
            "调用大模型: model=%s thinking_enabled=%s reasoning_effort=%s temperature=%s max_tokens=%s timeout=%ss system=%s user=%s",
            request.model or "(default)",
            request.thinking_enabled,
            request.reasoning_effort,
            request.temperature,
            request.max_tokens,
            request.timeout_seconds,
            preview_text(request.system_prompt),
            summarize_content(request.user_prompt),
        )
        model = create_chat_model(
            name=request.model,
            thinking_enabled=request.thinking_enabled,
            app_config=self.app_config,
            **model_kwargs,
        )
        messages = [
            SystemMessage(content=request.system_prompt),
            HumanMessage(content=request.user_prompt),
        ]
        callbacks = [
            WorkflowLangChainCallbackHandler(
                node_id=request.node_id,
                node_title=request.node_title,
                model=request.model or "(default)",
            )
        ]
        try:
            response = await asyncio.wait_for(
                _invoke_streaming_first(model, messages, callbacks),
                timeout=request.timeout_seconds,
            )
        except asyncio.TimeoutError:
            logger.warning(
                "大模型调用超时: model=%s timeout=%ss",
                request.model or "(default)",
                request.timeout_seconds,
            )
            raise
        except Exception:
            logger.exception("大模型调用失败: model=%s", request.model or "(default)")
            raise
        result = LlmInvokeResult(
            content=_message_text(response),
            reasoning_content=_extract_reasoning_content(response),
        )
        logger.info(
            "大模型返回: model=%s content_len=%d reasoning_len=%d",
            request.model or "(default)",
            len(result.content),
            len(result.reasoning_content),
        )
        return result


class WorkflowLangChainCallbackHandler(BaseCallbackHandler):
    def __init__(self, *, node_id: str, node_title: str, model: str):
        self.node_id = node_id
        self.node_title = node_title
        self.model = model

    def _emit(
        self,
        event_type: Any,
        *,
        level: Any = "info",
        title: str,
        message: str,
        token: str | None = None,
        error: str | None = None,
        data: dict[str, Any] | None = None,
    ) -> None:
        emit_workflow_event(build_workflow_event(
            event_type,
            node_id=self.node_id,
            node_title=self.node_title,
            level=level,
            title=title,
            message=message,
            token=token,
            error=error,
            data={"model": self.model, **(data or {})},
        ))

    def on_chat_model_start(self, serialized: dict[str, Any], messages: list[list[Any]], **kwargs: Any) -> None:
        self._emit(
            "llm_started",
            title="模型调用开始",
            message=f"开始调用模型 {self.model}",
            data={"messageCount": sum(len(item) for item in messages)},
        )

    def on_llm_start(self, serialized: dict[str, Any], prompts: list[str], **kwargs: Any) -> None:
        self._emit(
            "llm_started",
            title="模型调用开始",
            message=f"开始调用模型 {self.model}",
            data={"promptCount": len(prompts)},
        )

    def on_llm_new_token(self, token: str, **kwargs: Any) -> None:
        if not token:
            return
        self._emit(
            "llm_token",
            level="debug",
            title="模型输出片段",
            message=token,
            token=token,
        )

    def on_llm_end(self, response: Any, **kwargs: Any) -> None:
        self._emit(
            "llm_completed",
            title="模型调用完成",
            message=f"模型 {self.model} 调用完成",
        )

    def on_llm_error(self, error: BaseException, **kwargs: Any) -> None:
        self._emit(
            "llm_failed",
            level="error",
            title="模型调用失败",
            message=str(error),
            error=str(error),
        )

    def on_tool_start(self, serialized: dict[str, Any], input_str: str, **kwargs: Any) -> None:
        tool_name = serialized.get("name") or serialized.get("id") or "tool"
        self._emit(
            "tool_started",
            title="工具调用开始",
            message=f"开始调用工具 {tool_name}",
            data={"tool": tool_name, "input": preview_text(input_str)},
        )

    def on_tool_end(self, output: Any, **kwargs: Any) -> None:
        self._emit(
            "tool_completed",
            title="工具调用完成",
            message="工具调用完成",
            data={"output": summarize_content(output)},
        )

    def on_tool_error(self, error: BaseException, **kwargs: Any) -> None:
        self._emit(
            "tool_failed",
            level="error",
            title="工具调用失败",
            message=str(error),
            error=str(error),
        )


async def _invoke_streaming_first(model: Any, messages: list[Any], callbacks: list[Any]) -> Any:
    chunks: list[Any] = []
    try:
        async for chunk in model.astream(messages, config={"callbacks": callbacks}):
            chunks.append(chunk)
    except NotImplementedError:
        return await model.ainvoke(messages, config={"callbacks": callbacks})

    if not chunks:
        return await model.ainvoke(messages, config={"callbacks": callbacks})
    response = chunks[0]
    for chunk in chunks[1:]:
        try:
            response = response + chunk
        except TypeError:
            content = f"{_message_text(response)}{_message_text(chunk)}"
            response = type("WorkflowLlmResponse", (), {"content": content})()
    return response


def _get_by_path(value: Any, path: str) -> Any:
    current = value
    parts = _parse_template_path(path)
    if not parts:
        return None
    for part in parts:
        if isinstance(part, int):
            if not isinstance(current, list):
                return None
            index = part
            current = current[index] if 0 <= index < len(current) else None
        elif isinstance(current, dict):
            current = current.get(part)
        elif isinstance(current, list) and part.isdigit():
            index = int(part)
            current = current[index] if 0 <= index < len(current) else None
        else:
            return None
    return current


def _parse_template_path(path: str) -> list[str | int]:
    tokens: list[str | int] = []
    token = ""
    index = 0
    text = path.strip()

    while index < len(text):
        char = text[index]
        if char == ".":
            if token:
                tokens.append(token)
                token = ""
            index += 1
            continue
        if char == "[":
            if token:
                tokens.append(token)
                token = ""
            end_index = text.find("]", index + 1)
            if end_index == -1:
                return []
            raw_index = text[index + 1:end_index].strip()
            if not raw_index.isdigit():
                return []
            tokens.append(int(raw_index))
            index = end_index + 1
            continue
        token += char
        index += 1

    if token:
        tokens.append(token)
    return tokens


def _message_text(message: Any) -> str:
    content = getattr(message, "content", message)
    if isinstance(content, str):
        return content
    return json.dumps(content, ensure_ascii=False)


def _extract_reasoning_content(message: Any) -> str:
    additional_kwargs = getattr(message, "additional_kwargs", {}) or {}
    response_metadata = getattr(message, "response_metadata", {}) or {}
    for source in (additional_kwargs, response_metadata):
        for key in ("reasoning_content", "reasoningContent", "reasoning"):
            value = source.get(key)
            if isinstance(value, str):
                return value
    return ""
