from __future__ import annotations

from typing import Any

from deerflow.config.app_config import AppConfig

from app.schemas.workflow import WorkflowNode
from app.workflow.engine.subworkflow import LoopSubgraphRuntime
from app.workflow.services.input_mapping import (
    get_by_path,
)
from app.workflow.state import WorkflowState


class LoopNodeExecutor:
    def __init__(self, app_config: AppConfig | None = None):
        self._app_config = app_config
        self._subgraph_runtime: LoopSubgraphRuntime | None = None

    def configure_subgraph_runtime(self, runtime: LoopSubgraphRuntime) -> None:
        self._subgraph_runtime = runtime

    async def run(self, node: WorkflowNode, node_input: dict[str, Any], state: WorkflowState) -> dict[str, Any]:
        if self._subgraph_runtime is None:
            raise RuntimeError("循环子图运行器未初始化")
        compiled_body = self._subgraph_runtime.compile_loop_body(node)
        items = resolve_loop_items(node, node_input)
        output_refs = node.config.loopOutputs
        aggregated_outputs: dict[str, list[Any]] = {
            (output.name or output.fieldPath or f"result_{index + 1}"): []
            for index, output in enumerate(output_refs)
        }

        for index, item in enumerate(items):
            body_state = build_loop_iteration_state(node, state, item, index)
            body_state = await self._subgraph_runtime.run_iteration(
                compiled_body,
                body_state,
                event_context={
                    "scope": "loop-body",
                    "loopNodeId": node.id,
                    "iterationIndex": index,
                    "iterationRunId": f"{node.id}:{index}",
                },
            )
            iteration_output = collect_iteration_outputs(output_refs, body_state)
            for key, value in iteration_output.items():
                aggregated_outputs.setdefault(key, []).append(value)

        return aggregated_outputs


def resolve_loop_items(node: WorkflowNode, node_input: dict[str, Any]) -> list[Any]:
    if node.config.loopMode == "count":
        return list(range(max(node.config.loopCount, 0)))

    array_field = (node.inputs[0].name.strip() if node.inputs else "") or "items"
    value: Any = node_input.get(array_field)
    if isinstance(value, list):
        return value
    if value is None:
        raise ValueError(f"循环节点输入 {array_field} 未获取到数组，请检查循环数组来源")
    raise ValueError(f"循环节点输入 {array_field} 必须是数组")


def build_loop_iteration_state(
    node: WorkflowNode,
    state: WorkflowState,
    item: Any,
    index: int,
) -> WorkflowState:
    loop_entry = build_loop_entry_variables(node, item, index)
    return {
        "workflow": state.get("workflow", {}),
        "input": build_loop_body_input(state, loop_entry, index),
        "variables": {
            **state.get("variables", {}),
            node.id: loop_entry,
            "index": index,
            **({"item": item} if node.config.loopMode == "array" else {}),
        },
        "steps": [],
        "output": {},
    }


def build_loop_entry_variables(
    node: WorkflowNode,
    item: Any,
    index: int,
) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "index": index,
    }
    if node.config.loopMode == "array":
        entry["item"] = item
    return entry


def build_loop_body_input(
    state: WorkflowState,
    loop_entry: dict[str, Any],
    index: int,
) -> dict[str, Any]:
    run_input = state.get("input", {})
    base_input = dict(run_input) if isinstance(run_input, dict) else {"input": run_input}
    return {
        **base_input,
        **loop_entry,
        "index": index,
    }


def collect_iteration_outputs(output_refs: list[Any], state: WorkflowState) -> dict[str, Any]:
    collected: dict[str, Any] = {}
    for index, output_ref in enumerate(output_refs):
        output_name = output_ref.name or output_ref.fieldPath or f"result_{index + 1}"
        node_id = output_ref.nodeId
        field_path = output_ref.fieldPath
        node_output = state.get("variables", {}).get(node_id)
        collected[output_name] = get_by_path(node_output, field_path) if field_path else node_output
    return collected
