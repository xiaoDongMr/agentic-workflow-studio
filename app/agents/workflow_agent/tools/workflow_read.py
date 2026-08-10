from __future__ import annotations

from langchain.tools import tool

from app.agents.workflow_agent.tools.output import (
    bounded_tool_json,
    workflow_tool_output_limit,
)
from app.schemas.workflow import WorkflowDocument
from deerflow.tools.types import Runtime


@tool("describe_workflow", parse_docstring=True)
def describe_workflow_tool(runtime: Runtime) -> str:
    """Describe the workflow structure without modifying it.
    """
    document = _workflow_from_runtime(runtime)
    nodes = [
        {
            "id": node.id,
            "title": node.title,
            "type": node.type,
            "inputCount": len(node.inputs),
            "outputCount": len(node.outputs),
        }
        for node in document.nodes
    ]
    edges = [
        {
            "id": edge.id,
            "source": edge.source,
            "target": edge.target,
            "sourcePortID": edge.sourcePortID,
        }
        for edge in document.edges
    ]
    return bounded_tool_json(
        {
            "id": document.id,
            "name": document.name,
            "nodeCount": len(nodes),
            "edgeCount": len(edges),
            "nodes": nodes,
            "edges": edges,
        },
        max_chars=workflow_tool_output_limit(runtime),
    )


@tool("inspect_workflow_node", parse_docstring=True)
def inspect_workflow_node_tool(
    runtime: Runtime,
    node_id: str,
) -> str:
    """Inspect one workflow node and its connected edges.

    Args:
        node_id: Node identifier to inspect.
    """
    document = _workflow_from_runtime(runtime)
    node = next((item for item in document.nodes if item.id == node_id), None)
    if node is None:
        raise ValueError(f"workflow node does not exist: {node_id}")
    connected_edges = [
        edge.model_dump()
        for edge in document.edges
        if edge.source == node_id or edge.target == node_id
    ]
    return bounded_tool_json(
        {
            "node": node.model_dump(),
            "connectedEdges": connected_edges,
        },
        max_chars=workflow_tool_output_limit(runtime),
    )


def _workflow_from_runtime(runtime: Runtime) -> WorkflowDocument:
    state = runtime.state or {}
    raw_request = state.get("workflowAssistant") or {}
    raw_workflow = raw_request.get("workflow")
    if raw_workflow is None:
        raise ValueError("workflowAssistant.workflow is required")
    return WorkflowDocument.model_validate(raw_workflow)
