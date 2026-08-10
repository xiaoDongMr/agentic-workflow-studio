from __future__ import annotations

import json
import unittest
from unittest.mock import patch

from langchain_core.runnables import RunnableLambda
from langgraph.checkpoint.memory import InMemorySaver

from app.agents.workflow_agent.graph import make_workflow_agent
from app.schemas.workflow import WorkflowDocument


def _fake_react_agent():
    async def invoke(state):
        task = json.loads(state["messages"][-1].content)
        if task["mode"] == "decide":
            decision = {
                "kind": "plan",
                "action": {
                    "intent": "create_workflow",
                    "scope": "full_workflow",
                    "riskLevel": "high",
                    "targetNodeIds": [],
                    "requiresConfirmation": True,
                    "summary": "创建测试流程",
                },
                "summary": "创建测试流程",
                "mermaid": "flowchart TD\n  Start",
                "stages": [
                    {
                        "stageId": "start",
                        "sequence": 1,
                        "title": "创建开始节点",
                        "instruction": "创建开始节点",
                        "final": True,
                    }
                ],
            }
        else:
            decision = {
                "kind": "patch",
                "action": {
                    "intent": "create_workflow",
                    "scope": "full_workflow",
                    "riskLevel": "high",
                    "targetNodeIds": [],
                    "requiresConfirmation": True,
                    "summary": "创建开始节点",
                },
                "summary": "创建开始节点",
                "operations": [
                    {
                        "op": "add_node",
                        "node": {
                            "id": "start",
                            "type": "start",
                            "title": "开始",
                        },
                    }
                ],
            }
        return {"structured_response": decision}

    return RunnableLambda(invoke)


class WorkflowAgentGraphTest(unittest.IsolatedAsyncioTestCase):
    async def test_plan_is_restored_and_confirmed_patch_is_emitted(self) -> None:
        workflow = WorkflowDocument(
            id="workflow-1",
            name="Test",
            nodes=[],
            edges=[],
        )
        with patch(
            "app.agents.workflow_agent.graph.make_workflow_react_agent",
            return_value=_fake_react_agent(),
        ):
            graph = make_workflow_agent(
                {},
                app_config=object(),  # type: ignore[arg-type]
            )
        graph.checkpointer = InMemorySaver()
        config = {"configurable": {"thread_id": "thread-1"}}

        plan_events = [
            event
            async for event in graph.astream(
                {
                    "workflowAssistant": {
                        "threadId": "thread-1",
                        "message": "生成测试流程",
                        "workflow": workflow.model_dump(),
                    }
                },
                config=config,
                stream_mode="custom",
            )
        ]
        self.assertIn("workflow.planPreview", _event_types(plan_events))

        patch_events = [
            event
            async for event in graph.astream(
                {
                    "workflowAssistant": {
                        "threadId": "thread-1",
                        "message": "确认",
                        "workflow": workflow.model_dump(),
                        "clientEvent": "confirm_plan",
                    }
                },
                config=config,
                stream_mode="custom",
            )
        ]
        self.assertIn("workflow.workflowPatch", _event_types(patch_events))
        patch_event = next(
            event
            for event in patch_events
            if event["type"] == "workflow.workflowPatch"
        )
        self.assertEqual(
            patch_event["patch"]["operations"][0]["node"]["id"],
            "start",
        )

    async def test_read_only_request_emits_answer_without_patch(self) -> None:
        async def answer(_state):
            return {
                "structured_response": {
                    "kind": "answer",
                    "action": {
                        "intent": "explain_workflow",
                        "scope": "read_only",
                        "riskLevel": "low",
                        "targetNodeIds": [],
                        "requiresConfirmation": False,
                        "summary": "解释工作流",
                    },
                    "summary": "解释工作流",
                    "message": "当前工作流还没有节点。",
                }
            }

        workflow = WorkflowDocument(
            id="workflow-1",
            name="Test",
            nodes=[],
            edges=[],
        )
        with patch(
            "app.agents.workflow_agent.graph.make_workflow_react_agent",
            return_value=RunnableLambda(answer),
        ):
            graph = make_workflow_agent(
                {},
                app_config=object(),  # type: ignore[arg-type]
            )

        events = [
            event
            async for event in graph.astream(
                {
                    "workflowAssistant": {
                        "threadId": "thread-read",
                        "message": "解释这个工作流",
                        "workflow": workflow.model_dump(),
                    }
                },
                stream_mode="custom",
            )
        ]

        self.assertIn("workflow.complete", _event_types(events))
        self.assertNotIn("workflow.workflowPatch", _event_types(events))

    async def test_direct_patch_completes_after_frontend_validation(self) -> None:
        async def direct_patch(_state):
            return {
                "structured_response": {
                    "kind": "patch",
                    "action": {
                        "intent": "modify_selected_node",
                        "scope": "selected_node_only",
                        "riskLevel": "low",
                        "targetNodeIds": ["llm-1"],
                        "requiresConfirmation": False,
                        "summary": "调整节点标题",
                    },
                    "summary": "调整节点标题",
                    "operations": [
                        {
                            "op": "update_node",
                            "nodeId": "llm-1",
                            "partial": {"title": "新标题"},
                        }
                    ],
                }
            }

        workflow = WorkflowDocument(
            id="workflow-1",
            name="Test",
            nodes=[
                {
                    "id": "llm-1",
                    "title": "旧标题",
                    "type": "llm",
                    "config": {},
                }
            ],
            edges=[],
        )
        with patch(
            "app.agents.workflow_agent.graph.make_workflow_react_agent",
            return_value=RunnableLambda(direct_patch),
        ):
            graph = make_workflow_agent(
                {},
                app_config=object(),  # type: ignore[arg-type]
            )
        graph.checkpointer = InMemorySaver()
        config = {"configurable": {"thread_id": "thread-direct"}}

        patch_events = [
            event
            async for event in graph.astream(
                {
                    "workflowAssistant": {
                        "threadId": "thread-direct",
                        "message": "修改当前节点标题",
                        "workflow": workflow.model_dump(),
                        "selectedNodeId": "llm-1",
                    }
                },
                config=config,
                stream_mode="custom",
            )
        ]
        self.assertIn("workflow.workflowPatch", _event_types(patch_events))

        complete_events = [
            event
            async for event in graph.astream(
                {
                    "workflowAssistant": {
                        "threadId": "thread-direct",
                        "message": "当前阶段校验通过",
                        "workflow": workflow.model_dump(),
                        "selectedNodeId": "llm-1",
                        "clientEvent": "stage_validated",
                    }
                },
                config=config,
                stream_mode="custom",
            )
        ]
        self.assertIn("workflow.complete", _event_types(complete_events))

    async def test_metadata_middleware_state_emits_metadata_patch(self) -> None:
        async def metadata(_state):
            return {
                "workflowMetadata": {
                    "name": "订单审核流程",
                    "description": "自动审核订单并通知处理结果",
                }
            }

        workflow = WorkflowDocument(
            id="workflow-1",
            name="Untitled",
            nodes=[],
            edges=[],
        )
        with patch(
            "app.agents.workflow_agent.graph.make_workflow_react_agent",
            return_value=RunnableLambda(metadata),
        ):
            graph = make_workflow_agent(
                {},
                app_config=object(),  # type: ignore[arg-type]
            )

        events = [
            event
            async for event in graph.astream(
                {
                    "workflowAssistant": {
                        "threadId": "thread-metadata",
                        "message": "生成工作流名称和描述",
                        "workflow": workflow.model_dump(),
                    }
                },
                stream_mode="custom",
            )
        ]

        patch_event = next(
            event
            for event in events
            if event["type"] == "workflow.workflowPatch"
        )
        self.assertEqual(
            patch_event["patch"]["operations"],
            [
                {
                    "op": "update_metadata",
                    "name": "订单审核流程",
                    "description": "自动审核订单并通知处理结果",
                }
            ],
        )

    async def test_clarification_middleware_state_emits_clarification(self) -> None:
        async def clarification(_state):
            return {
                "workflowClarification": {
                    "summary": "需要确认通知渠道",
                    "questions": [
                        {
                            "id": "channel",
                            "question": "使用哪个通知渠道？",
                            "reason": "决定通知节点配置",
                            "required": True,
                            "inputType": "single",
                            "options": [
                                {"label": "飞书", "value": "feishu"},
                                {"label": "邮件", "value": "email"},
                            ],
                            "allowOther": True,
                        }
                    ],
                }
            }

        workflow = WorkflowDocument(
            id="workflow-1",
            name="Test",
            nodes=[],
            edges=[],
        )
        with patch(
            "app.agents.workflow_agent.graph.make_workflow_react_agent",
            return_value=RunnableLambda(clarification),
        ):
            graph = make_workflow_agent(
                {},
                app_config=object(),  # type: ignore[arg-type]
            )

        events = [
            event
            async for event in graph.astream(
                {
                    "workflowAssistant": {
                        "threadId": "thread-clarification",
                        "message": "增加通知节点",
                        "workflow": workflow.model_dump(),
                    }
                },
                stream_mode="custom",
            )
        ]

        clarification_event = next(
            event
            for event in events
            if event["type"] == "workflow.clarification"
        )
        self.assertEqual(
            clarification_event["questions"][0]["id"],
            "channel",
        )

    async def test_sandbox_middleware_state_emits_requirement(self) -> None:
        async def sandbox_required(_state):
            return {
                "workflowSandboxRequirement": {
                    "workflowId": "workflow-1",
                    "reason": "需要运行代码节点",
                    "requestedCapabilities": ["bash", "filesystem"],
                }
            }

        workflow = WorkflowDocument(
            id="workflow-1",
            name="Test",
            nodes=[],
            edges=[],
        )
        with patch(
            "app.agents.workflow_agent.graph.make_workflow_react_agent",
            return_value=RunnableLambda(sandbox_required),
        ):
            graph = make_workflow_agent(
                {},
                app_config=object(),  # type: ignore[arg-type]
            )

        events = [
            event
            async for event in graph.astream(
                {
                    "workflowAssistant": {
                        "threadId": "thread-sandbox",
                        "message": "调试代码节点",
                        "workflow": workflow.model_dump(),
                    }
                },
                stream_mode="custom",
            )
        ]

        requirement_event = next(
            event
            for event in events
            if event["type"] == "workflow.sandboxRequired"
        )
        self.assertEqual(requirement_event["workflowId"], "workflow-1")
        self.assertEqual(
            requirement_event["requestedCapabilities"],
            ["bash", "filesystem"],
        )


def _event_types(events: list[dict]) -> list[str]:
    return [event["type"] for event in events]


if __name__ == "__main__":
    unittest.main()
