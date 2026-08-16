from __future__ import annotations

from typing import Literal

from langchain.tools import tool

from app.agents.workflow_agent.schemas import WorkflowClarificationInput


@tool(
    "workflow_ask_clarification",
    parse_docstring=True,
    return_direct=True,
)
def workflow_ask_clarification_tool(
    questions: list[WorkflowClarificationInput],
) -> str:
    """Ask the user structured workflow-specific clarification questions.

    Args:
        questions: Questions to ask. Omit options for free-text answers; provide
            string options for choices and set multiple=true only for multi-select.
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
def return_workflow_answer_tool(message: str) -> str:
    """Return a final read-only answer to the workflow assistant UI.

    Args:
        message: Final answer shown to the user.
    """
    return "Workflow answer output is handled by middleware"


@tool("return_workflow_plan", parse_docstring=True, return_direct=True)
def return_workflow_plan_tool(
    summary: str,
    mermaid: str,
) -> str:
    """Return a confirmable workflow plan to the workflow assistant UI.

    Args:
        summary: Short plan summary.
        mermaid: Mermaid flowchart whose nodes use explicit Chinese business
            labels, for example `topic[接收主题] --> draft[生成文章]`; internal
            node IDs and types must not be visible labels.
    """
    return "Workflow plan output is handled by middleware"


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
    "return_workflow_plan_tool",
    "workflow_ask_clarification_tool",
]
