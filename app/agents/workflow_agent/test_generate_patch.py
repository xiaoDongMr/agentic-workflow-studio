from __future__ import annotations

import json
import unittest
from types import SimpleNamespace
from typing import Any

from langgraph.errors import GraphRecursionError

from app.agents.workflow_agent.schemas import (
    WorkflowAgentContext,
    WorkflowPlanPreviewResult,
)
from app.agents.workflow_agent.tools.generate_patch import (
    make_generate_workflow_patch_tool,
)


class _Builder:
    def __init__(self) -> None:
        self.call: dict[str, Any] | None = None

    async def build(self, **kwargs: Any):
        self.call = kwargs
        return kwargs["graph"], "生成完成"


class _RecursingBuilder:
    async def build(self, **_kwargs: Any):
        raise GraphRecursionError("recursion limit reached")


def _plan() -> WorkflowPlanPreviewResult:
    return WorkflowPlanPreviewResult(
        summary="生成内容推广流程",
        mermaid="flowchart TD\nstart[开始] --> draft[生成内容]",
    )


def _state(
    *,
    plan: WorkflowPlanPreviewResult | None = None,
    pending_confirmation: bool = False,
    mode: str = "generate",
) -> dict[str, Any]:
    return {
        "workflowAssistant": {
            "threadId": "thread-1",
            "message": "生成内容推广流程",
            "workflow": {
                "id": "workflow-1",
                "name": "内容推广",
                "nodes": [
                    {
                        "id": "start",
                        "title": "开始",
                        "type": "start",
                        "config": {},
                    }
                ],
                "edges": [],
            },
        },
        "workflowContext": WorkflowAgentContext(
            threadId="thread-1",
            requestSummary="生成内容推广流程",
            pendingConfirmation=pending_confirmation,
            plan=plan,
        ).model_dump(),
        "workflowTask": {"mode": mode},
    }


class GenerateWorkflowPatchToolTest(unittest.IsolatedAsyncioTestCase):
    async def test_model_schema_only_exposes_goal(self) -> None:
        tool = make_generate_workflow_patch_tool(_Builder())  # type: ignore[arg-type]

        self.assertEqual(set(tool.args), {"goal"})

    async def test_reads_graph_and_confirmed_mermaid_from_runtime_state(
        self,
    ) -> None:
        builder = _Builder()
        tool = make_generate_workflow_patch_tool(builder)  # type: ignore[arg-type]
        runtime = SimpleNamespace(
            state=_state(plan=_plan()),
            stream_writer=None,
        )

        result = await tool.coroutine(  # type: ignore[misc]
            runtime=runtime,
            goal="按确认方案生成内容推广流程",
        )

        self.assertEqual(json.loads(result)["summary"], "生成完成")
        self.assertIsNotNone(builder.call)
        assert builder.call is not None
        self.assertEqual(builder.call["goal"], "按确认方案生成内容推广流程")
        self.assertEqual(builder.call["workflow_id"], "workflow-1")
        self.assertEqual(builder.call["graph"].nodes[0].id, "start")
        self.assertEqual(
            builder.call["confirmed_mermaid"],
            _plan().mermaid,
        )
        self.assertEqual(builder.call["thread_id"], "thread-1")

    async def test_generate_mode_rejects_missing_confirmed_plan(self) -> None:
        tool = make_generate_workflow_patch_tool(_Builder())  # type: ignore[arg-type]
        runtime = SimpleNamespace(
            state=_state(),
            stream_writer=None,
        )

        with self.assertRaisesRegex(ValueError, "草图不存在或已过期"):
            await tool.coroutine(  # type: ignore[misc]
                runtime=runtime,
                goal="生成内容推广流程",
            )

    async def test_translates_subagent_recursion_error(self) -> None:
        tool = make_generate_workflow_patch_tool(
            _RecursingBuilder()  # type: ignore[arg-type]
        )
        runtime = SimpleNamespace(
            state=_state(plan=_plan()),
            stream_writer=None,
        )

        with self.assertRaisesRegex(
            RuntimeError,
            "does not indicate a cycle",
        ):
            await tool.coroutine(  # type: ignore[misc]
                runtime=runtime,
                goal="生成内容推广流程",
            )

    async def test_generate_mode_rejects_pending_plan(self) -> None:
        tool = make_generate_workflow_patch_tool(_Builder())  # type: ignore[arg-type]
        runtime = SimpleNamespace(
            state=_state(plan=_plan(), pending_confirmation=True),
            stream_writer=None,
        )

        with self.assertRaisesRegex(ValueError, "草图尚未确认"):
            await tool.coroutine(  # type: ignore[misc]
                runtime=runtime,
                goal="生成内容推广流程",
            )

    async def test_decide_mode_restores_confirmed_plan(self) -> None:
        builder = _Builder()
        tool = make_generate_workflow_patch_tool(builder)  # type: ignore[arg-type]
        runtime = SimpleNamespace(
            state=_state(plan=_plan(), mode="decide"),
            stream_writer=None,
        )

        await tool.coroutine(  # type: ignore[misc]
            runtime=runtime,
            goal="只修改当前节点",
        )

        self.assertIsNotNone(builder.call)
        assert builder.call is not None
        self.assertEqual(builder.call["confirmed_mermaid"], _plan().mermaid)

    async def test_decide_mode_ignores_unconfirmed_plan(self) -> None:
        builder = _Builder()
        tool = make_generate_workflow_patch_tool(builder)  # type: ignore[arg-type]
        runtime = SimpleNamespace(
            state=_state(
                plan=_plan(),
                pending_confirmation=True,
                mode="decide",
            ),
            stream_writer=None,
        )

        await tool.coroutine(  # type: ignore[misc]
            runtime=runtime,
            goal="只修改当前节点",
        )

        self.assertIsNotNone(builder.call)
        assert builder.call is not None
        self.assertIsNone(builder.call["confirmed_mermaid"])


if __name__ == "__main__":
    unittest.main()
