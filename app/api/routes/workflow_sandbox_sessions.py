from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException

from deerflow.persistence.engine import get_session_factory

from app.schemas.workflow_sandbox import (
    WorkflowSandboxSession,
    WorkflowSandboxSessionUpdateRequest,
)
from app.services.workflow_sandbox_session import (
    WorkflowSandboxSessionBinding,
    WorkflowSandboxSessionRecord,
    WorkflowSandboxSessionStore,
)

router = APIRouter()


def _normalize_workflow_id(workflow_id: str) -> str:
    try:
        return str(UUID(workflow_id))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Invalid workflow id") from exc


def _get_store() -> WorkflowSandboxSessionStore:
    session_factory = get_session_factory()
    if session_factory is None:
        raise HTTPException(
            status_code=503,
            detail="Workflow persistence is not available. Configure database.backend as sqlite or postgres.",
        )
    return WorkflowSandboxSessionStore(session_factory)


def _to_response(record: WorkflowSandboxSessionRecord) -> WorkflowSandboxSession:
    return WorkflowSandboxSession(
        id=record.id,
        workflowId=record.workflow_id,
        sandboxId=record.sandbox_id,
        sandboxUrl=record.sandbox_url,
        imageId=record.image_id,
        codeStatus=record.code_status,
        lastSavedCodeSignature=record.last_saved_code_signature,
        createdAt=record.created_at.isoformat(),
        updatedAt=record.updated_at.isoformat(),
    )


@router.get(
    "/workflows/{workflow_id}/sandbox-session",
    response_model=WorkflowSandboxSession,
)
async def get_workflow_sandbox_session(workflow_id: str) -> WorkflowSandboxSession:
    sandbox_session = await _get_store().get_session(
        _normalize_workflow_id(workflow_id)
    )
    if sandbox_session is None:
        raise HTTPException(status_code=404, detail="Workflow sandbox session not found")
    return _to_response(sandbox_session)


@router.post(
    "/workflows/{workflow_id}/sandbox-session",
    response_model=WorkflowSandboxSession,
)
async def ensure_workflow_sandbox_session(workflow_id: str) -> WorkflowSandboxSession:
    sandbox_session = await _get_store().ensure_session(
        _normalize_workflow_id(workflow_id)
    )
    if sandbox_session is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return _to_response(sandbox_session)


@router.patch(
    "/workflows/{workflow_id}/sandbox-session",
    response_model=WorkflowSandboxSession,
)
async def update_workflow_sandbox_session(
    workflow_id: str,
    body: WorkflowSandboxSessionUpdateRequest,
) -> WorkflowSandboxSession:
    normalized_workflow_id = _normalize_workflow_id(workflow_id)
    sandbox_session = await _get_store().update_binding(
        normalized_workflow_id,
        WorkflowSandboxSessionBinding(
            sandbox_id=body.sandboxId,
            sandbox_url=body.sandboxUrl,
            image_id=body.imageId,
            code_status=body.codeStatus,
        ),
    )
    if sandbox_session is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return _to_response(sandbox_session)
