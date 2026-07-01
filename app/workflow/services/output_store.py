from __future__ import annotations

from typing import Any

from app.schemas.workflow import WorkflowNode, WorkflowRunStep
from app.workflow.state import WorkflowState


def store_node_output(node: WorkflowNode, node_output: dict[str, Any]) -> WorkflowState:
    variables = {node.id: node_output}
    output_key = node.config.outputKey or "output"
    if output_key in node_output:
        variables[output_key] = node_output[output_key]
    else:
        variables[output_key] = node_output
    return {"variables": variables, "output": node_output}


def append_step(
    node: WorkflowNode,
    node_input: dict[str, Any],
    node_output: dict[str, Any],
    duration_ms: int,
    *,
    error: str | None = None,
) -> WorkflowState:
    step = WorkflowRunStep(
        nodeId=node.id,
        nodeTitle=node.title,
        log=error or f"{node.title} 执行完成",
        input=node_input,
        output=node_output,
        durationMs=duration_ms,
        status="error" if error else "success",
        error=error,
    ).model_dump()
    return {"steps": [step]}
