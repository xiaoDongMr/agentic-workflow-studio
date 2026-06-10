from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from app.schemas.workflow import WorkflowDocument, WorkflowEdge, WorkflowNode
from app.services.workflow_events import workflow_event_context
from app.workflow.state import WorkflowState

LOOP_BODY_CONTROL_NODE_TYPES = {"loop-start", "loop-end"}
FORBIDDEN_LOOP_BODY_NODE_TYPES = {"loop"}


@dataclass(frozen=True)
class LoopBodyWorkflow:
    workflow: WorkflowDocument
    entry_node_id: str | None


@dataclass(frozen=True)
class CompiledLoopBody:
    graph: Any | None
    workflow: WorkflowDocument
    entry_node_id: str | None

    @property
    def has_nodes(self) -> bool:
        return bool(self.workflow.nodes)


class LoopSubgraphRuntime:
    def __init__(
        self,
        *,
        compile_workflow: Callable[..., Any],
        run_compiled_from_state: Callable[[Any, WorkflowState], Awaitable[WorkflowState]],
    ) -> None:
        self._compile_workflow = compile_workflow
        self._run_compiled_from_state = run_compiled_from_state

    def compile_loop_body(self, loop_node: WorkflowNode) -> CompiledLoopBody:
        body = build_loop_body_workflow(loop_node)
        compiled = (
            self._compile_workflow(body.workflow, entry_node_id=body.entry_node_id)
            if body.workflow.nodes
            else None
        )
        return CompiledLoopBody(
            graph=compiled,
            workflow=body.workflow,
            entry_node_id=body.entry_node_id,
        )

    async def run_iteration(
        self,
        compiled_body: CompiledLoopBody,
        state: WorkflowState,
        *,
        event_context: dict[str, Any] | None = None,
    ) -> WorkflowState:
        if not compiled_body.graph:
            return state
        with workflow_event_context(event_context or {}):
            return await self._run_compiled_from_state(compiled_body.graph, state)


def build_loop_body_workflow(loop_node: WorkflowNode) -> LoopBodyWorkflow:
    body_nodes = parse_body_nodes(loop_node)
    ensure_no_forbidden_loop_body_nodes(body_nodes)
    body_edges = parse_body_edges(loop_node)
    real_nodes, real_edges, entry_node_id = normalize_loop_body_for_subgraph(loop_node.id, body_nodes, body_edges)
    workflow = WorkflowDocument(
        id=f"{loop_node.id}-loop-body",
        name=f"{loop_node.title} 循环体",
        description=f"{loop_node.title} 的循环体子图",
        nodes=real_nodes,
        edges=real_edges,
    )
    return LoopBodyWorkflow(workflow=workflow, entry_node_id=entry_node_id)


def parse_body_nodes(loop_node: WorkflowNode) -> list[WorkflowNode]:
    return [WorkflowNode.model_validate(item) for item in loop_node.config.loopBodyNodes]


def parse_body_edges(loop_node: WorkflowNode) -> list[WorkflowEdge]:
    return [WorkflowEdge.model_validate(item) for item in loop_node.config.loopBodyEdges]


def normalize_loop_body_for_subgraph(
    loop_node_id: str,
    nodes: list[WorkflowNode],
    edges: list[WorkflowEdge],
) -> tuple[list[WorkflowNode], list[WorkflowEdge], str | None]:
    control_ids = {node.id for node in nodes if node.type in LOOP_BODY_CONTROL_NODE_TYPES}
    real_nodes = [node for node in nodes if node.id not in control_ids]
    real_node_ids = {node.id for node in real_nodes}
    entry_node_id = find_loop_body_entry(loop_node_id, real_nodes, edges, control_ids)
    real_edges = [
        edge
        for edge in edges
        if edge.source in real_node_ids and edge.target in real_node_ids
    ]
    return real_nodes, real_edges, entry_node_id


def find_loop_body_entry(
    loop_node_id: str,
    real_nodes: list[WorkflowNode],
    edges: list[WorkflowEdge],
    control_ids: set[str],
) -> str | None:
    real_node_ids = {node.id for node in real_nodes}
    for edge in edges:
        if edge.source in control_ids | {loop_node_id} and edge.target in real_node_ids:
            return edge.target

    incoming = {
        edge.target
        for edge in edges
        if edge.source in real_node_ids and edge.target in real_node_ids
    }
    for node in real_nodes:
        if node.id not in incoming:
            return node.id

    return real_nodes[0].id if real_nodes else None


def ensure_no_forbidden_loop_body_nodes(nodes: list[WorkflowNode]) -> None:
    if any(node.type in FORBIDDEN_LOOP_BODY_NODE_TYPES for node in nodes):
        raise ValueError("循环体内不能再添加循环节点")
