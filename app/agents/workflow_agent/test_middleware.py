from __future__ import annotations

import json
import unittest
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import patch

from langchain.agents.middleware.types import ModelResponse
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langgraph.graph import END
from langgraph.prebuilt.tool_node import ToolCallRequest
from langgraph.types import Command

from app.agents.workflow_agent.middleware import (
    WorkflowClarificationMiddleware,
    WorkflowFinalOutputGuardMiddleware,
    WorkflowLLMErrorHandlingMiddleware,
    WorkflowLoopDetectionMiddleware,
    WorkflowMetadataMiddleware,
    WorkflowOutputMiddleware,
    WorkflowPrepareMiddleware,
    WorkflowToolActivityMiddleware,
)
from app.agents.workflow_agent.tools.control import return_workflow_plan_tool


def _state() -> dict[str, Any]:
    return {
        "workflowAssistant": {
            "threadId": "thread-1",
            "message": "创建订单审核流程",
            "workflow": {
                "id": "workflow-1",
                "name": "未命名项目",
                "nodes": [],
                "edges": [],
            },
        }
    }


def _request(
    name: str,
    args: dict[str, Any],
    *,
    state: dict[str, Any] | None = None,
) -> ToolCallRequest:
    return cast(
        ToolCallRequest,
        SimpleNamespace(
            tool_call={"id": f"{name}-call", "name": name, "args": args},
            runtime=SimpleNamespace(state=state or _state()),
        ),
    )


class WorkflowMiddlewareTest(unittest.TestCase):
    def test_return_plan_tool_only_exposes_summary_and_mermaid(self) -> None:
        self.assertEqual(
            set(return_workflow_plan_tool.args),
            {"summary", "mermaid"},
        )

    def test_tool_activity_emits_structured_main_agent_timeline(self) -> None:
        events: list[dict] = []
        request = _request(
            "generate_workflow_patch",
            {"objective": {"summary": "新增审核节点"}},
        )
        with patch(
            "app.agents.workflow_agent.middleware.get_stream_writer",
            return_value=events.append,
        ):
            result = WorkflowToolActivityMiddleware().wrap_tool_call(
                request,
                lambda _request: ToolMessage(
                    content="ok",
                    tool_call_id="generate_workflow_patch-call",
                ),
            )

        self.assertIsInstance(result, ToolMessage)
        self.assertEqual(
            [event["status"] for event in events],
            ["running", "completed"],
        )
        self.assertTrue(
            all(event["actor"] == "main-agent" for event in events)
        )
        self.assertTrue(
            all(event["actorLabel"] == "主 Agent" for event in events)
        )
        self.assertTrue(
            all(event["kind"] == "subagent" for event in events)
        )
        self.assertTrue(
            all(event["groupId"] == "main-agent" for event in events)
        )

    def test_final_output_tool_is_visible_in_timeline(self) -> None:
        events: list[dict] = []
        request = _request(
            "return_workflow_error",
            {"message": "无法生成合法工作流"},
        )
        with patch(
            "app.agents.workflow_agent.middleware.get_stream_writer",
            return_value=events.append,
        ):
            result = WorkflowToolActivityMiddleware().wrap_tool_call(
                request,
                lambda _request: Command(update={}),
            )

        self.assertIsInstance(result, Command)
        self.assertEqual(
            [event["status"] for event in events],
            ["running", "failed"],
        )
        self.assertTrue(
            all(event["label"] == "提交执行错误" for event in events)
        )

    def test_llm_retry_streams_non_terminal_system_notice(self) -> None:
        events: list[dict] = []
        middleware = WorkflowLLMErrorHandlingMiddleware(
            app_config=SimpleNamespace(
                circuit_breaker=SimpleNamespace(
                    failure_threshold=3,
                    recovery_timeout_sec=60,
                )
            )
        )
        middleware.retry_base_delay_ms = 0
        middleware.retry_cap_delay_ms = 0
        request = cast(Any, SimpleNamespace(state=_state()))
        attempts = 0

        class APIConnectionError(Exception):
            pass

        def handler(_request):
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise APIConnectionError("temporary connection failure")
            return ModelResponse(
                result=[
                    AIMessage(
                        content="",
                        tool_calls=[
                            {
                                "name": "return_workflow_answer",
                                "args": {},
                                "id": "call-final",
                                "type": "tool_call",
                            }
                        ],
                    )
                ],
                structured_response=None,
            )

        with (
            patch(
                "app.agents.workflow_agent.middleware.get_stream_writer",
                return_value=events.append,
            ),
            patch(
                "langgraph.config.get_stream_writer",
                return_value=events.append,
            ),
        ):
            response = middleware.wrap_model_call(request, handler)

        workflow_events = [
            event for event in events
            if str(event.get("type", "")).startswith("workflow.")
        ]
        self.assertIsInstance(response, ModelResponse)
        self.assertEqual(attempts, 2)
        self.assertEqual(
            [event["type"] for event in workflow_events],
            ["workflow.systemNotice"],
        )
        self.assertEqual(workflow_events[0]["code"], "llm_retry")
        self.assertFalse(workflow_events[0]["terminal"])

    def test_llm_terminal_error_bypasses_generic_final_guard(self) -> None:
        events: list[dict] = []
        middleware = WorkflowLLMErrorHandlingMiddleware(
            app_config=SimpleNamespace(
                circuit_breaker=SimpleNamespace(
                    failure_threshold=3,
                    recovery_timeout_sec=60,
                )
            )
        )
        request = cast(Any, SimpleNamespace(state=_state()))

        def handler(_request):
            raise PermissionError("unauthorized")

        with patch(
            "app.agents.workflow_agent.middleware.get_stream_writer",
            return_value=events.append,
        ):
            response = middleware.wrap_model_call(request, handler)
            guard = WorkflowFinalOutputGuardMiddleware()
            guard.wrap_model_call(request, lambda _request: response)
            state = _state()
            state["messages"] = [response]
            update = guard.after_model(state, cast(Any, None))

        self.assertIsInstance(response, AIMessage)
        self.assertEqual(
            response.additional_kwargs["workflow_terminal_error"]["code"],
            "llm_auth",
        )
        self.assertEqual(
            [event["type"] for event in events],
            ["workflow.systemNotice", "workflow.end"],
        )
        self.assertEqual(update["workflowError"]["code"], "llm_auth")
        self.assertNotEqual(
            update["workflowError"]["message"],
            "工作流 Agent 未通过最终输出工具提交结果",
        )

    def test_loop_detection_streams_notice_and_isolates_runs(self) -> None:
        events: list[dict] = []
        middleware = WorkflowLoopDetectionMiddleware(
            warn_threshold=2,
            hard_limit=3,
            tool_freq_warn=20,
            tool_freq_hard_limit=30,
        )
        state = _state()
        state["messages"] = [
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "describe_workflow",
                        "args": {},
                        "id": "call-read",
                        "type": "tool_call",
                    }
                ],
            )
        ]
        first_run = cast(
            Any,
            SimpleNamespace(
                context={"thread_id": "thread-1", "run_id": "run-1"}
            ),
        )
        second_run = cast(
            Any,
            SimpleNamespace(
                context={"thread_id": "thread-1", "run_id": "run-2"}
            ),
        )

        with patch(
            "app.agents.workflow_agent.middleware.get_stream_writer",
            return_value=events.append,
        ):
            self.assertIsNone(middleware.after_model(state, first_run))
            warning = middleware.after_model(state, first_run)
            hard_stop = middleware.after_model(state, first_run)
            next_run = middleware.after_model(state, second_run)

        self.assertIsNotNone(warning)
        self.assertEqual(
            [event["type"] for event in events],
            [
                "workflow.systemNotice",
                "workflow.systemNotice",
                "workflow.end",
            ],
        )
        self.assertFalse(events[0]["terminal"])
        self.assertTrue(events[1]["terminal"])
        self.assertIsNone(hard_stop["workflowAssistant"])
        self.assertEqual(
            hard_stop["workflowError"]["code"],
            "tool_loop_hard_stop",
        )
        self.assertEqual(hard_stop["messages"][0].tool_calls, [])
        self.assertIsNone(next_run)

    def test_prepare_builds_task_before_agent_model_loop(self) -> None:
        events: list[dict] = []
        with patch(
            "app.agents.workflow_agent.middleware.get_stream_writer",
            return_value=events.append,
        ):
            result = WorkflowPrepareMiddleware().before_agent(
                _state(),
                cast(Any, None),
            )

        self.assertEqual(result["workflowTask"]["mode"], "decide")
        self.assertIsInstance(result["messages"][0], HumanMessage)
        self.assertNotIn("jump_to", result)
        self.assertEqual(
            [event["type"] for event in events],
            ["workflow.session", "workflow.message"],
        )

    def test_prepare_cancel_emits_end_and_skips_model_loop(self) -> None:
        events: list[dict] = []
        state = _state()
        state["workflowAssistant"]["clientEvent"] = "cancel_plan"
        with patch(
            "app.agents.workflow_agent.middleware.get_stream_writer",
            return_value=events.append,
        ):
            result = WorkflowPrepareMiddleware().before_agent(
                state,
                cast(Any, None),
            )

        self.assertEqual(result["workflowTask"]["mode"], "cancel")
        self.assertEqual(result["jump_to"], "end")
        self.assertEqual(
            [event["type"] for event in events],
            ["workflow.session", "workflow.end"],
        )

    def test_prepare_error_emits_terminal_error(self) -> None:
        events: list[dict] = []
        state = _state()
        state["workflowAssistant"]["clientEvent"] = "confirm_plan"
        with patch(
            "app.agents.workflow_agent.middleware.get_stream_writer",
            return_value=events.append,
        ):
            result = WorkflowPrepareMiddleware().before_agent(
                state,
                cast(Any, None),
            )

        self.assertEqual(result["workflowTask"]["mode"], "error")
        self.assertEqual(result["jump_to"], "end")
        self.assertEqual(
            [event["type"] for event in events],
            ["workflow.session", "workflow.error", "workflow.end"],
        )

    def test_metadata_emits_patch_and_keeps_react_running(self) -> None:
        events: list[dict] = []
        with patch(
            "app.agents.workflow_agent.middleware.get_stream_writer",
            return_value=events.append,
        ):
            result = WorkflowMetadataMiddleware().wrap_tool_call(
                _request(
                    "generate_workflow_metadata",
                    {
                        "name": "订单审核流程",
                        "description": "自动审核订单并通知结果",
                    },
                ),
                lambda _request: ToolMessage(
                    content="unexpected",
                    tool_call_id="x",
                ),
            )

        self.assertIsInstance(result, Command)
        self.assertNotEqual(result.goto, END)
        self.assertEqual(result.update["title"], "订单审核流程")
        self.assertEqual(events[0]["type"], "workflow.workflowMetadata")
        self.assertNotIn("workflow.end", [event["type"] for event in events])

    def test_clarification_emits_event_and_ends_react(self) -> None:
        events: list[dict] = []
        with patch(
            "app.agents.workflow_agent.middleware.get_stream_writer",
            return_value=events.append,
        ):
            result = WorkflowClarificationMiddleware().wrap_tool_call(
                _request(
                    "workflow_ask_clarification",
                    {
                        "questions": [
                            {
                                "question": "使用哪个通知渠道？",
                                "options": ["飞书", "邮件"],
                            }
                        ],
                    },
                ),
                lambda _request: ToolMessage(
                    content="unexpected",
                    tool_call_id="x",
                ),
            )

        self.assertIsInstance(result, Command)
        self.assertEqual(result.goto, END)
        self.assertTrue(result.update["workflowContext"]["awaitingClarification"])
        self.assertEqual(
            [event["type"] for event in events],
            ["workflow.clarification", "workflow.end"],
        )
        self.assertEqual(events[0]["summary"], "需要补充关键信息")
        self.assertEqual(events[0]["questions"][0]["id"], "question-1")
        self.assertEqual(events[0]["questions"][0]["inputType"], "single")
        self.assertEqual(
            events[0]["questions"][0]["options"],
            [
                {"label": "飞书", "value": "飞书"},
                {"label": "邮件", "value": "邮件"},
            ],
        )

    def test_clarification_normalizes_multiple_and_text_questions(self) -> None:
        events: list[dict] = []
        with patch(
            "app.agents.workflow_agent.middleware.get_stream_writer",
            return_value=events.append,
        ):
            result = WorkflowClarificationMiddleware().wrap_tool_call(
                _request(
                    "workflow_ask_clarification",
                    {
                        "questions": [
                            {
                                "question": "选择通知渠道",
                                "options": [" 飞书 ", "邮件", "飞书"],
                                "multiple": True,
                            },
                            {
                                "question": "工作流要实现什么目标？",
                            },
                        ],
                    },
                ),
                lambda _request: ToolMessage(
                    content="unexpected",
                    tool_call_id="x",
                ),
            )

        self.assertIsInstance(result, Command)
        questions = events[0]["questions"]
        self.assertEqual(questions[0]["id"], "question-1")
        self.assertEqual(questions[0]["inputType"], "multiple")
        self.assertEqual(
            [option["label"] for option in questions[0]["options"]],
            ["飞书", "邮件"],
        )
        self.assertFalse(questions[0]["required"])
        self.assertTrue(questions[0]["allowOther"])
        self.assertEqual(questions[1]["id"], "question-2")
        self.assertEqual(questions[1]["inputType"], "text")
        self.assertEqual(questions[1]["options"], [])

    def test_return_plan_emits_plan_and_persists_context(self) -> None:
        events: list[dict] = []
        with patch(
            "app.agents.workflow_agent.middleware.get_stream_writer",
            return_value=events.append,
        ):
            result = WorkflowOutputMiddleware().wrap_tool_call(
                _request(
                    "return_workflow_plan",
                    {
                        "summary": "创建订单审核流程",
                        "mermaid": (
                            "flowchart TD\n"
                            "  start[提交订单] --> review[审核订单]"
                        ),
                    },
                ),
                lambda _request: ToolMessage(
                    content="unexpected",
                    tool_call_id="x",
                ),
            )

        self.assertIsInstance(result, Command)
        self.assertEqual(result.goto, END)
        self.assertTrue(result.update["workflowContext"]["pendingConfirmation"])
        self.assertEqual(
            result.update["workflowContext"]["lastIntent"],
            "create_workflow",
        )
        self.assertEqual(
            set(result.update["workflowContext"]["plan"]),
            {"type", "summary", "mermaid"},
        )
        self.assertEqual(
            [event["type"] for event in events],
            ["workflow.planPreview", "workflow.end"],
        )

    def test_return_answer_only_requires_message(self) -> None:
        events: list[dict] = []
        with patch(
            "app.agents.workflow_agent.middleware.get_stream_writer",
            return_value=events.append,
        ):
            result = WorkflowOutputMiddleware().wrap_tool_call(
                _request(
                    "return_workflow_answer",
                    {"message": "当前工作流包含订单审核节点。"},
                ),
                lambda _request: ToolMessage(
                    content="unexpected",
                    tool_call_id="x",
                ),
            )

        self.assertIsInstance(result, Command)
        self.assertEqual(result.goto, END)
        self.assertEqual(
            [event["type"] for event in events],
            ["workflow.message", "workflow.complete", "workflow.end"],
        )
        self.assertEqual(
            result.update["messages"][0].content,
            "当前工作流包含订单审核节点。",
        )

    def test_generate_patch_completes_confirmed_graph_without_final_tool(
        self,
    ) -> None:
        events: list[dict] = []
        state = _state()
        state["workflowAssistant"]["clientEvent"] = "confirm_plan"
        state["workflowContext"] = {
            "threadId": "thread-1",
            "requestSummary": "创建订单审核流程",
            "pendingConfirmation": False,
            "lastIntent": "create_workflow",
            "lastScope": "full_workflow",
            "lastRiskLevel": "high",
            "targetNodeIds": [],
            "plan": {
                "type": "plan_preview",
                "summary": "创建订单审核流程",
                "mermaid": "flowchart TD\nstart --> review",
            },
        }
        payload = {
            "summary": "工作流已生成",
            "graph": {
                "nodes": [
                    {
                        "id": "start",
                        "title": "开始节点",
                        "type": "start",
                        "config": {},
                    },
                    {
                        "id": "end-1",
                        "title": "结束节点",
                        "type": "end",
                        "config": {},
                    },
                ],
                "edges": [{"source": "start", "target": "end-1"}],
            },
        }
        with patch(
            "app.agents.workflow_agent.middleware.get_stream_writer",
            return_value=events.append,
        ):
            result = WorkflowOutputMiddleware().wrap_tool_call(
                _request(
                    "generate_workflow_patch",
                    {"goal": "创建订单审核流程"},
                    state=state,
                ),
                lambda _request: ToolMessage(
                    content=json.dumps(payload, ensure_ascii=False),
                    tool_call_id="generate-workflow",
                    name="generate_workflow_patch",
                ),
            )

        self.assertIsInstance(result, Command)
        self.assertEqual(result.goto, END)
        self.assertEqual(
            [event["type"] for event in events],
            ["workflow.complete", "workflow.end"],
        )
        self.assertEqual(
            result.update["messages"][0].content,
            "工作流已生成",
        )
        self.assertFalse(
            result.update["workflowContext"]["pendingConfirmation"],
        )
        self.assertIsNone(result.update["workflowContext"]["plan"])

    def test_generate_patch_rejects_unconfirmed_topology_change(self) -> None:
        payload = {
            "summary": "工作流已生成",
            "graph": {
                "nodes": [
                    {
                        "id": "start",
                        "title": "开始节点",
                        "type": "start",
                        "config": {},
                    }
                ],
                "edges": [],
            },
        }
        with (
            patch(
                "app.agents.workflow_agent.middleware.get_stream_writer",
                return_value=lambda _event: None,
            ),
            self.assertRaisesRegex(
                ValueError,
                "requires user confirmation",
            ),
        ):
            WorkflowOutputMiddleware().wrap_tool_call(
                _request(
                    "generate_workflow_patch",
                    {"goal": "创建工作流"},
                ),
                lambda _request: ToolMessage(
                    content=json.dumps(payload, ensure_ascii=False),
                    tool_call_id="generate-workflow",
                    name="generate_workflow_patch",
                ),
            )

    def test_final_output_guard_allows_return_plan_tool_execution(self) -> None:
        state = _state()
        state["messages"] = [
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "return_workflow_plan",
                        "args": {},
                        "id": "call-plan",
                        "type": "tool_call",
                    }
                ],
            )
        ]

        result = WorkflowFinalOutputGuardMiddleware().after_model(
            state,
            cast(Any, None),
        )

        self.assertIsNone(result)

    def test_final_output_guard_emits_terminal_error_once(self) -> None:
        events: list[dict] = []
        state = _state()
        state["messages"] = [AIMessage(content="直接返回文本")]
        with patch(
            "app.agents.workflow_agent.middleware.get_stream_writer",
            return_value=events.append,
        ):
            result = WorkflowFinalOutputGuardMiddleware().after_model(
                state,
                cast(Any, None),
            )

        self.assertEqual(
            result["workflowError"]["message"],
            "工作流 Agent 未通过最终输出工具提交结果",
        )
        self.assertEqual(
            [event["type"] for event in events],
            ["workflow.error", "workflow.end"],
        )

    def test_final_output_guard_streams_error_during_model_call(self) -> None:
        events: list[dict] = []
        state = _state()
        response_message = AIMessage(content="直接返回文本", id="ai-1")
        middleware = WorkflowFinalOutputGuardMiddleware()
        with patch(
            "app.agents.workflow_agent.middleware.get_stream_writer",
            return_value=events.append,
        ):
            response = middleware.wrap_model_call(
                cast(Any, SimpleNamespace(state=state)),
                lambda _request: ModelResponse(
                    result=[response_message],
                    structured_response=None,
                ),
            )
            state["messages"] = [response_message]
            update = middleware.after_model(state, cast(Any, None))

        self.assertIs(response.result[-1], response_message)
        self.assertEqual(
            update["workflowError"]["message"],
            "工作流 Agent 未通过最终输出工具提交结果",
        )
        self.assertEqual(
            [event["type"] for event in events],
            ["workflow.error", "workflow.end"],
        )


if __name__ == "__main__":
    unittest.main()
