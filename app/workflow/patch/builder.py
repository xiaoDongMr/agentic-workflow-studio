from __future__ import annotations

from copy import deepcopy
from typing import Any

from app.schemas.workflow import WorkflowDocument, WorkflowEdge, WorkflowNode
from app.workflow.nodes.capabilities import normalize_node_payload
from app.workflow.patch.schemas import WorkflowPatch


def build_workflow_patch(
    raw_operations: list[dict[str, Any]],
    sequence: int,
) -> WorkflowPatch:
    operations: list[dict[str, Any]] = []
    for index, raw_operation in enumerate(raw_operations):
        operation = deepcopy(raw_operation)
        if operation.get("op") == "add_node":
            node = operation.get("node")
            if not isinstance(node, dict):
                raise ValueError("add_node operation requires node")
            operation["node"] = normalize_node_payload(node, sequence + index)
        elif operation.get("op") == "add_edge":
            edge = operation.get("edge")
            if not isinstance(edge, dict):
                raise ValueError("add_edge operation requires edge")
            edge.setdefault(
                "id",
                _edge_id(
                    str(edge.get("source") or ""),
                    str(edge.get("target") or ""),
                    edge.get("sourcePortID"),
                ),
            )
        operations.append(operation)
    return WorkflowPatch.model_validate({"operations": operations})


def apply_workflow_patch(
    workflow: WorkflowDocument,
    patch: WorkflowPatch,
) -> WorkflowDocument:
    document = workflow.model_copy(deep=True)
    nodes = list(document.nodes)
    edges = list(document.edges)

    for operation in patch.operations:
        if operation.op == "replace_workflow":
            document = operation.workflow.model_copy(deep=True)
            nodes = list(document.nodes)
            edges = list(document.edges)
        elif operation.op == "add_node":
            if any(node.id == operation.node.id for node in nodes):
                raise ValueError(f"node id already exists: {operation.node.id}")
            nodes.append(operation.node.model_copy(deep=True))
        elif operation.op == "update_node":
            nodes = _update_node(nodes, operation.nodeId, operation.partial)
        elif operation.op == "delete_node":
            if not any(node.id == operation.nodeId for node in nodes):
                raise ValueError(f"node does not exist: {operation.nodeId}")
            nodes = [node for node in nodes if node.id != operation.nodeId]
            edges = [
                edge
                for edge in edges
                if edge.source != operation.nodeId and edge.target != operation.nodeId
            ]
        elif operation.op == "add_edge":
            edge_id = operation.edge.id or _edge_id(
                operation.edge.source,
                operation.edge.target,
                operation.edge.sourcePortID,
            )
            if any(_resolved_edge_id(edge) == edge_id for edge in edges):
                raise ValueError(f"edge id already exists: {edge_id}")
            edges.append(operation.edge.model_copy(update={"id": edge_id}, deep=True))
        elif operation.op == "delete_edge":
            if not any(_resolved_edge_id(edge) == operation.edgeId for edge in edges):
                raise ValueError(f"edge does not exist: {operation.edgeId}")
            edges = [
                edge for edge in edges if _resolved_edge_id(edge) != operation.edgeId
            ]
        elif operation.op == "update_metadata":
            if operation.name is not None:
                document.name = operation.name.strip()
            if operation.description is not None:
                document.description = operation.description.strip()

    document.nodes = nodes
    document.edges = edges
    _validate_references(document)
    return WorkflowDocument.model_validate(document.model_dump())


def _update_node(
    nodes: list[WorkflowNode],
    node_id: str,
    partial: dict[str, Any],
) -> list[WorkflowNode]:
    updated = False
    next_nodes: list[WorkflowNode] = []
    for node in nodes:
        if node.id != node_id:
            next_nodes.append(node)
            continue
        payload = node.model_dump()
        config_partial = partial.get("config")
        payload.update({key: value for key, value in partial.items() if key != "config"})
        if isinstance(config_partial, dict):
            payload["config"] = {**payload["config"], **config_partial}
        next_nodes.append(WorkflowNode.model_validate(payload))
        updated = True
    if not updated:
        raise ValueError(f"node does not exist: {node_id}")
    return next_nodes


def _validate_references(workflow: WorkflowDocument) -> None:
    node_ids = {node.id for node in workflow.nodes}
    if len(node_ids) != len(workflow.nodes):
        raise ValueError("workflow contains duplicate node ids")
    for edge in workflow.edges:
        if edge.source not in node_ids:
            raise ValueError(f"edge source does not exist: {edge.source}")
        if edge.target not in node_ids:
            raise ValueError(f"edge target does not exist: {edge.target}")


def _resolved_edge_id(edge: WorkflowEdge) -> str:
    return edge.id or _edge_id(edge.source, edge.target, edge.sourcePortID)


def _edge_id(source: str, target: str, source_port_id: Any = None) -> str:
    suffix = f"-{source_port_id}" if source_port_id not in {None, ""} else ""
    return f"edge-{source}-{target}{suffix}"
