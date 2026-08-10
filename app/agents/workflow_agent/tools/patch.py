from __future__ import annotations

from typing import Any

from langchain.tools import tool

from app.agents.workflow_agent.tools.output import (
    bounded_tool_json,
    workflow_tool_output_limit,
)
from app.schemas.workflow import WorkflowDocument
from app.workflow.patch.builder import build_workflow_patch
from app.workflow.patch.schemas import WorkflowPatch
from app.workflow.patch.validator import validate_workflow_patch
from deerflow.tools.types import Runtime


@tool("build_workflow_patch", parse_docstring=True)
def build_workflow_patch_tool(
    operations: list[dict[str, Any]],
    sequence: int = 1,
) -> str:
    """Normalize raw workflow operations into a typed WorkflowPatch.

    Args:
        operations: Minimal add/update/delete node or edge operations.
        sequence: One-based sequence used to position newly created nodes.
    """
    patch = build_workflow_patch(operations, sequence)
    return bounded_tool_json(
        patch.model_dump(),
        max_chars=workflow_tool_output_limit(),
    )


@tool("validate_workflow_patch", parse_docstring=True)
def validate_workflow_patch_tool(
    runtime: Runtime,
    patch: dict[str, Any],
) -> str:
    """Validate that a WorkflowPatch can be applied to the current workflow.

    Args:
        patch: Candidate WorkflowPatch as a JSON object.
    """
    state = runtime.state or {}
    raw_request = state.get("workflowAssistant") or {}
    raw_workflow = raw_request.get("workflow")
    if raw_workflow is None:
        raise ValueError("workflowAssistant.workflow is required")
    document = WorkflowDocument.model_validate(raw_workflow)
    candidate = WorkflowPatch.model_validate(patch)
    result = validate_workflow_patch(document, candidate)
    return bounded_tool_json(
        {
            "valid": result.valid,
            "error": result.error,
            "nodeCount": len(result.workflow.nodes) if result.valid else None,
            "edgeCount": len(result.workflow.edges) if result.valid else None,
        },
        max_chars=workflow_tool_output_limit(runtime),
    )
