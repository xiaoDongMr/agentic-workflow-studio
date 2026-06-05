from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from langgraph.graph import END, StateGraph

from deerflow.config.app_config import AppConfig

from app.schemas.workflow import WorkflowDocument, WorkflowEdge, WorkflowNode
from app.services.workflow_execution import WorkflowNodeExecutorRegistry, WorkflowRunEvent, WorkflowState


def _ensure_unique_node_ids(workflow: WorkflowDocument) -> None:
    seen: set[str] = set()
    duplicates: set[str] = set()
    for node in workflow.nodes:
        if node.id in seen:
            duplicates.add(node.id)
        seen.add(node.id)

    if duplicates:
        duplicate_list = ", ".join(sorted(duplicates))
        raise ValueError(f"工作流节点 id 必须唯一，重复 id: {duplicate_list}")


def _topological_nodes(workflow: WorkflowDocument) -> list[WorkflowNode]:
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


class WorkflowRunner:
    def __init__(self, app_config: AppConfig):
        self.app_config = app_config
        self.node_executors = WorkflowNodeExecutorRegistry(app_config)

    async def run(self, workflow: WorkflowDocument, run_input: dict[str, Any]) -> dict[str, Any]:
        final_result: dict[str, Any] | None = None
        async for event in self.stream(workflow, run_input):
            if event["type"] == "final":
                final_result = event["data"]
            elif event["type"] == "error":
                raise RuntimeError(str(event["data"].get("message") or "工作流执行失败"))

        if final_result is None:
            raise RuntimeError("工作流未返回最终结果")
        return final_result

    async def stream(self, workflow: WorkflowDocument, run_input: dict[str, Any]) -> AsyncIterator[WorkflowRunEvent]:
        compiled = self._compile(workflow)
        initial_state = self._initial_state(run_input)
        last_step_count = 0
        final_state: WorkflowState | None = None

        yield {
            "type": "metadata",
            "data": {
                "workflowId": workflow.id,
                "workflowName": workflow.name,
            },
        }

        try:
            async for item in compiled.astream(initial_state, stream_mode=["values", "custom"]):
                mode, chunk = item if isinstance(item, tuple) and len(item) == 2 else ("values", item)
                if mode == "custom":
                    yield {"type": "workflow_event", "data": chunk}
                    continue
                if mode != "values":
                    continue
                final_state = chunk
                steps = chunk.get("steps", [])
                for step in steps[last_step_count:]:
                    yield {"type": "step", "data": step}
                last_step_count = len(steps)
        except Exception as exc:
            yield {
                "type": "error",
                "data": {
                    "message": str(exc),
                },
            }
            return

        yield {
            "type": "final",
            "data": self._result_from_state(final_state or initial_state),
        }

    def _compile(self, workflow: WorkflowDocument):
        _ensure_unique_node_ids(workflow)
        graph = StateGraph(WorkflowState)
        nodes = _topological_nodes(workflow)
        nodes_by_id = {node.id: node for node in workflow.nodes}
        outgoing: dict[str, list[WorkflowEdge]] = {node.id: [] for node in workflow.nodes}
        for edge in workflow.edges:
            if edge.source in nodes_by_id and edge.target in nodes_by_id:
                outgoing[edge.source].append(edge)

        for node in nodes:
            graph.add_node(node.id, self.node_executors.make_node_callable(node))

        if not nodes:
            raise ValueError("工作流没有可执行节点")

        graph.set_entry_point(nodes[0].id)
        if workflow.edges:
            for node in nodes:
                target_edges = outgoing.get(node.id, [])
                if not target_edges:
                    graph.add_edge(node.id, END)
                elif node.type == "selector" and len(target_edges) > 1:
                    graph.add_conditional_edges(node.id, self._make_selector_router(node, target_edges, nodes_by_id))
                else:
                    for edge in target_edges:
                        graph.add_edge(node.id, edge.target)
        else:
            for source, target in zip(nodes, nodes[1:]):
                graph.add_edge(source.id, target.id)
            graph.add_edge(nodes[-1].id, END)

        return graph.compile()

    def _initial_state(self, run_input: dict[str, Any]) -> WorkflowState:
        return {
            "input": run_input,
            "variables": {},
            "steps": [],
            "output": {},
        }

    def _result_from_state(self, final_state: WorkflowState) -> dict[str, Any]:
        return {
            "output": final_state.get("output", {}),
            "state": {
                "input": final_state.get("input", {}),
                "variables": final_state.get("variables", {}),
            },
            "steps": final_state.get("steps", []),
        }

    def _make_selector_router(self, node: WorkflowNode, edges: list[WorkflowEdge], nodes_by_id: dict[str, WorkflowNode]):
        def route(state: WorkflowState) -> str:
            output_key = node.config.outputKey or "branch"
            node_output = state.get("variables", {}).get(node.id)
            branch = ""
            if isinstance(node_output, dict):
                branch = str(node_output.get(output_key) or node_output.get("branch") or "")
            normalized_branch = branch.strip().lower()
            branch_port = self._selector_branch_port_id(node, normalized_branch)
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

    def _selector_branch_port_id(self, node: WorkflowNode, normalized_branch: str) -> str:
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
