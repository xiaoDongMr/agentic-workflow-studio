from __future__ import annotations

from dataclasses import dataclass

from app.schemas.workflow import WorkflowDocument
from app.workflow.patch.builder import apply_workflow_patch
from app.workflow.patch.schemas import WorkflowPatch


@dataclass(frozen=True)
class WorkflowPatchValidation:
    workflow: WorkflowDocument
    error: str | None = None

    @property
    def valid(self) -> bool:
        return self.error is None


def validate_workflow_patch(
    workflow: WorkflowDocument,
    patch: WorkflowPatch,
) -> WorkflowPatchValidation:
    try:
        next_workflow = apply_workflow_patch(workflow, patch)
    except (TypeError, ValueError) as exc:
        return WorkflowPatchValidation(workflow=workflow, error=str(exc))
    return WorkflowPatchValidation(workflow=next_workflow)


def require_valid_workflow_patch(
    workflow: WorkflowDocument,
    patch: WorkflowPatch,
) -> WorkflowDocument:
    result = validate_workflow_patch(workflow, patch)
    if not result.valid:
        raise ValueError(result.error or "workflow patch validation failed")
    return result.workflow
