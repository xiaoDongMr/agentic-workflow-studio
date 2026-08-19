from __future__ import annotations

import json
import unittest
from types import SimpleNamespace
from typing import Any

from langchain.agents.middleware.types import ModelResponse
from langchain_core.messages import AIMessage, HumanMessage

from app.agents.workflow_agent.graph_builder import (
    GraphBuilderEmptyResponseRetryMiddleware,
    WorkflowGraphBuilder,
    _build_graph_builder_middlewares,
    _emit_graph_builder_tool_decision,
    _graph_builder_recursion_limit,
    _make_graph_builder_loop_detection,
)
from app.agents.workflow_agent.schemas import WorkflowGraphInput
from app.agents.workflow_agent.tools.update_current_graph import (
    make_update_current_graph_tool,
)
from deerflow.config.loop_detection_config import LoopDetectionConfig


class _ModelRequest:
    def __init__(self, messages: list[Any]) -> None:
        self.messages = messages

    def override(self, *, messages: list[Any]) -> _ModelRequest:
        return _ModelRequest(messages)


def _response(message: AIMessage) -> ModelResponse:
    return ModelResponse(result=[message], structured_response=None)


def _tool_response() -> ModelResponse:
    return _response(
        AIMessage(
            content="",
            tool_calls=[
                {
                    "name": "execute_node_skill_script",
                    "args": {},
                    "id": "call-next",
                }
            ],
        )
    )


class GraphBuilderEmptyResponseRetryMiddlewareTest(unittest.TestCase):
    def test_retries_empty_response_once_with_correction(self) -> None:
        middleware = GraphBuilderEmptyResponseRetryMiddleware(
            is_completed=lambda: False,
        )
        requests: list[_ModelRequest] = []

        def handler(request: _ModelRequest) -> ModelResponse:
            requests.append(request)
            return (
                _response(AIMessage(content=""))
                if len(requests) == 1
                else _tool_response()
            )

        result = middleware.wrap_model_call(
            _ModelRequest([HumanMessage(content="task")]),  # type: ignore[arg-type]
            handler,  # type: ignore[arg-type]
        )

        self.assertIsInstance(result, ModelResponse)
        self.assertEqual(
            result.result[-1].tool_calls[0]["name"],
            "execute_node_skill_script",
        )
        self.assertEqual(len(requests), 2)
        self.assertIsInstance(requests[1].messages[-1], HumanMessage)
        self.assertIn(
            "update_current_graph(done=true)",
            str(requests[1].messages[-1].content),
        )

    def test_does_not_retry_after_completion(self) -> None:
        middleware = GraphBuilderEmptyResponseRetryMiddleware(
            is_completed=lambda: True,
        )
        calls = 0

        def handler(_request: _ModelRequest) -> ModelResponse:
            nonlocal calls
            calls += 1
            return _response(AIMessage(content=""))

        middleware.wrap_model_call(
            _ModelRequest([]),  # type: ignore[arg-type]
            handler,  # type: ignore[arg-type]
        )

        self.assertEqual(calls, 1)

    def test_stops_after_one_empty_response_retry(self) -> None:
        middleware = GraphBuilderEmptyResponseRetryMiddleware(
            is_completed=lambda: False,
        )
        calls = 0

        def handler(_request: _ModelRequest) -> ModelResponse:
            nonlocal calls
            calls += 1
            return _response(AIMessage(content=""))

        middleware.wrap_model_call(
            _ModelRequest([]),  # type: ignore[arg-type]
            handler,  # type: ignore[arg-type]
        )

        self.assertEqual(calls, 2)


class GraphBuilderEmptyResponseAsyncRetryMiddlewareTest(
    unittest.IsolatedAsyncioTestCase
):
    async def test_retries_empty_async_response_once(self) -> None:
        middleware = GraphBuilderEmptyResponseRetryMiddleware(
            is_completed=lambda: False,
        )
        calls = 0

        async def handler(_request: _ModelRequest) -> ModelResponse:
            nonlocal calls
            calls += 1
            return (
                _response(AIMessage(content=""))
                if calls == 1
                else _tool_response()
            )

        await middleware.awrap_model_call(
            _ModelRequest([]),  # type: ignore[arg-type]
            handler,  # type: ignore[arg-type]
        )

        self.assertEqual(calls, 2)


class UpdateCurrentGraphToolTest(unittest.IsolatedAsyncioTestCase):
    async def test_updates_closure_without_returning_graph_to_model(self) -> None:
        graph = WorkflowGraphInput(nodes=[], edges=[])
        pending = {
            "node": {
                "id": "end-test",
                "title": "结束节点",
                "type": "end",
                "description": "返回工作流最终输出。",
                "inputs": [],
                "outputs": [],
                "config": {},
            }
        }
        tool = make_update_current_graph_tool(
            graph=graph,
            get_pending_node=lambda: pending.get("node"),
            on_node_applied=lambda: pending.clear(),
        )

        result = await tool.coroutine(  # type: ignore[misc]
            edges=None,
        )

        self.assertEqual(result, "ok")
        self.assertEqual([node.id for node in graph.nodes], ["end-test"])
        self.assertEqual(pending, {})
        self.assertNotIn("graph", result)
        schema = tool.args_schema.model_json_schema()  # type: ignore[union-attr]
        self.assertEqual(set(schema["properties"]), {"edges", "done"})

    async def test_requires_cached_node(self) -> None:
        tool = make_update_current_graph_tool(
            graph=WorkflowGraphInput(nodes=[], edges=[]),
            get_pending_node=lambda: None,
        )

        with self.assertRaisesRegex(ValueError, "No cached node"):
            await tool.coroutine(edges=[])  # type: ignore[misc]

    async def test_keeps_cached_node_when_edge_validation_fails(self) -> None:
        graph = WorkflowGraphInput(nodes=[], edges=[])
        pending = {
            "node": {
                "id": "end-test",
                "title": "结束节点",
                "type": "end",
                "config": {},
            }
        }
        tool = make_update_current_graph_tool(
            graph=graph,
            get_pending_node=lambda: pending.get("node"),
            on_node_applied=lambda: pending.clear(),
        )

        with self.assertRaises(ValueError):
            await tool.coroutine(  # type: ignore[misc]
                edges=[{"source": "start"}],
            )

        self.assertEqual(graph.nodes, [])
        self.assertIn("node", pending)

    async def test_rejects_edge_to_unknown_mermaid_node_id(self) -> None:
        graph = WorkflowGraphInput(nodes=[], edges=[])
        pending = {
            "node": {
                "id": "start",
                "title": "开始节点",
                "type": "start",
                "config": {},
            }
        }
        tool = make_update_current_graph_tool(
            graph=graph,
            get_pending_node=lambda: pending.get("node"),
            on_node_applied=lambda: pending.clear(),
        )

        with self.assertRaisesRegex(
            ValueError,
            "edge target does not exist: B",
        ):
            await tool.coroutine(  # type: ignore[misc]
                edges=[{"source": "start", "target": "B"}],
            )

        self.assertEqual(graph.nodes, [])
        self.assertEqual(graph.edges, [])
        self.assertIn("node", pending)

    async def test_rejects_incorrect_edge_port_casing(self) -> None:
        graph = WorkflowGraphInput(
            nodes=[
                {
                    "id": "start",
                    "title": "开始",
                    "type": "start",
                    "config": {},
                }
            ],
            edges=[],
        )
        pending = {
            "node": {
                "id": "end-test",
                "title": "结束",
                "type": "end",
                "config": {},
            }
        }
        tool = make_update_current_graph_tool(
            graph=graph,
            get_pending_node=lambda: pending.get("node"),
        )

        with self.assertRaisesRegex(ValueError, "sourcePortId"):
            await tool.coroutine(  # type: ignore[misc]
                edges=[
                    {
                        "source": "start",
                        "target": "end-test",
                        "sourcePortId": "output",
                    }
                ],
            )

        self.assertEqual(len(graph.nodes), 1)
        self.assertEqual(graph.edges, [])

    async def test_publishes_after_update_and_returns_short_ack(self) -> None:
        graph = WorkflowGraphInput(nodes=[], edges=[])
        pending = {
            "node": {
                "id": "end-test",
                "title": "结束节点",
                "type": "end",
                "config": {},
            }
        }
        published: list[bool] = []
        tool = make_update_current_graph_tool(
            graph=graph,
            get_pending_node=lambda: pending.get("node"),
            on_node_applied=lambda: pending.clear(),
            after_update=lambda done: (
                published.append(done)
                or '{"ok":true,"revision":1,"done":true}'
            ),
        )

        result = await tool.coroutine(edges=[], done=True)  # type: ignore[misc]

        self.assertEqual(result, '{"ok":true,"revision":1,"done":true}')
        self.assertEqual(published, [True])
        self.assertNotIn('"graph"', result)


class WorkflowGraphBuilderTaskTest(unittest.TestCase):
    def test_task_prompt_includes_workflow_id(self) -> None:
        prompt = WorkflowGraphBuilder._build_task_prompt(
            goal="生成测试流程",
            workflow_id="workflow-1",
            graph=WorkflowGraphInput(nodes=[], edges=[]),
            confirmed_mermaid=None,
        )

        payload = json.loads(prompt.split("\n", 1)[1])
        self.assertEqual(payload["workflowId"], "workflow-1")

    def test_system_prompt_rejects_mermaid_aliases_as_graph_ids(self) -> None:
        from app.agents.workflow_agent.graph_builder import (
            GRAPH_BUILDER_SYSTEM_PROMPT,
        )

        self.assertIn("不是真实 Graph 节点 ID", GRAPH_BUILDER_SYSTEM_PROMPT)
        self.assertIn("同一 Skill 在本次任务中禁止重复读取", GRAPH_BUILDER_SYSTEM_PROMPT)
        self.assertIn("各调用一次并复用结果", GRAPH_BUILDER_SYSTEM_PROMPT)
        self.assertIn("第一轮必须调用 plan_node_capabilities", GRAPH_BUILDER_SYSTEM_PROMPT)
        self.assertIn("并行执行或策略规划不得使用 selector", GRAPH_BUILDER_SYSTEM_PROMPT)
        self.assertIn("不得因为标题含", GRAPH_BUILDER_SYSTEM_PROMPT)

    def test_recursion_budget_scales_with_confirmed_workflow_size(self) -> None:
        graph = WorkflowGraphInput(nodes=[], edges=[])
        mermaid = "\n".join(
            f"  node{index}[节点{index}]"
            for index in range(10)
        )

        self.assertEqual(
            _graph_builder_recursion_limit(graph, mermaid),
            384,
        )
        nine_node_mermaid = "\n".join(
            f"  node{index}[节点{index}]"
            for index in range(9)
        )
        self.assertEqual(
            _graph_builder_recursion_limit(graph, nine_node_mermaid),
            352,
        )
        self.assertEqual(
            _graph_builder_recursion_limit(graph, "flowchart TD\n  a[节点A]"),
            120,
        )

    def test_recursion_budget_is_capped(self) -> None:
        mermaid = "\n".join(
            f"  node{index}[节点{index}]"
            for index in range(100)
        )

        self.assertEqual(
            _graph_builder_recursion_limit(
                WorkflowGraphInput(nodes=[], edges=[]),
                mermaid,
            ),
            800,
        )

    def test_graph_builder_enables_loop_detection(self) -> None:
        middlewares = _build_graph_builder_middlewares(
            SimpleNamespace(
                token_usage=SimpleNamespace(enabled=False),
                loop_detection=LoopDetectionConfig(enabled=True),
            ),
            is_completed=lambda: False,
        )

        self.assertIn(
            "LoopDetectionMiddleware",
            [type(item).__name__ for item in middlewares],
        )

    def test_graph_builder_uses_business_specific_loop_thresholds(self) -> None:
        middleware = _make_graph_builder_loop_detection(
            LoopDetectionConfig(enabled=True),
        )

        self.assertGreater(middleware.warn_threshold, 800)
        self.assertGreater(middleware.hard_limit, 800)
        self.assertEqual(
            middleware._tool_freq_overrides["execute_node_skill_script"],
            (80, 120),
        )

    def test_emits_sanitized_model_output_for_tool_only_response(self) -> None:
        events: list[dict[str, Any]] = []

        _emit_graph_builder_tool_decision(
            {
                "messages": [
                    AIMessage(
                        id="message-1",
                        content="",
                        tool_calls=[
                            {
                                "name": "update_current_graph",
                                "args": {
                                    "edges": [
                                        {
                                            "source": "secret-source",
                                            "target": "secret-target",
                                        }
                                    ]
                                },
                                "id": "call-1",
                            }
                        ],
                    )
                ]
            },
            stream_writer=events.append,
            thread_id="thread-1",
            emitted_ids=set(),
        )

        self.assertEqual(
            events,
            [
                {
                    "type": "workflow.modelOutput",
                    "threadId": "thread-1",
                    "actor": "graph-builder",
                    "actorLabel": "画布生成器",
                    "outputId": "decision-call-1",
                    "content": "正在将节点和连线同步到画布",
                }
            ],
        )
        self.assertNotIn("secret-source", str(events))


if __name__ == "__main__":
    unittest.main()
