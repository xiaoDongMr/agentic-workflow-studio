from __future__ import annotations

from operator import add
from typing import Annotated, Any, Literal, Protocol, TypedDict

from app.schemas.workflow import WorkflowNode


def merge_dicts(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    return {**left, **right}


class WorkflowState(TypedDict, total=False):
    workflow: dict[str, Any]
    input: dict[str, Any]
    variables: Annotated[dict[str, Any], merge_dicts]
    steps: Annotated[list[dict[str, Any]], add]
    output: Annotated[dict[str, Any], merge_dicts]


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
