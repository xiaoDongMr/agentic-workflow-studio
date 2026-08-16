from __future__ import annotations

from typing import Any, NotRequired

from langchain.agents import AgentState


class WorkflowAgentState(AgentState):
    title: NotRequired[str | None]
    sandbox: NotRequired[dict[str, Any] | None]
    workflowAssistant: NotRequired[dict[str, Any] | None]
    workflowContext: NotRequired[dict[str, Any] | None]
    workflowTask: NotRequired[dict[str, Any] | None]
    workflowMetadata: NotRequired[dict[str, Any] | None]
    workflowError: NotRequired[dict[str, Any] | None]
