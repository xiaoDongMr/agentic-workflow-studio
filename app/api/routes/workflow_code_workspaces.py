from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Request

from deerflow.config.app_config import get_app_config as get_latest_app_config
from deerflow.persistence.engine import get_session_factory

from app.deps import get_app_config as get_runtime_app_config
from app.sandbox_pool import KubernetesApiSandboxPool
from app.schemas.workflow_code_workspace import (
    WorkflowCodeWorkspace,
    WorkflowCodeWorkspaceRequest,
)
from app.services.workflow_code_workspace import (
    ensure_workflow_code_workspace,
    normalize_workflow_code_path_segment,
)
from app.services.workflow_sandbox_session import WorkflowSandboxSessionStore

router = APIRouter()


def _normalize_uuid(value: str, label: str) -> str:
    try:
        return str(UUID(value))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid {label}") from exc


def _normalize_node_id(value: str) -> str:
    try:
        return normalize_workflow_code_path_segment(value, "node id")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Invalid node id") from exc


def _get_store() -> WorkflowSandboxSessionStore:
    session_factory = get_session_factory()
    if session_factory is None:
        raise HTTPException(
            status_code=503,
            detail="Workflow persistence is not available. Configure database.backend as sqlite or postgres.",
        )
    return WorkflowSandboxSessionStore(session_factory)


def _pool(request: Request) -> KubernetesApiSandboxPool:
    try:
        app_config = get_latest_app_config()
    except Exception:
        app_config = get_runtime_app_config(request)
    return KubernetesApiSandboxPool(app_config)


@router.post(
    "/workflows/{workflow_id}/nodes/{node_id}/code-workspace",
    response_model=WorkflowCodeWorkspace,
)
async def open_workflow_node_code_workspace(
    workflow_id: str,
    node_id: str,
    body: WorkflowCodeWorkspaceRequest,
    request: Request,
) -> WorkflowCodeWorkspace:
    normalized_workflow_id = _normalize_uuid(workflow_id, "workflow id")
    normalized_node_id = _normalize_node_id(node_id)
    session = await _get_store().get_session(normalized_workflow_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Workflow sandbox session not found")
    if not session.sandbox_id:
        raise HTTPException(status_code=400, detail="Workflow sandbox is not bound")

    try:
        sandbox = _pool(request).get(session.sandbox_id)
        result = ensure_workflow_code_workspace(
            session=session,
            sandbox=sandbox,
            node_id=normalized_node_id,
            entry_function=body.entryFunction,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return WorkflowCodeWorkspace(
        workflowId=result.workflow_id,
        nodeId=result.node_id,
        sandboxId=result.sandbox_id,
        sandboxUrl=result.sandbox_url,
        folderPath=result.folder_path,
        entryFilePath=result.entry_file_path,
        codeUrl=result.code_url,
        created=result.created,
    )
