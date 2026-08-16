from __future__ import annotations

from typing import Any

from app.agents.workflow_agent.schemas import WorkflowGraphInput
from app.schemas.workflow import WorkflowDocument, WorkflowNode
from app.workflow.nodes.capabilities import START_CONFIG_KEYS


def node_business_payload(node: WorkflowNode) -> dict[str, Any]:
    payload = node.model_dump()
    _strip_presentation(payload)
    return payload


def graph_business_payload(
    graph: WorkflowGraphInput | WorkflowDocument,
) -> dict[str, Any]:
    return {
        "nodes": [node_business_payload(node) for node in graph.nodes],
        "edges": [edge.model_dump() for edge in graph.edges],
    }


def _strip_presentation(node: dict[str, Any]) -> None:
    node.pop("position", None)
    node.pop("status", None)
    if node.get("type") == "start":
        config = node.get("config") or {}
        node["config"] = {
            key: config[key]
            for key in START_CONFIG_KEYS
            if key in config
        }
    for body_node in node.get("config", {}).get("loopBodyNodes") or []:
        _strip_presentation(body_node)
