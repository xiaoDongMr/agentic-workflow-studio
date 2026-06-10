from __future__ import annotations

from typing import Any

from deerflow.config.app_config import AppConfig

from app.schemas.workflow import WorkflowEdge, WorkflowNode
from app.workflow.engine.routing import make_selector_router
from app.workflow.nodes.code import CodeNodeExecutor
from app.workflow.nodes.end import EndNodeExecutor
from app.workflow.nodes.fallback import FallbackNodeExecutor
from app.workflow.nodes.llm import LlmNodeExecutor
from app.workflow.nodes.selector import SelectorNodeExecutor
from app.workflow.nodes.start import StartNodeExecutor
from app.workflow.services.input_mapping import (
    build_node_input,
    get_by_path,
    parse_literal_mapping_value,
    resolve_mapping,
)
from app.workflow.services.output_store import store_node_output
from app.workflow.services.value_casting import coerce_by_io_definitions
from app.workflow.state import WorkflowState


class LoopNodeExecutor:
    def __init__(self, app_config: AppConfig | None = None):
        self._fallback = FallbackNodeExecutor()
        self._executors = {
            "start": StartNodeExecutor(),
            "llm": LlmNodeExecutor(app_config),
            "selector": SelectorNodeExecutor(),
            "code": CodeNodeExecutor(),
            "end": EndNodeExecutor(),
        }

    async def run(self, node: WorkflowNode, node_input: dict[str, Any], state: WorkflowState) -> dict[str, Any]:
        body_nodes = parse_body_nodes(node)
        ensure_no_nested_loop(body_nodes)
        body_edges = parse_body_edges(node)
        items = resolve_loop_items(node, node_input, state)
        shared = resolve_intermediate_variables(node, state)
        output_refs = node.config.loopOutputs
        aggregated_outputs: dict[str, list[Any]] = {
            str(output.get("name") or output.get("fieldPath") or f"result_{index + 1}"): []
            for index, output in enumerate(output_refs)
        }
        results: list[dict[str, Any]] = []

        for index, item in enumerate(items):
            body_state: WorkflowState = {
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
            body_state = await self._run_body(node.id, body_nodes, body_edges, body_state)
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

    async def _run_body(
        self,
        loop_node_id: str,
        body_nodes: list[WorkflowNode],
        body_edges: list[WorkflowEdge],
        state: WorkflowState,
    ) -> WorkflowState:
        if not body_nodes:
            return state

        nodes_by_id = {node.id: node for node in body_nodes}
        outgoing = outgoing_edges_by_source(body_edges, nodes_by_id, loop_node_id)
        current = first_body_node(loop_node_id, body_nodes, body_edges)
        visited = 0
        while current and visited < len(body_nodes):
            visited += 1
            if current.type == "loop-end":
                break
            if current.type != "loop-start":
                node_input = build_node_input(current, state)
                executor = self._executors.get(current.type, self._fallback)
                node_output = {"skipped": True} if not current.config.enabled else await executor.run(current, node_input, state)
                node_output = coerce_by_io_definitions(node_output, current.outputs)
                output_update = store_node_output(current, node_output)
                state = merge_state_update(state, output_update)
            target_edges = outgoing.get(current.id, [])
            if not target_edges:
                break
            next_id = choose_next_node_id(current, target_edges, nodes_by_id, state)
            if next_id == loop_node_id:
                break
            current = nodes_by_id.get(next_id) if next_id else None
        return state


def parse_body_nodes(node: WorkflowNode) -> list[WorkflowNode]:
    return [WorkflowNode.model_validate(item) for item in node.config.loopBodyNodes]


def parse_body_edges(node: WorkflowNode) -> list[WorkflowEdge]:
    return [WorkflowEdge.model_validate(item) for item in node.config.loopBodyEdges]


def ensure_no_nested_loop(nodes: list[WorkflowNode]) -> None:
    if any(node.type == "loop" for node in nodes):
        raise ValueError("循环体内不能再添加循环节点")


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


def merge_state_update(state: WorkflowState, update: WorkflowState) -> WorkflowState:
    return {
        **state,
        "variables": {**state.get("variables", {}), **update.get("variables", {})},
        "output": {**state.get("output", {}), **update.get("output", {})},
        "steps": [*state.get("steps", []), *update.get("steps", [])],
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


def outgoing_edges_by_source(
    edges: list[WorkflowEdge],
    nodes_by_id: dict[str, WorkflowNode],
    loop_node_id: str = "",
) -> dict[str, list[WorkflowEdge]]:
    outgoing: dict[str, list[WorkflowEdge]] = {node_id: [] for node_id in nodes_by_id}
    for edge in edges:
        target_in_body_or_loop = edge.target in nodes_by_id or edge.target == loop_node_id
        if edge.source in nodes_by_id and target_in_body_or_loop:
            outgoing[edge.source].append(edge)
    return outgoing


def choose_next_node_id(
    node: WorkflowNode,
    target_edges: list[WorkflowEdge],
    nodes_by_id: dict[str, WorkflowNode],
    state: WorkflowState,
) -> str:
    if node.type == "selector" and len(target_edges) > 1:
        return make_selector_router(node, target_edges, nodes_by_id)(state)
    return target_edges[0].target


def first_body_node(loop_node_id: str, nodes: list[WorkflowNode], edges: list[WorkflowEdge]) -> WorkflowNode:
    loop_start = next((node for node in nodes if node.type == "loop-start"), None)
    if loop_start:
        return loop_start
    start_edge = next((edge for edge in edges if edge.source == loop_node_id and edge.target in {node.id for node in nodes}), None)
    if start_edge:
        return next((node for node in nodes if node.id == start_edge.target), nodes[0])
    target_ids = {edge.target for edge in edges}
    return next((node for node in nodes if node.id not in target_ids), nodes[0])
