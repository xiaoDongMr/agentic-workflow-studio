from __future__ import annotations

from typing import Any, NotRequired

from langchain.agents import AgentState

from app.agents.workflow_agent.schemas import WorkflowReactDecision


class WorkflowAgentState(AgentState[WorkflowReactDecision]):
    sandbox: NotRequired[dict[str, Any] | None]
    workflowAssistant: NotRequired[dict[str, Any] | None]
    workflowContext: NotRequired[dict[str, Any] | None]
    workflowTask: NotRequired[dict[str, Any] | None]
    workflowDecision: NotRequired[dict[str, Any] | None]
    workflowClarification: NotRequired[dict[str, Any] | None]
    workflowMetadata: NotRequired[dict[str, Any] | None]
    workflowSandboxRequirement: NotRequired[dict[str, Any] | None]
    policyResult: NotRequired[dict[str, Any] | None]
    validationResult: NotRequired[dict[str, Any] | None]
    workflowError: NotRequired[dict[str, Any] | None]
