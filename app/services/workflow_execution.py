from __future__ import annotations

import json
import time
from typing import Any, Literal, Protocol, TypedDict

from langchain_core.messages import HumanMessage, SystemMessage

from deerflow.config.app_config import AppConfig
from deerflow.models import create_chat_model

from app.schemas.workflow import WorkflowNode, WorkflowRunStep


class WorkflowState(TypedDict, total=False):
    input: dict[str, Any]
    variables: dict[str, Any]
    steps: list[dict[str, Any]]
    output: dict[str, Any]


class WorkflowRunEvent(TypedDict):
    type: Literal["metadata", "step", "final", "error"]
    data: dict[str, Any]


class WorkflowNodeExecutor(Protocol):
    async def run(
        self,
        node: WorkflowNode,
        node_input: dict[str, Any],
        state: WorkflowState,
    ) -> dict[str, Any]:
        ...


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


def _build_node_input(node: WorkflowNode, state: WorkflowState) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for mapping in node.config.inputMappings:
        if not mapping.field:
            continue
        if mapping.sourceType == "context":
            result[mapping.field] = _get_by_path(state.get("input", {}), mapping.source)
        elif mapping.sourceType == "node":
            result[mapping.field] = _resolve_mapping(mapping.source, state)
        else:
            result[mapping.field] = mapping.source
    if not result:
        result["input"] = state.get("input", {})
    return result


def _store_node_output(node: WorkflowNode, state: WorkflowState, node_output: dict[str, Any]) -> WorkflowState:
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
        ).model_dump()
    )
    return {**state, "steps": steps}


def _model_name(node: WorkflowNode, app_config: AppConfig | None) -> str | None:
    if app_config is None:
        return node.config.model or None
    configured_names = {model.name for model in app_config.models}
    return node.config.model if node.config.model in configured_names else None


def _message_text(message: Any) -> str:
    content = getattr(message, "content", message)
    if isinstance(content, str):
        return content
    return json.dumps(content, ensure_ascii=False)


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
        return {node.config.outputKey or "query": _extract_message_content(state.get("input", {}))}


class LlmNodeExecutor:
    def __init__(self, app_config: AppConfig | None):
        self.app_config = app_config

    async def run(self, node: WorkflowNode, node_input: dict[str, Any], state: WorkflowState) -> dict[str, Any]:
        model = create_chat_model(
            name=_model_name(node, self.app_config),
            thinking_enabled=False,
            app_config=self.app_config,
        )
        prompt = node.config.prompt or "请根据输入生成结果。"
        response = await model.ainvoke(
            [
                SystemMessage(content=prompt),
                HumanMessage(content=json.dumps(node_input, ensure_ascii=False)),
            ]
        )
        text = _message_text(response)
        output_key = node.config.outputKey or "text"
        if node.config.responseMode == "json":
            try:
                parsed = json.loads(text)
                return parsed if isinstance(parsed, dict) else {output_key: parsed}
            except json.JSONDecodeError:
                return {output_key: text}
        return {output_key: text}


class SelectorNodeExecutor:
    async def run(self, node: WorkflowNode, node_input: dict[str, Any], state: WorkflowState) -> dict[str, Any]:
        rules = [line.strip() for line in node.config.prompt.splitlines() if "=>" in line]
        payload = json.dumps(node_input, ensure_ascii=False)
        for rule in rules:
            condition, branch = [part.strip() for part in rule.split("=>", 1)]
            if condition and condition in payload:
                return {node.config.outputKey or "branch": branch, "matched": condition}
        return {node.config.outputKey or "branch": "default", "matched": None}


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
            try:
                executor = self.get(node.type)
                node_output = {"skipped": True} if not node.config.enabled else await executor.run(node, node_input, state)
                duration_ms = round((time.perf_counter() - started_at) * 1000)
                next_state = _store_node_output(node, state, node_output)
                return _append_step(node, next_state, node_input, node_output, duration_ms)
            except Exception as exc:
                duration_ms = round((time.perf_counter() - started_at) * 1000)
                error_output = {"error": str(exc)}
                next_state = _store_node_output(node, state, error_output)
                return _append_step(node, next_state, node_input, error_output, duration_ms, error=str(exc))

        return execute
