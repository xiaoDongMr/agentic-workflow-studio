from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass
from typing import Any, Protocol

from langchain_core.messages import HumanMessage, SystemMessage

from deerflow.config.app_config import AppConfig
from deerflow.models import create_chat_model


@dataclass(frozen=True)
class LlmInvokeRequest:
    model: str | None
    system_prompt: str
    user_prompt: str
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
    model: str | None,
    system_prompt_template: str,
    user_prompt_template: str,
    node_input: dict[str, Any],
    variables: dict[str, Any],
    run_input: dict[str, Any],
    temperature: float,
    max_tokens: int,
    timeout_seconds: int,
) -> LlmInvokeRequest:
    scope = build_prompt_scope(node_input, variables, run_input)
    user_template = user_prompt_template or "{{input}}"
    return LlmInvokeRequest(
        model=model,
        system_prompt=render_prompt_template(system_prompt_template, scope),
        user_prompt=render_prompt_template(user_template, scope),
        temperature=temperature,
        max_tokens=max_tokens,
        timeout_seconds=max(timeout_seconds, 1),
    )


class DeerFlowModelProvider:
    def __init__(self, app_config: AppConfig | None):
        self.app_config = app_config

    async def invoke(self, request: LlmInvokeRequest) -> LlmInvokeResult:
        model_kwargs: dict[str, Any] = {"temperature": request.temperature}
        if request.max_tokens > 0:
            model_kwargs["max_tokens"] = request.max_tokens
        model = create_chat_model(
            name=request.model,
            thinking_enabled=False,
            app_config=self.app_config,
            **model_kwargs,
        )
        response = await asyncio.wait_for(
            model.ainvoke(
                [
                    SystemMessage(content=request.system_prompt),
                    HumanMessage(content=request.user_prompt),
                ]
            ),
            timeout=request.timeout_seconds,
        )
        return LlmInvokeResult(
            content=_message_text(response),
            reasoning_content=_extract_reasoning_content(response),
        )


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
