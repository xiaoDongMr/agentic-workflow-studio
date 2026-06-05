from __future__ import annotations

from typing import Any

from app.schemas.workflow import WorkflowNode
from app.workflow.state import WorkflowState


class CodeNodeExecutor:
    async def run(self, node: WorkflowNode, node_input: dict[str, Any], state: WorkflowState) -> dict[str, Any]:
        result = safe_exec(node.config.prompt, node_input, state.get("variables", {}))
        return {node.config.outputKey or "result": result}


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
