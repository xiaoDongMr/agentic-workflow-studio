from __future__ import annotations

from typing import Any

from app.schemas.workflow import WorkflowNode, WorkflowRunStep
from app.workflow.services.value_casting import coerce_by_io_definitions
from app.workflow.state import WorkflowState


def store_node_output(node: WorkflowNode, state: WorkflowState, node_output: dict[str, Any]) -> WorkflowState:
    node_output = coerce_by_io_definitions(node_output, node.outputs)
    variables = dict(state.get("variables", {}))
    variables[node.id] = node_output
    output_key = node.config.outputKey or "output"
    if output_key in node_output:
        variables[output_key] = node_output[output_key]
    else:
        variables[output_key] = node_output
    return {**state, "variables": variables, "output": node_output}


def append_step(
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
