from __future__ import annotations

import unittest
from types import SimpleNamespace
from typing import Any, cast

from langchain_core.messages import ToolMessage
from langgraph.graph import END
from langgraph.prebuilt.tool_node import ToolCallRequest
from langgraph.types import Command

from app.agents.workflow_agent.middleware import (
    WorkflowClarificationMiddleware,
    WorkflowMetadataMiddleware,
    WorkflowSandboxMiddleware,
)
from app.agents.workflow_agent.sandbox import WorkflowSandboxResolution


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
            runtime=SimpleNamespace(state=state or {}),
        ),
    )


class _SandboxResolver:
    def __init__(self, resolution: WorkflowSandboxResolution) -> None:
        self._resolution = resolution

    async def resolve(self, workflow_id: str) -> WorkflowSandboxResolution:
        return self._resolution


class WorkflowMiddlewareTest(unittest.IsolatedAsyncioTestCase):
    def test_clarification_tool_writes_state_and_interrupts(self) -> None:
        result = WorkflowClarificationMiddleware().wrap_tool_call(
            _request(
                "workflow_ask_clarification",
                {
                    "summary": "需要确认渠道",
                    "questions": [
                        {
                            "id": "channel",
                            "question": "使用哪个渠道？",
                            "inputType": "single",
                            "options": [{"label": "飞书", "value": "feishu"}],
                        }
                    ],
                },
            ),
            lambda _request: ToolMessage(content="unexpected", tool_call_id="x"),
        )

        self.assertIsInstance(result, Command)
        self.assertEqual(result.goto, END)
        self.assertEqual(result.update["workflowClarification"]["questions"][0]["id"], "channel")

    def test_metadata_tool_writes_state_and_interrupts(self) -> None:
        result = WorkflowMetadataMiddleware().wrap_tool_call(
            _request(
                "generate_workflow_metadata",
                {"name": "订单审核", "description": "审核订单并通知结果"},
            ),
            lambda _request: ToolMessage(content="unexpected", tool_call_id="x"),
        )

        self.assertIsInstance(result, Command)
        self.assertEqual(result.goto, END)
        self.assertEqual(result.update["workflowMetadata"]["name"], "订单审核")

    async def test_unbound_sandbox_interrupts_without_running_tool(self) -> None:
        middleware = WorkflowSandboxMiddleware(
            resolver=cast(
                Any,
                _SandboxResolver(
                    WorkflowSandboxResolution(
                        workflow_id="workflow-1",
                        bound=False,
                        reason="尚未绑定沙箱",
                    )
                ),
            )
        )
        handled = False

        async def handler(_request: ToolCallRequest) -> ToolMessage:
            nonlocal handled
            handled = True
            return ToolMessage(content="unexpected", tool_call_id="x")

        result = await middleware.awrap_tool_call(
            _request(
                "run_node_skill",
                {},
                state={
                    "workflowAssistant": {
                        "workflow": {"id": "workflow-1"},
                    }
                },
            ),
            handler,
        )

        self.assertFalse(handled)
        self.assertIsInstance(result, Command)
        self.assertEqual(result.goto, END)
        self.assertEqual(
            result.update["workflowSandboxRequirement"]["workflowId"],
            "workflow-1",
        )

    async def test_bound_sandbox_is_injected_before_tool_execution(self) -> None:
        middleware = WorkflowSandboxMiddleware(
            resolver=cast(
                Any,
                _SandboxResolver(
                    WorkflowSandboxResolution(
                        workflow_id="workflow-1",
                        bound=True,
                        sandbox_id="sandbox-1",
                    )
                ),
            )
        )
        result = await middleware.awrap_tool_call(
            _request(
                "run_node_skill",
                {},
                state={
                    "workflowAssistant": {
                        "workflow": {"id": "workflow-1"},
                    }
                },
            ),
            lambda _request: _unexpected_tool_result(),
        )

        self.assertIsInstance(result, Command)
        self.assertEqual(
            result.update["sandbox"],
            {"sandbox_id": "sandbox-1"},
        )


async def _unexpected_tool_result() -> ToolMessage:
    return ToolMessage(content="unexpected", tool_call_id="x")


if __name__ == "__main__":
    unittest.main()
