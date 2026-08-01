from __future__ import annotations

import unittest
from unittest.mock import patch

from app.agents.workflow_agent.graph import make_workflow_agent
from app.agents.workflow_agent.schemas import WorkflowAssistantStreamRequest
from app.schemas.workflow import WorkflowDocument


class FakeOrchestrator:
    def __init__(self, _: object):
        pass

    async def stream(self, request: WorkflowAssistantStreamRequest):
        yield "session", {"threadId": request.threadId or "thread-1"}
        yield "message", {
            "type": "legacy_message_type",
            "threadId": request.threadId or "thread-1",
            "message": "正在规划",
        }
        yield "end", {"threadId": request.threadId or "thread-1"}


class WorkflowAgentGraphTest(unittest.IsolatedAsyncioTestCase):
    async def test_emits_workflow_custom_events(self) -> None:
        workflow = WorkflowDocument(
            id="workflow-1",
            name="Test",
            nodes=[],
            edges=[],
        )
        graph = make_workflow_agent(
            {},
            app_config=object(),  # type: ignore[arg-type]
        )

        events = []
        with patch(
            "app.agents.workflow_agent.graph.WorkflowAgentOrchestrator",
            FakeOrchestrator,
        ):
            async for event in graph.astream(
                {
                    "workflowAssistant": {
                        "threadId": "thread-1",
                        "message": "生成测试流程",
                        "workflow": workflow.model_dump(),
                    }
                },
                stream_mode="custom",
            ):
                events.append(event)

        self.assertEqual(
            [event["type"] for event in events],
            [
                "workflow.session",
                "workflow.message",
                "workflow.end",
            ],
        )


if __name__ == "__main__":
    unittest.main()
