from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from langchain.tools import tool

from app.agents.workflow_agent.schemas import (
    WorkflowGraphEdgeInput,
    WorkflowGraphInput,
)
from app.schemas.workflow import WorkflowEdge, WorkflowNode

logger = logging.getLogger(__name__)


def make_update_current_graph_tool(
    *,
    graph: WorkflowGraphInput,
    get_pending_node: Callable[[], dict[str, Any] | None],
    before_update: Callable[[], None] | None = None,
    on_update: Callable[[], None] | None = None,
    on_node_applied: Callable[[], None] | None = None,
    after_update: Callable[[bool], str] | None = None,
):
    @tool("update_current_graph", parse_docstring=True)
    async def update_current_graph(
        edges: list[WorkflowGraphEdgeInput] | None = None,
        done: bool = False,
    ) -> str:
        """Apply and publish the latest cached Skill node and its related edges.

        A matching ID updates an existing item; otherwise the item is added.

        Args:
            edges: Complete new or changed edges using sourcePortID and targetPortID.
            done: True only when this update completes the full workflow.
        """
        if before_update is not None:
            before_update()
        node = get_pending_node()
        if node is None:
            raise ValueError(
                "No cached node is available; execute build_node or update_node first"
            )
        next_graph = graph.model_copy(deep=True)
        logger.info(
            "update_current_graph cached node: id=%s type=%s",
            node.get("id"),
            node.get("type"),
        )
        _upsert_node(next_graph, node)
        for raw_candidate in edges or []:
            candidate = WorkflowGraphEdgeInput.model_validate(raw_candidate)
            logger.info(
                "update_current_graph edge candidate: id=%s source=%s target=%s",
                candidate.id,
                candidate.source,
                candidate.target,
            )
            _upsert_edge(next_graph, candidate)
        _validate_graph_references(next_graph)
        graph.nodes = next_graph.nodes
        graph.edges = next_graph.edges
        logger.info(
            "update_current_graph applied: nodes=%d edges=%d",
            len(graph.nodes),
            len(graph.edges),
        )
        if on_update is not None:
            on_update()
        if on_node_applied is not None:
            on_node_applied()
        if after_update is not None:
            return after_update(done)
        return "ok"

    return update_current_graph


def _upsert_node(
    graph: WorkflowGraphInput,
    candidate: dict[str, Any],
) -> None:
    node = WorkflowNode.model_validate(candidate)
    existing_index = next(
        (
            index
            for index, current in enumerate(graph.nodes)
            if current.id == node.id
        ),
        None,
    )
    if (
        existing_index is not None
        and graph.nodes[existing_index].type != node.type
    ):
        raise ValueError("An existing node type cannot be changed")
    if existing_index is None:
        graph.nodes.append(node)
    else:
        graph.nodes[existing_index] = node


def _upsert_edge(
    graph: WorkflowGraphInput,
    candidate: WorkflowGraphEdgeInput,
) -> None:
    edge_id = str(candidate.id or "").strip()
    existing_index = (
        next(
            (
                index
                for index, edge in enumerate(graph.edges)
                if edge_id and edge.id == edge_id
            ),
            None,
        )
        if edge_id
        else None
    )
    payload = candidate.model_dump()
    if existing_index is not None:
        payload = {
            **graph.edges[existing_index].model_dump(),
            **payload,
        }
    edge = WorkflowEdge.model_validate(payload)
    if existing_index is None:
        graph.edges.append(edge)
    else:
        graph.edges[existing_index] = edge


def _validate_graph_references(graph: WorkflowGraphInput) -> None:
    node_ids = {node.id for node in graph.nodes}
    for edge in graph.edges:
        if edge.source not in node_ids:
            raise ValueError(f"edge source does not exist: {edge.source}")
        if edge.target not in node_ids:
            raise ValueError(f"edge target does not exist: {edge.target}")
