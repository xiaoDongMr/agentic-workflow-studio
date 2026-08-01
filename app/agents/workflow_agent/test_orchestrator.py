from __future__ import annotations

import unittest

from app.agents.workflow_agent.orchestrator import WorkflowAgentOrchestrator
from app.agents.workflow_agent.schemas import (
    WorkflowAssistantPatchResult,
    WorkflowAssistantStreamRequest,
    WorkflowClarificationQuestion,
    WorkflowPatchDraft,
    WorkflowPlanDecision,
    WorkflowPlanStage,
)
from app.schemas.workflow import WorkflowDocument
from app.workflow.patch.builder import apply_workflow_patch


class FakeWorkflowGenerationModel:
    async def plan(self, **_: object) -> WorkflowPlanDecision:
        return WorkflowPlanDecision(
            kind="plan",
            summary="测试流程",
            mermaid="flowchart TD\n  Start --> End",
            stages=[
                WorkflowPlanStage(
                    stageId="start",
                    sequence=1,
                    title="开始",
                    instruction="生成开始节点",
                ),
                WorkflowPlanStage(
                    stageId="end",
                    sequence=2,
                    title="结束",
                    instruction="生成结束节点和连线",
                    final=True,
                ),
            ],
        )

    async def generate_stage(
        self,
        *,
        stage: WorkflowPlanStage,
        **_: object,
    ) -> WorkflowPatchDraft:
        if stage.stageId == "start":
            return WorkflowPatchDraft(
                summary="生成开始节点",
                operations=[
                    {
                        "op": "add_node",
                        "node": {"id": "start", "type": "start", "title": "开始"},
                    }
                ],
            )
        return WorkflowPatchDraft(
            summary="生成结束节点",
            operations=[
                {
                    "op": "add_node",
                    "node": {"id": "end", "type": "end", "title": "结束"},
                },
                {
                    "op": "add_edge",
                    "edge": {"source": "start", "target": "end"},
                },
            ],
        )

    async def repair(self, **_: object) -> WorkflowPatchDraft:
        return WorkflowPatchDraft(
            summary="修复开始节点",
            operations=[
                {
                    "op": "update_node",
                    "nodeId": "start",
                    "partial": {"description": "已修复"},
                }
            ],
        )


class WorkflowAgentOrchestratorTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        WorkflowAgentOrchestrator._sessions.clear()
        self.orchestrator = WorkflowAgentOrchestrator.__new__(
            WorkflowAgentOrchestrator
        )
        self.orchestrator._agent = FakeWorkflowGenerationModel()
        self.workflow = WorkflowDocument(
            id="workflow-1",
            name="Test",
            nodes=[],
            edges=[],
        )

    async def test_plan_stage_repair_and_completion(self) -> None:
        plan_events = await self._events("生成测试流程")
        self.assertIn("planPreview", [event for event, _ in plan_events])

        first_events = await self._events("确认", client_event="confirm_plan")
        first_result = _patch_result(first_events)
        with_start = apply_workflow_patch(self.workflow, first_result.patch)
        self.assertEqual([node.id for node in with_start.nodes], ["start"])

        second_events = await self._events(
            "继续",
            workflow=with_start,
            client_event="stage_validated",
        )
        second_result = _patch_result(second_events)
        completed = apply_workflow_patch(with_start, second_result.patch)
        self.assertEqual([node.id for node in completed.nodes], ["start", "end"])

        repair_events = await self._events(
            "修复",
            workflow=completed,
            client_event="validation_failed",
            validation={"errorCount": 1},
        )
        repair_result = _patch_result(repair_events)
        self.assertTrue(repair_result.stage.final)
        completed = apply_workflow_patch(completed, repair_result.patch)

        complete_events = await self._events(
            "完成",
            workflow=completed,
            client_event="stage_validated",
        )
        self.assertIn("complete", [event for event, _ in complete_events])

    def test_clarification_question_supports_choices_and_other(self) -> None:
        question = WorkflowClarificationQuestion.model_validate(
            {
                "id": "q1",
                "question": "请选择通知渠道",
                "inputType": "multiple",
                "options": [
                    {"label": "邮件", "value": "email"},
                    {"label": "短信", "value": "sms"},
                ],
            }
        )

        self.assertEqual(question.inputType, "multiple")
        self.assertEqual([option.value for option in question.options], ["email", "sms"])
        self.assertTrue(question.allowOther)

        text_question = WorkflowClarificationQuestion(
            id="q2",
            question="请补充审批规则",
        )
        self.assertEqual(text_question.inputType, "text")

    async def _events(
        self,
        message: str,
        *,
        workflow: WorkflowDocument | None = None,
        client_event: str = "user_message",
        validation: dict | None = None,
    ):
        request = WorkflowAssistantStreamRequest(
            threadId="thread-1",
            message=message,
            workflow=workflow or self.workflow,
            clientEvent=client_event,
            validation=validation,
        )
        return [event async for event in self.orchestrator.stream(request)]


def _patch_result(events) -> WorkflowAssistantPatchResult:
    return next(
        WorkflowAssistantPatchResult.model_validate(payload)
        for event, payload in events
        if event == "workflowPatch"
    )


if __name__ == "__main__":
    unittest.main()
