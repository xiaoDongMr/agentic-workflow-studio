from __future__ import annotations

import unittest

from app.agents.workflow_agent.schemas import (
    WorkflowAgentContext,
    WorkflowAssistantStreamRequest,
)
from app.agents.workflow_agent.turn import build_task
from app.schemas.workflow import WorkflowDocument, WorkflowNode


class WorkflowTurnTest(unittest.TestCase):
    def test_start_only_workflow_is_marked_as_blank_draft(self) -> None:
        request = WorkflowAssistantStreamRequest(
            threadId="thread-1",
            message="生成一个公众号内容推广工作流",
            workflow=WorkflowDocument(
                id="workflow-1",
                name="未命名项目",
                nodes=[
                    WorkflowNode(
                        id="start",
                        title="开始",
                        type="start",
                        config={},
                    )
                ],
                edges=[],
            ),
        )
        task, _context = build_task(
            request,
            WorkflowAgentContext(threadId="thread-1"),
        )

        self.assertTrue(task["workflowSummary"]["isStartOnlyDraft"])
        self.assertIn("从 0 创建完整工作流", task["instruction"])


if __name__ == "__main__":
    unittest.main()
