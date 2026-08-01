from __future__ import annotations

import unittest

from app.api.routes.stream import _with_thread_id
from app.schemas.run import RunCreateRequest


class ThreadStreamRequestTest(unittest.TestCase):
    def test_thread_route_preserves_workflow_agent(self) -> None:
        body = RunCreateRequest(
            assistant_id="workflow-agent",
            input={"workflowAssistant": {"threadId": "thread-1"}},
            stream_mode=["custom"],
        )

        result = _with_thread_id(body, "thread-1")

        self.assertEqual(result.assistant_id, "workflow-agent")
        self.assertEqual(
            result.config["configurable"]["thread_id"],
            "thread-1",
        )
        self.assertEqual(
            result.input["workflowAssistant"]["threadId"],
            "thread-1",
        )


if __name__ == "__main__":
    unittest.main()
