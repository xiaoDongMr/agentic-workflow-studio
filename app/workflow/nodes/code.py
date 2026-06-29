from __future__ import annotations

from typing import Any

from app.schemas.workflow import WorkflowNode
from app.workflow.services.error_policy import (
    emit_error_strategy_event,
    emit_retry_event,
    fallback_output,
    ignored_output,
    retry_attempts,
)
from app.workflow.state import WorkflowState


class CodeNodeExecutor:
    async def run(self, node: WorkflowNode, node_input: dict[str, Any], state: WorkflowState) -> dict[str, Any]:
        attempts = retry_attempts(node)
        last_error: Exception | None = None
        for attempt in range(1, attempts + 1):
            try:
                result = safe_exec(node.config.prompt, node_input, state.get("variables", {}))
                return {node.config.outputKey or "result": result}
            except Exception as exc:
                last_error = exc
                if attempt < attempts:
                    emit_retry_event(node, attempt=attempt, attempts=attempts, error=exc, title="代码执行重试")

        error = last_error or RuntimeError("代码执行失败")
        if node.config.errorStrategy == "fallback":
            emit_error_strategy_event(node, strategy="fallback", error=error)
            return fallback_output(node)
        if node.config.errorStrategy == "ignore":
            emit_error_strategy_event(node, strategy="ignore", error=error)
            return ignored_output(node)
        emit_error_strategy_event(node, strategy="interrupt", error=error)
        raise error


def safe_exec(code: str, node_input: dict[str, Any], variables: dict[str, Any]) -> Any:
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
