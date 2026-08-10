from __future__ import annotations

from typing import Any, Literal

from langchain.tools import tool


@tool("workflow_ask_clarification", parse_docstring=True)
def workflow_ask_clarification_tool(
    summary: str,
    questions: list[dict[str, Any]],
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


__all__ = [
    "generate_workflow_metadata_tool",
    "request_workflow_sandbox_tool",
    "workflow_ask_clarification_tool",
]
