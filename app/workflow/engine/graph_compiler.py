from __future__ import annotations

from langgraph.graph import END, StateGraph

from app.schemas.workflow import WorkflowDocument, WorkflowEdge, WorkflowNode
from app.workflow.engine.routing import make_selector_router
from app.workflow.nodes.registry import WorkflowNodeExecutorRegistry
from app.workflow.state import WorkflowState


class WorkflowGraphCompiler:
    def __init__(self, node_executors: WorkflowNodeExecutorRegistry):
        self.node_executors = node_executors

    def compile(self, workflow: WorkflowDocument):
        ensure_unique_node_ids(workflow)
        graph = StateGraph(WorkflowState)
        nodes = topological_nodes(workflow)
        nodes_by_id = {node.id: node for node in workflow.nodes}
        outgoing = outgoing_edges_by_source(workflow, nodes_by_id)

        for node in nodes:
            graph.add_node(node.id, self.node_executors.make_node_callable(node))

        if not nodes:
            raise ValueError("工作流没有可执行节点")

        graph.set_entry_point(nodes[0].id)
        if workflow.edges:
            self._connect_explicit_edges(graph, nodes, outgoing, nodes_by_id)
        else:
            self._connect_implicit_sequence(graph, nodes)

        return graph.compile()

    def _connect_explicit_edges(
        self,
        graph: StateGraph,
        nodes: list[WorkflowNode],
        outgoing: dict[str, list[WorkflowEdge]],
        nodes_by_id: dict[str, WorkflowNode],
    ) -> None:
        for node in nodes:
            target_edges = outgoing.get(node.id, [])
            if not target_edges:
                graph.add_edge(node.id, END)
            elif node.type == "selector" and len(target_edges) > 1:
                graph.add_conditional_edges(node.id, make_selector_router(node, target_edges, nodes_by_id))
            else:
                for edge in target_edges:
                    graph.add_edge(node.id, edge.target)

    def _connect_implicit_sequence(self, graph: StateGraph, nodes: list[WorkflowNode]) -> None:
        for source, target in zip(nodes, nodes[1:]):
            graph.add_edge(source.id, target.id)
        graph.add_edge(nodes[-1].id, END)


def ensure_unique_node_ids(workflow: WorkflowDocument) -> None:
    seen: set[str] = set()
    duplicates: set[str] = set()
    for node in workflow.nodes:
        if node.id in seen:
            duplicates.add(node.id)
        seen.add(node.id)

    if duplicates:
        duplicate_list = ", ".join(sorted(duplicates))
        raise ValueError(f"工作流节点 id 必须唯一，重复 id: {duplicate_list}")


def topological_nodes(workflow: WorkflowDocument) -> list[WorkflowNode]:
    nodes_by_id = {node.id: node for node in workflow.nodes}
    indegree = {node.id: 0 for node in workflow.nodes}
    outgoing: dict[str, list[str]] = {node.id: [] for node in workflow.nodes}
    for edge in workflow.edges:
        if edge.source in nodes_by_id and edge.target in nodes_by_id:
            outgoing[edge.source].append(edge.target)
            indegree[edge.target] += 1
    queue = [node.id for node in workflow.nodes if indegree[node.id] == 0]
    ordered: list[WorkflowNode] = []
    while queue:
        node_id = queue.pop(0)
        ordered.append(nodes_by_id[node_id])
        for target in outgoing[node_id]:
            indegree[target] -= 1
            if indegree[target] == 0:
                queue.append(target)
    return ordered if len(ordered) == len(workflow.nodes) else workflow.nodes


def outgoing_edges_by_source(
    workflow: WorkflowDocument,
    nodes_by_id: dict[str, WorkflowNode],
) -> dict[str, list[WorkflowEdge]]:
    outgoing: dict[str, list[WorkflowEdge]] = {node.id: [] for node in workflow.nodes}
    for edge in workflow.edges:
        if edge.source in nodes_by_id and edge.target in nodes_by_id:
            outgoing[edge.source].append(edge)
    return outgoing
