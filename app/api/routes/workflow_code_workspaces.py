from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Request

from deerflow.persistence.engine import get_session_factory

from app.deps import get_app_config as get_runtime_app_config
from app.sandbox_pool import KubernetesApiSandboxPool
from app.schemas.workflow_code_workspace import (
    WorkflowCodePackagePage,
    WorkflowCodePackageSummary,
    WorkflowCodeWorkspace,
    WorkflowCodeWorkspaceRequest,
    WorkflowCodeWorkspaceRestoreRequest,
    WorkflowCodeWorkspaceRestoreResult,
    WorkflowCodeWorkspaceSaveRequest,
    WorkflowCodeWorkspaceSaveResult,
    WorkflowCodeWorkspaceStatus,
)
from app.services.workflow_code_persistence import WorkflowCodePersistenceService
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
    return KubernetesApiSandboxPool(get_runtime_app_config(request))


def _code_persistence_service(request: Request) -> WorkflowCodePersistenceService:
    session_factory = get_session_factory()
    if session_factory is None:
        raise HTTPException(
            status_code=503,
            detail="Workflow persistence is not available. Configure database.backend as sqlite or postgres.",
        )
    return WorkflowCodePersistenceService(session_factory, get_runtime_app_config(request))


async def _bound_session_and_sandbox(workflow_id: str, request: Request):
    session = await _get_store().get_session(workflow_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Workflow sandbox session not found")
    if not session.sandbox_id:
        raise HTTPException(status_code=400, detail="Workflow sandbox is not bound")
    return session, _pool(request).get(session.sandbox_id)


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

    try:
        session, sandbox = await _bound_session_and_sandbox(normalized_workflow_id, request)
        result = ensure_workflow_code_workspace(
            session=session,
            sandbox=sandbox,
            node_id=normalized_node_id,
            entry_function=body.entryFunction,
            code_capability=body.codeCapability,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"打开代码工作区失败：{exc}") from exc

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


@router.get(
    "/workflows/{workflow_id}/nodes/{node_id}/code-workspace/status",
    response_model=WorkflowCodeWorkspaceStatus,
)
async def get_workflow_node_code_workspace_status(
    workflow_id: str,
    node_id: str,
    request: Request,
) -> WorkflowCodeWorkspaceStatus:
    normalized_workflow_id = _normalize_uuid(workflow_id, "workflow id")
    normalized_node_id = _normalize_node_id(node_id)
    status = await _code_persistence_service(request).get_status(
        workflow_id=normalized_workflow_id,
        node_id=normalized_node_id,
    )
    return WorkflowCodeWorkspaceStatus(
        nodeId=status.node_id,
        packageId=status.package_id,
        workspaceHash=status.workspace_hash,
        fileCount=status.file_count,
        totalSize=status.total_size,
        savedAt=status.saved_at,
    )


@router.get(
    "/workflows/{workflow_id}/nodes/{node_id}/code-workspace/packages",
    response_model=WorkflowCodePackagePage,
)
async def list_workflow_node_code_workspace_packages(
    workflow_id: str,
    node_id: str,
    request: Request,
    limit: int = 20,
) -> WorkflowCodePackagePage:
    normalized_workflow_id = _normalize_uuid(workflow_id, "workflow id")
    normalized_node_id = _normalize_node_id(node_id)
    packages = await _code_persistence_service(request).list_packages(
        workflow_id=normalized_workflow_id,
        node_id=normalized_node_id,
        limit=limit,
    )
    return WorkflowCodePackagePage(
        items=[
            WorkflowCodePackageSummary(
                id=package.id,
                nodeId=package.node_id,
                codeCapability=package.code_capability,
                entryFile=package.entry_file,
                packageName=package.package_name,
                packageHash=package.package_hash,
                workspaceHash=package.workspace_hash,
                fileCount=package.file_count,
                totalSize=package.total_size,
                sourceSandboxId=package.source_sandbox_id,
                saveReason=package.save_reason,
                createdAt=package.created_at,
            )
            for package in packages
        ]
    )


@router.post(
    "/workflows/{workflow_id}/nodes/{node_id}/code-workspace/package",
    response_model=WorkflowCodeWorkspaceSaveResult,
)
async def save_workflow_node_code_workspace_package(
    workflow_id: str,
    node_id: str,
    body: WorkflowCodeWorkspaceSaveRequest,
    request: Request,
) -> WorkflowCodeWorkspaceSaveResult:
    normalized_workflow_id = _normalize_uuid(workflow_id, "workflow id")
    normalized_node_id = _normalize_node_id(node_id)
    try:
        session, sandbox = await _bound_session_and_sandbox(normalized_workflow_id, request)
        result = await _code_persistence_service(request).save_workspace(
            session=session,
            sandbox=sandbox,
            node_id=normalized_node_id,
            code_capability=body.codeCapability,
            entry_file=body.entryFile,
            save_reason="manual_save",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"保存代码工作区失败：{exc}") from exc

    return WorkflowCodeWorkspaceSaveResult(
        nodeId=result.node_id,
        status=result.status,
        packageId=result.package_id,
        workspaceHash=result.workspace_hash,
        fileCount=result.file_count,
        totalSize=result.total_size,
        packageUri=result.package_uri,
        message=result.message,
    )


@router.post(
    "/workflows/{workflow_id}/nodes/{node_id}/code-workspace/packages/{package_id}/restore",
    response_model=WorkflowCodeWorkspaceRestoreResult,
)
async def restore_workflow_node_code_workspace_package_version(
    workflow_id: str,
    node_id: str,
    package_id: str,
    body: WorkflowCodeWorkspaceRestoreRequest,
    request: Request,
) -> WorkflowCodeWorkspaceRestoreResult:
    normalized_workflow_id = _normalize_uuid(workflow_id, "workflow id")
    normalized_node_id = _normalize_node_id(node_id)
    normalized_package_id = _normalize_uuid(package_id, "package id")
    try:
        session, sandbox = await _bound_session_and_sandbox(normalized_workflow_id, request)
        result = await _code_persistence_service(request).restore_workspace_package(
            session=session,
            sandbox=sandbox,
            node_id=normalized_node_id,
            code_capability=body.codeCapability,
            package_id=normalized_package_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"恢复代码工作区失败：{exc}") from exc

    return WorkflowCodeWorkspaceRestoreResult(
        nodeId=result.node_id,
        packageId=result.package_id,
        restored=result.restored,
        message=result.message,
    )
