from __future__ import annotations

import unittest

from app.agents.workflow_agent.emitter import WorkflowOutputEmitter
from app.agents.workflow_agent.schemas import (
    WorkflowActionPlan,
    WorkflowAgentContext,
    WorkflowAssistantStreamRequest,
    WorkflowMetadataProposal,
)
from app.schemas.workflow import WorkflowDocument


class WorkflowOutputEmitterTest(unittest.TestCase):
    def setUp(self) -> None:
        self.events: list[dict] = []
        self.writer = self.events.append
        self.emitter = WorkflowOutputEmitter()
        self.request = WorkflowAssistantStreamRequest(
            threadId="thread-1",
            message="创建订单审核流程",
            workflow=WorkflowDocument(
                id="workflow-1",
                name="未命名项目",
                nodes=[],
                edges=[],
            ),
        )
        self.context = WorkflowAgentContext(threadId="thread-1")

    def test_metadata_emits_intermediate_patch_without_end(self) -> None:
        self.emitter.emit_metadata(
            self.writer,
            request=self.request,
            context=self.context,
            proposal=WorkflowMetadataProposal(
                name="订单审核流程",
                description="自动审核订单并通知结果",
            ),
        )

        self.assertEqual(
            [event["type"] for event in self.events],
            ["workflow.workflowMetadata"],
        )
        self.assertEqual(self.events[0]["name"], "订单审核流程")
        self.assertEqual(
            self.events[0]["description"],
            "自动审核订单并通知结果",
        )

    def test_plan_emits_preview_and_updates_confirmation_context(self) -> None:
        action = WorkflowActionPlan(
            intent="create_workflow",
            scope="full_workflow",
            riskLevel="high",
            requiresConfirmation=True,
            summary="创建订单审核流程",
        )
        next_context, policy = self.emitter.emit_plan(
            self.writer,
            request=self.request,
            context=self.context,
            action=action,
            summary="创建订单审核流程",
            mermaid="flowchart TD\n  start[提交订单] --> review[审核订单]",
        )

        self.assertTrue(policy.allowed)
        self.assertTrue(next_context.pendingConfirmation)
        self.assertIsNotNone(next_context.plan)
        self.assertEqual(
            [event["type"] for event in self.events],
            ["workflow.planPreview", "workflow.end"],
        )

    def test_generated_graph_completion_runs_policy_validation(self) -> None:
        request = self.request.model_copy(update={"selectedNodeId": "llm-1"})
        request.workflow = WorkflowDocument.model_validate(
            {
                "id": "workflow-1",
                "name": "测试流程",
                "nodes": [
                    {
                        "id": "llm-1",
                        "title": "旧标题",
                        "type": "llm",
                        "config": {},
                    }
                ],
                "edges": [],
            }
        )
        action = WorkflowActionPlan(
            intent="modify_selected_node",
            scope="selected_node_only",
            riskLevel="low",
            targetNodeIds=["llm-1"],
            summary="调整节点标题",
        )

        next_context, policy = self.emitter.complete_generated_graph(
            self.writer,
            request=request,
            context=self.context,
            action=action,
        )

        self.assertTrue(policy.allowed)
        self.assertEqual(next_context.targetNodeIds, ["llm-1"])
        self.assertEqual(
            [event["type"] for event in self.events],
            ["workflow.complete", "workflow.end"],
        )


if __name__ == "__main__":
    unittest.main()
