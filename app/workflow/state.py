from __future__ import annotations

from typing import Any, Literal, Protocol, TypedDict

from app.schemas.workflow import WorkflowNode


class WorkflowState(TypedDict, total=False):
    input: dict[str, Any]
    variables: dict[str, Any]
    steps: list[dict[str, Any]]
    output: dict[str, Any]


class WorkflowRunEvent(TypedDict):
    type: Literal["metadata", "workflow_event", "step", "final", "error"]
    data: dict[str, Any]


class WorkflowNodeExecutor(Protocol):
    async def run(
        self,
        node: WorkflowNode,
        node_input: dict[str, Any],
        state: WorkflowState,
    ) -> dict[str, Any]:
        ...
