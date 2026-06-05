from __future__ import annotations

import base64
import mimetypes
import json
import logging
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Literal, Protocol, TypedDict
from urllib.parse import unquote, urlparse
from urllib.request import urlopen

from deerflow.config.app_config import AppConfig

from app.schemas.workflow import WorkflowNode, WorkflowRunStep
from app.services.workflow_llm import (
    DeerFlowModelProvider,
    LlmInvokeRequest,
    LlmInvokeResult,
    VisionInput,
    build_llm_request,
)
from app.services.workflow_events import build_workflow_event, emit_workflow_event
from app.services.selector_engine import selector_engine

logger = logging.getLogger(__name__)


class WorkflowState(TypedDict, total=False):
    input: dict[str, Any]
    variables: dict[str, Any]
    steps: list[dict[str, Any]]
    output: dict[str, Any]


class WorkflowRunEvent(TypedDict):
    type: Literal["metadata", "workflow_event", "step", "final", "error"]
    data: dict[str, Any]


class WorkflowNodeExecutor(Protocol):
    async def run(
        self,
        node: WorkflowNode,
        node_input: dict[str, Any],
        state: WorkflowState,
    ) -> dict[str, Any]:
        ...


def _normalize_value_type(value_type: str) -> str:
    normalized = value_type.strip().lower()
    if normalized.startswith("array<") and normalized.endswith(">"):
        return "array"
    aliases = {
        "str": "string",
        "string": "string",
        "int": "integer",
        "integer": "integer",
        "float": "number",
        "number": "number",
        "bool": "boolean",
        "boolean": "boolean",
        "time": "time",
        "date": "time",
        "datetime": "time",
        "object": "object",
        "json": "object",
        "array": "array",
        "list": "array",
    }
    return aliases.get(normalized, normalized or "string")


def _array_item_type(value_type: str) -> str | None:
    value_type = value_type.strip()
    if value_type.lower().startswith("array<") and value_type.endswith(">"):
        return value_type[6:-1].strip() or None
    return None


def _parse_json_if_string(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    stripped = value.strip()
    if not stripped:
        return value
    if not ((stripped.startswith("{") and stripped.endswith("}")) or (stripped.startswith("[") and stripped.endswith("]"))):
        return value
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        return value


def _convert_value(value: Any, value_type: str) -> Any:
    normalized_type = _normalize_value_type(value_type)
    if value is None:
        return None
    if normalized_type == "string":
        return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    if normalized_type == "integer":
        if isinstance(value, bool):
            return int(value)
        return int(float(value))
    if normalized_type == "number":
        return float(value)
    if normalized_type == "boolean":
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return value != 0
        if isinstance(value, str):
            return value.strip().lower() in {"true", "1", "yes", "y", "on", "是"}
        return bool(value)
    if normalized_type == "time":
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, str):
            datetime.fromisoformat(value.replace("Z", "+00:00"))
            return value
        raise ValueError(f"无法将 {value!r} 转换为 Time")
    if normalized_type == "object":
        parsed = _parse_json_if_string(value)
        if isinstance(parsed, dict):
            return parsed
        raise ValueError(f"无法将 {value!r} 转换为 Object")
    if normalized_type == "array":
        parsed = _parse_json_if_string(value)
        items = parsed if isinstance(parsed, list) else [parsed]
        item_type = _array_item_type(value_type)
        if item_type:
            return [_convert_value(item, item_type) for item in items]
        return items
    return value


def _coerce_by_io_definitions(values: dict[str, Any], io_definitions: list[Any]) -> dict[str, Any]:
    next_values = dict(values)
    for item in io_definitions:
        field_name = getattr(item, "name", "")
        if not field_name or field_name not in next_values:
            continue
        next_values[field_name] = _convert_value(next_values[field_name], getattr(item, "type", "string"))
    return next_values


def _extract_message_content(payload: dict[str, Any]) -> str:
    if isinstance(payload.get("userInput"), str):
        return payload["userInput"]
    message = payload.get("message")
    if isinstance(message, dict) and isinstance(message.get("content"), str):
        return message["content"]
    if isinstance(payload.get("content"), str):
        return payload["content"]
    return json.dumps(payload, ensure_ascii=False)


def _get_by_path(value: Any, path: str) -> Any:
    current = value
    if isinstance(current, dict) and path in current:
        return current.get(path)
    for part in path.split("."):
        if isinstance(current, dict):
            current = current.get(part)
        else:
            return None
    return current


def _resolve_mapping(source: str, state: WorkflowState) -> Any:
    if "." not in source:
        return state.get("variables", {}).get(source)
    node_id, key = source.split(".", 1)
    node_value = state.get("variables", {}).get(node_id)
    if isinstance(node_value, dict):
        return _get_by_path(node_value, key)
    return None


def _build_mapped_values(mappings: list[Any], state: WorkflowState) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for mapping in mappings:
        if not mapping.field:
            continue
        if mapping.sourceType == "context":
            result[mapping.field] = _get_by_path(state.get("input", {}), mapping.source)
        elif mapping.sourceType == "node":
            result[mapping.field] = _resolve_mapping(mapping.source, state)
        else:
            result[mapping.field] = _parse_literal_mapping_value(mapping.source, getattr(mapping, "valueType", ""))
    return result


def _parse_literal_mapping_value(source: Any, value_type: str) -> Any:
    if not isinstance(source, str) or not value_type.startswith("Array<"):
        return source
    text = source.strip()
    if not text:
        return []
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return parsed
    except json.JSONDecodeError:
        pass
    return [item.strip() for item in text.split(",") if item.strip()]


def _is_vision_value_type(value_type: str) -> bool:
    normalized = value_type.strip().lower()
    return normalized in {"image", "video", "array<image>", "array<video>"}


def _vision_kind(value_type: str) -> str:
    return "video" if "video" in value_type.strip().lower() else "image"


def _collect_media_urls(value: Any) -> list[str]:
    urls: list[str] = []

    def visit(item: Any) -> None:
        if isinstance(item, str):
            text = item.strip()
            if text:
                urls.append(text)
        elif isinstance(item, dict):
            candidate = item.get("url") or item.get("src")
            if isinstance(candidate, str) and candidate.strip():
                urls.append(candidate.strip())
        elif isinstance(item, list):
            for sub in item:
                visit(sub)

    visit(value)
    return urls


def _media_url_to_data_url(url: str, app_config: AppConfig | None) -> str:
    if url.startswith("data:"):
        return url
    data, mime_type = _read_media_bytes(url, app_config)
    return f"data:{mime_type};base64,{base64.b64encode(data).decode('utf-8')}"


def _read_media_bytes(url: str, app_config: AppConfig | None) -> tuple[bytes, str]:
    local_path = _resolve_local_storage_url(url, app_config)
    if local_path is not None:
        data = local_path.read_bytes()
        mime_type = mimetypes.guess_type(local_path.name)[0] or "application/octet-stream"
        return data, mime_type

    with urlopen(url, timeout=20) as response:
        data = response.read()
        mime_type = response.headers.get_content_type() or mimetypes.guess_type(urlparse(url).path)[0] or "application/octet-stream"
        return data, mime_type


def _resolve_local_storage_url(url: str, app_config: AppConfig | None) -> Path | None:
    if app_config is None:
        return None
    storage_config = app_config.object_storage
    public_prefix = storage_config.public_url_prefix.rstrip("/")
    parsed = urlparse(url)
    path = unquote(parsed.path)
    if not path.startswith(f"{public_prefix}/"):
        return None

    root = Path(storage_config.local_dir).expanduser()
    if not root.is_absolute():
        root = Path.cwd() / root
    root = root.resolve()
    relative_path = path[len(public_prefix) + 1:]
    target = (root / relative_path).resolve()
    if not target.is_file() or root not in target.parents:
        raise FileNotFoundError(f"视觉输入文件不存在: {url}")
    return target


def _build_node_input(node: WorkflowNode, state: WorkflowState) -> dict[str, Any]:
    result = _build_mapped_values(node.config.inputMappings, state)
    if not result:
        result["input"] = state.get("input", {})
    return _coerce_by_io_definitions(result, node.inputs)


def _store_node_output(node: WorkflowNode, state: WorkflowState, node_output: dict[str, Any]) -> WorkflowState:
    node_output = _coerce_by_io_definitions(node_output, node.outputs)
    variables = dict(state.get("variables", {}))
    variables[node.id] = node_output
    output_key = node.config.outputKey or "output"
    if output_key in node_output:
        variables[output_key] = node_output[output_key]
    else:
        variables[output_key] = node_output
    return {**state, "variables": variables, "output": node_output}


def _append_step(
    node: WorkflowNode,
    state: WorkflowState,
    node_input: dict[str, Any],
    node_output: dict[str, Any],
    duration_ms: int,
    *,
    error: str | None = None,
) -> WorkflowState:
    steps = list(state.get("steps", []))
    steps.append(
        WorkflowRunStep(
            nodeId=node.id,
            nodeTitle=node.title,
            log=error or f"{node.title} 执行完成",
            input=node_input,
            output=node_output,
            durationMs=duration_ms,
            status="error" if error else "success",
            error=error,
        ).model_dump()
    )
    return {**state, "steps": steps}


def _model_name(node: WorkflowNode, app_config: AppConfig | None) -> str | None:
    if app_config is None:
        return node.config.model or None
    configured_names = {model.name for model in app_config.models}
    return node.config.model if node.config.model in configured_names else None


def _safe_exec(code: str, node_input: dict[str, Any], variables: dict[str, Any]) -> Any:
    local_vars: dict[str, Any] = {"input": node_input, "variables": variables, "result": None}
    safe_builtins = {
        "all": all,
        "any": any,
        "bool": bool,
        "dict": dict,
        "enumerate": enumerate,
        "float": float,
        "int": int,
        "len": len,
        "list": list,
        "max": max,
        "min": min,
        "range": range,
        "str": str,
        "sum": sum,
    }
    exec(code, {"__builtins__": safe_builtins}, local_vars)
    return local_vars.get("result")


class StartNodeExecutor:
    async def run(self, node: WorkflowNode, node_input: dict[str, Any], state: WorkflowState) -> dict[str, Any]:
        run_input = state.get("input", {})
        outputs = [output for output in node.outputs if output.name]
        if outputs:
            if len(outputs) == 1 and outputs[0].name not in run_input:
                return {outputs[0].name: _extract_message_content(run_input)}
            return {output.name: run_input.get(output.name) for output in outputs}
        return {node.config.outputKey or "query": _extract_message_content(state.get("input", {}))}


class LlmNodeExecutor:
    def __init__(self, app_config: AppConfig | None):
        self.app_config = app_config
        self.model_provider = DeerFlowModelProvider(app_config)

    async def run(self, node: WorkflowNode, node_input: dict[str, Any], state: WorkflowState) -> dict[str, Any]:
        request = build_llm_request(
            node_id=node.id,
            node_title=node.title,
            model=_model_name(node, self.app_config),
            system_prompt_template=node.config.systemPrompt or node.config.prompt or "",
            user_prompt_template=node.config.userPrompt or "{{input}}",
            node_input=node_input,
            variables=state.get("variables", {}),
            run_input=state.get("input", {}),
            temperature=node.config.temperature,
            max_tokens=node.config.maxTokens,
            timeout_seconds=node.config.timeoutSeconds,
            thinking_enabled=node.config.thinkingEnabled,
            reasoning_effort=node.config.reasoningEffort,
            vision_inputs=self._build_vision_inputs(node, node_input),
        )
        result = await self._invoke_with_policy(node, request)
        return self._format_output(node, result.content, result.reasoning_content)

    def _build_vision_inputs(
        self,
        node: WorkflowNode,
        node_input: dict[str, Any],
    ) -> list[VisionInput]:
        vision_inputs: list[VisionInput] = []
        for item in node.inputs:
            if not item.name or item.name not in node_input or not _is_vision_value_type(item.type):
                continue
            urls = _collect_media_urls(node_input[item.name])
            if not urls:
                continue
            if node.config.visionInputAsBase64:
                urls = [_media_url_to_data_url(url, self.app_config) for url in urls]
            vision_inputs.append(
                VisionInput(
                    name=item.name,
                    kind=_vision_kind(item.type),
                    urls=tuple(urls),
                )
            )
        return vision_inputs

    async def _invoke_with_policy(self, node: WorkflowNode, request: LlmInvokeRequest) -> LlmInvokeResult:
        retry_count = min(max(node.config.retryCount, 0), 10)
        attempts = retry_count + 1
        last_error: Exception | None = None
        for attempt in range(1, attempts + 1):
            try:
                return await self.model_provider.invoke(request)
            except Exception as exc:
                last_error = exc
                if attempt < attempts:
                    emit_workflow_event(build_workflow_event(
                        "llm_retry",
                        node_id=node.id,
                        node_title=node.title,
                        level="warning",
                        title="模型调用重试",
                        message=f"第 {attempt}/{attempts} 次调用失败，准备重试：{exc}",
                        error=str(exc),
                        data={"attempt": attempt, "maxAttempts": attempts},
                    ))
                else:
                    emit_workflow_event(build_workflow_event(
                        "node_log",
                        node_id=node.id,
                        node_title=node.title,
                        level="warning",
                        title="重试次数已用尽",
                        message=f"模型调用在 {attempts} 次尝试后仍然失败：{exc}",
                        error=str(exc),
                        data={"attempt": attempt, "maxAttempts": attempts},
                    ))
                logger.error(
                    "节点 %s(%s) 大模型调用失败（第 %d/%d 次）: %s: %s",
                    node.id,
                    node.type,
                    attempt,
                    attempts,
                    type(exc).__name__,
                    exc,
                )

        if node.config.errorStrategy == "fallback":
            logger.info("节点 %s 调用失败，使用兜底输出", node.id)
            emit_workflow_event(build_workflow_event(
                "node_log",
                node_id=node.id,
                node_title=node.title,
                level="warning",
                title="使用兜底输出",
                message="模型调用失败，已按策略使用兜底输出",
            ))
            return LlmInvokeResult(content=node.config.fallbackOutput or "", reasoning_content="")
        if node.config.errorStrategy == "ignore":
            logger.info("节点 %s 调用失败，按策略忽略", node.id)
            emit_workflow_event(build_workflow_event(
                "node_log",
                node_id=node.id,
                node_title=node.title,
                level="warning",
                title="忽略模型错误",
                message="模型调用失败，已按策略忽略并返回空输出",
            ))
            return LlmInvokeResult(content="", reasoning_content="")
        raise last_error or RuntimeError("大模型调用失败")

    def _format_output(self, node: WorkflowNode, content: str, reasoning_content: str) -> dict[str, Any]:
        output_key = node.config.outputKey or "output"
        reasoning_key = node.config.reasoningKey or "reasoning_content"
        output: dict[str, Any]
        if node.config.responseMode == "json":
            try:
                parsed = json.loads(content)
                output = parsed if isinstance(parsed, dict) else {output_key: parsed}
            except json.JSONDecodeError:
                output = {output_key: content}
        else:
            output = {output_key: content}
        output.setdefault(reasoning_key, reasoning_content)
        return output


class SelectorNodeExecutor:
    async def run(self, node: WorkflowNode, node_input: dict[str, Any], state: WorkflowState) -> dict[str, Any]:
        output_key = node.config.outputKey or "branch"
        result = selector_engine.evaluate(
            node,
            node_input,
            variables=state.get("variables", {}),
            run_input=state.get("input", {}),
        )
        return {output_key: result.branch, "matched": result.matched}


class LoopNodeExecutor:
    async def run(self, node: WorkflowNode, node_input: dict[str, Any], state: WorkflowState) -> dict[str, Any]:
        first_value = next(iter(node_input.values()), [])
        items = first_value if isinstance(first_value, list) else [first_value]
        return {
            node.config.outputKey or "items": items,
            "count": len(items),
            "results": [{"index": index, "item": item} for index, item in enumerate(items)],
        }


class CodeNodeExecutor:
    async def run(self, node: WorkflowNode, node_input: dict[str, Any], state: WorkflowState) -> dict[str, Any]:
        result = _safe_exec(node.config.prompt, node_input, state.get("variables", {}))
        return {node.config.outputKey or "result": result}


class EndNodeExecutor:
    async def run(self, node: WorkflowNode, node_input: dict[str, Any], state: WorkflowState) -> dict[str, Any]:
        if node_input:
            value = next(iter(node_input.values()))
        else:
            value = state.get("output", {})
        return {node.config.outputKey or "final": value}


class FallbackNodeExecutor:
    async def run(self, node: WorkflowNode, node_input: dict[str, Any], state: WorkflowState) -> dict[str, Any]:
        return {"output": node_input}


class WorkflowNodeExecutorRegistry:
    def __init__(self, app_config: AppConfig | None):
        self._fallback = FallbackNodeExecutor()
        self._executors: dict[str, WorkflowNodeExecutor] = {
            "start": StartNodeExecutor(),
            "llm": LlmNodeExecutor(app_config),
            "selector": SelectorNodeExecutor(),
            "loop": LoopNodeExecutor(),
            "code": CodeNodeExecutor(),
            "end": EndNodeExecutor(),
        }

    def get(self, node_type: str) -> WorkflowNodeExecutor:
        return self._executors.get(node_type, self._fallback)

    def make_node_callable(self, node: WorkflowNode):
        async def execute(state: WorkflowState) -> WorkflowState:
            started_at = time.perf_counter()
            node_input = _build_node_input(node, state)
            emit_workflow_event(build_workflow_event(
                "node_started",
                node_id=node.id,
                node_title=node.title,
                title="节点开始执行",
                message=f"{node.title} 执行中",
                data={"inputKeys": list(node_input.keys()), "nodeType": node.type},
            ))
            try:
                executor = self.get(node.type)
                node_output = {"skipped": True} if not node.config.enabled else await executor.run(node, node_input, state)
                node_output = _coerce_by_io_definitions(node_output, node.outputs)
                duration_ms = round((time.perf_counter() - started_at) * 1000)
                next_state = _store_node_output(node, state, node_output)
                emit_workflow_event(build_workflow_event(
                    "node_completed",
                    node_id=node.id,
                    node_title=node.title,
                    title="节点执行完成",
                    message=f"{node.title} 执行完成",
                    duration_ms=duration_ms,
                    data={"outputKeys": list(node_output.keys()), "nodeType": node.type},
                ))
                return _append_step(node, next_state, node_input, node_output, duration_ms)
            except Exception as exc:
                duration_ms = round((time.perf_counter() - started_at) * 1000)
                logger.exception("节点执行失败: id=%s type=%s", node.id, node.type)
                error_output = {"error": str(exc)}
                next_state = _store_node_output(node, state, error_output)
                emit_workflow_event(build_workflow_event(
                    "node_failed",
                    node_id=node.id,
                    node_title=node.title,
                    level="error",
                    title="节点执行失败",
                    message=str(exc),
                    duration_ms=duration_ms,
                    error=str(exc),
                    data={"nodeType": node.type},
                ))
                return _append_step(node, next_state, node_input, error_output, duration_ms, error=str(exc))

        return execute
