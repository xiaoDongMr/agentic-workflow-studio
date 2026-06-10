from __future__ import annotations

from typing import Any

from deerflow.config.app_config import AppConfig

from app.schemas.workflow import WorkflowNode
from app.workflow.engine.subworkflow import LoopSubgraphRuntime
from app.workflow.services.input_mapping import (
    get_by_path,
    parse_literal_mapping_value,
    resolve_mapping,
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
        items = resolve_loop_items(node, node_input, state)
        shared = resolve_intermediate_variables(node, state)
        output_refs = node.config.loopOutputs
        aggregated_outputs: dict[str, list[Any]] = {
            str(output.get("name") or output.get("fieldPath") or f"result_{index + 1}"): []
            for index, output in enumerate(output_refs)
        }
        results: list[dict[str, Any]] = []

        for index, item in enumerate(items):
            body_state = build_loop_iteration_state(state, item, index, shared)
            body_state = await self._subgraph_runtime.run_iteration(
                compiled_body,
                body_state,
                event_context={
                    "scope": "loop-body",
                    "loopNodeId": node.id,
                    "iterationIndex": index,
                },
            )
            shared = update_shared_variables(shared, body_state)
            iteration_output = collect_iteration_outputs(output_refs, body_state)
            for key, value in iteration_output.items():
                aggregated_outputs.setdefault(key, []).append(value)
            results.append({
                "index": index,
                "item": item,
                "output": body_state.get("output", {}),
                "collected": iteration_output,
            })

        output_key = node.config.outputKey or "loop_results"
        output: dict[str, Any] = {
            output_key: aggregated_outputs or results,
            "count": len(items),
            "results": results,
            "shared": shared,
        }
        output.update(aggregated_outputs)
        return output


def resolve_loop_items(node: WorkflowNode, node_input: dict[str, Any], state: WorkflowState) -> list[Any]:
    if node.config.loopMode == "count":
        return list(range(max(node.config.loopCount, 0)))

    value: Any = None
    if node.config.loopArraySource:
        value = resolve_mapping(node.config.loopArraySource, state)
    if value is None:
        value = next((item for item in node_input.values() if isinstance(item, list)), None)
    if value is None:
        value = next(iter(node_input.values()), [])
    if isinstance(value, list):
        return value
    if value is None:
        return []
    return [value]


def resolve_intermediate_variables(node: WorkflowNode, state: WorkflowState) -> dict[str, Any]:
    shared: dict[str, Any] = {}
    for variable in node.config.loopIntermediateVariables:
        name = str(variable.get("name") or "").strip()
        if not name:
            continue
        source = variable.get("source", "")
        if variable.get("sourceType") == "node":
            shared[name] = resolve_mapping(str(source), state)
        else:
            value_type = str(variable.get("type") or variable.get("valueType") or "")
            shared[name] = parse_literal_mapping_value(source, value_type)
    return shared


def build_loop_iteration_state(
    state: WorkflowState,
    item: Any,
    index: int,
    shared: dict[str, Any],
) -> WorkflowState:
    return {
        "input": build_loop_body_input(state, item, index, shared),
        "variables": {
            **state.get("variables", {}),
            "item": item,
            "index": index,
            "shared": shared,
            "__loop": {"item": item, "index": index, "shared": shared},
        },
        "steps": [],
        "output": {},
    }


def build_loop_body_input(state: WorkflowState, item: Any, index: int, shared: dict[str, Any]) -> dict[str, Any]:
    run_input = state.get("input", {})
    base_input = dict(run_input) if isinstance(run_input, dict) else {"input": run_input}
    return {
        **base_input,
        "item": item,
        "index": index,
        "shared": shared,
        "__loop": {"item": item, "index": index, "shared": shared},
    }


def update_shared_variables(shared: dict[str, Any], state: WorkflowState) -> dict[str, Any]:
    next_shared = dict(shared)
    output = state.get("output", {})
    if isinstance(output.get("shared"), dict):
        next_shared.update(output["shared"])
    for key in list(next_shared):
        if key in output:
            next_shared[key] = output[key]
    return next_shared


def collect_iteration_outputs(output_refs: list[dict[str, Any]], state: WorkflowState) -> dict[str, Any]:
    collected: dict[str, Any] = {}
    for index, output_ref in enumerate(output_refs):
        output_name = str(output_ref.get("name") or output_ref.get("fieldPath") or f"result_{index + 1}")
        node_id = str(output_ref.get("nodeId") or "")
        field_path = str(output_ref.get("fieldPath") or "")
        node_output = state.get("variables", {}).get(node_id)
        collected[output_name] = get_by_path(node_output, field_path) if field_path else node_output
    return collected
