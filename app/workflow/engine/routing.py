from __future__ import annotations

from app.schemas.workflow import WorkflowEdge, WorkflowNode
from app.workflow.state import WorkflowState


def make_selector_router(node: WorkflowNode, edges: list[WorkflowEdge], nodes_by_id: dict[str, WorkflowNode]):
    def route(state: WorkflowState) -> str:
        output_key = node.config.outputKey or "branch"
        node_output = state.get("variables", {}).get(node.id)
        branch = ""
        if isinstance(node_output, dict):
            branch = str(node_output.get(output_key) or node_output.get("branch") or "")
        normalized_branch = branch.strip().lower()
        branch_port = selector_branch_port_id(node, normalized_branch)
        for edge in edges:
            if branch_port and str(edge.sourcePortID or "").lower() == branch_port:
                return edge.target
        for edge in edges:
            target_node = nodes_by_id[edge.target]
            if normalized_branch in {edge.target.lower(), target_node.title.lower(), target_node.type.lower()}:
                return edge.target
            if normalized_branch and normalized_branch in target_node.title.lower():
                return edge.target
        return edges[0].target

    return route


def selector_branch_port_id(node: WorkflowNode, normalized_branch: str) -> str:
    if not normalized_branch:
        return ""
    if normalized_branch in {"else", "否则", (node.config.selectorElseBranch or "").strip().lower()}:
        return "selector-else"
    for index, branch in enumerate(node.config.selectorBranches):
        port_id = f"selector-branch-{index}"
        labels = {
            port_id,
            f"条件 {index + 1}".lower(),
            f"条件{index + 1}".lower(),
            (branch.id or "").strip().lower(),
            (branch.label or "").strip().lower(),
        }
        if normalized_branch in labels:
            return port_id
    return ""
