from __future__ import annotations

from typing import Literal

from langchain.tools import tool

from app.agents.workflow_agent.schemas import (
    WorkflowActionPlan,
    WorkflowClarificationQuestion,
    WorkflowPlanStage,
)
from app.schemas.workflow import WorkflowEdge, WorkflowNode


@tool(
    "workflow_ask_clarification",
    parse_docstring=True,
    return_direct=True,
)
def workflow_ask_clarification_tool(
    summary: str,
    questions: list[WorkflowClarificationQuestion],
) -> str:
    """Ask the user structured workflow-specific clarification questions.

    Args:
        summary: Short explanation of why clarification is required.
        questions: Structured questions following the workflow clarification schema.
    """
    return "Workflow clarification is handled by middleware"


@tool("generate_workflow_metadata", parse_docstring=True)
def generate_workflow_metadata_tool(
    name: str,
    description: str,
) -> str:
    """Propose a workflow name and description as a metadata-only patch.

    Args:
        name: Concise workflow name.
        description: Clear description of the workflow goal and behavior.
    """
    return "Workflow metadata generation is handled by middleware"


@tool("request_workflow_sandbox", parse_docstring=True)
def request_workflow_sandbox_tool(
    reason: str,
    requested_capabilities: list[
        Literal["mcp", "bash", "python", "browser", "filesystem"]
    ],
) -> str:
    """Resolve the sandbox bound to the current workflow before using sandbox tools.

    Args:
        reason: Why the current task requires a sandbox.
        requested_capabilities: Sandbox capabilities required by the task.
    """
    return "Workflow sandbox resolution is handled by middleware"


@tool("return_workflow_answer", parse_docstring=True, return_direct=True)
def return_workflow_answer_tool(
    action: WorkflowActionPlan,
    message: str,
) -> str:
    """Return a final read-only answer to the workflow assistant UI.

    Args:
        action: Workflow action metadata with intent, scope, riskLevel and targetNodeIds.
        message: Final answer shown to the user.
    """
    return "Workflow answer output is handled by middleware"


@tool("return_workflow_plan", parse_docstring=True, return_direct=True)
def return_workflow_plan_tool(
    action: WorkflowActionPlan,
    summary: str,
    mermaid: str,
    stages: list[WorkflowPlanStage],
    assumptions: list[str] | None = None,
) -> str:
    """Return a confirmable workflow plan to the workflow assistant UI.

    Args:
        action: Workflow action metadata with intent, scope, riskLevel and targetNodeIds.
        summary: Short plan summary.
        mermaid: Mermaid flowchart whose nodes use explicit Chinese business
            labels, for example `topic[接收主题] --> draft[生成文章]`; internal
            node IDs and types must not be visible labels.
        stages: Ordered stages; every stage must list one or two IDs used by
            its corresponding Mermaid nodes. nodeIds must never be empty.
        assumptions: Assumptions made while preparing the plan.
    """
    return "Workflow plan output is handled by middleware"


@tool("return_workflow_graph", parse_docstring=True, return_direct=True)
def return_workflow_graph_tool(
    action: WorkflowActionPlan,
    summary: str,
    nodes: list[WorkflowNode],
    edges: list[WorkflowEdge],
) -> str:
    """Return the complete generated workflow Graph to the assistant UI.

    Args:
        action: Workflow action metadata with intent, scope, riskLevel and targetNodeIds.
        summary: Short description of the generated or modified workflow.
        nodes: Complete nodes returned by generate_workflow_patch.
        edges: Complete edges returned by generate_workflow_patch.
    """
    return "Workflow Graph output is handled by middleware"


@tool("return_workflow_error", parse_docstring=True, return_direct=True)
def return_workflow_error_tool(message: str) -> str:
    """Return a terminal workflow-specific error to the workflow assistant UI.

    Args:
        message: Clear user-facing error message.
    """
    return "Workflow error output is handled by middleware"


__all__ = [
    "generate_workflow_metadata_tool",
    "request_workflow_sandbox_tool",
    "return_workflow_answer_tool",
    "return_workflow_error_tool",
    "return_workflow_graph_tool",
    "return_workflow_plan_tool",
    "workflow_ask_clarification_tool",
]
