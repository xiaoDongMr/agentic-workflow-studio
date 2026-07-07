from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from deerflow.persistence.engine import get_session_factory

from app.deps import get_app_config
from app.schemas.workflow import (
    WorkflowDocument,
    WorkflowProjectDuplicateRequest,
    WorkflowProjectPage,
    WorkflowProjectSummary,
    WorkflowProjectUpdateRequest,
    WorkflowRunRequest,
    WorkflowRunResponse,
    WorkflowSaveDraftRequest,
    WorkflowSaveDraftResponse,
    WorkflowVersionSummary,
)
from app.services.workflow_store import (
    DEFAULT_WORKSPACE_ID,
    WorkflowStore,
    WorkflowProjectSummary as StoredWorkflowProjectSummary,
    WorkflowVersionSummary as StoredWorkflowVersionSummary,
)
from app.sandbox_pool import KubernetesApiSandboxPool
from app.services.workflow_code_persistence import WorkflowCodePersistenceService
from app.services.workflow_sandbox_session import WorkflowSandboxSessionStore
from app.services.workflow_runner import WorkflowRunner

router = APIRouter()


def _get_workflow_store() -> WorkflowStore:
    session_factory = get_session_factory()
    if session_factory is None:
        raise HTTPException(
            status_code=503,
            detail="Workflow persistence is not available. Configure database.backend as sqlite or postgres.",
        )
    return WorkflowStore(session_factory)


def _get_session_factory_or_503():
    session_factory = get_session_factory()
    if session_factory is None:
        raise HTTPException(
            status_code=503,
            detail="Workflow persistence is not available. Configure database.backend as sqlite or postgres.",
        )
    return session_factory


def _to_project_summary(summary: StoredWorkflowProjectSummary) -> WorkflowProjectSummary:
    return WorkflowProjectSummary(
        id=summary.id,
        name=summary.name,
        description=summary.description,
        status=summary.status,
        currentDraftVersionId=summary.current_draft_version_id,
        latestPublishedVersionId=summary.latest_published_version_id,
        nodeCount=summary.node_count,
        edgeCount=summary.edge_count,
        updatedAt=summary.updated_at.isoformat(),
        preview=summary.preview,
    )


def _to_version_summary(summary: StoredWorkflowVersionSummary) -> WorkflowVersionSummary:
    return WorkflowVersionSummary(
        id=summary.id,
        version=summary.version,
        name=summary.name,
        description=summary.description,
        nodeCount=summary.node_count,
        edgeCount=summary.edge_count,
        createdAt=summary.created_at.isoformat(),
        updatedAt=summary.updated_at.isoformat(),
        isCurrent=summary.is_current,
    )


@router.get("/workflows", response_model=WorkflowProjectPage)
async def list_workflows(
    workspaceId: str = DEFAULT_WORKSPACE_ID,
    page: int = 1,
    pageSize: int = 6,
    q: str = "",
    filter: str = "all",
) -> WorkflowProjectPage:
    store = _get_workflow_store()
    projects = await store.list_projects(workspaceId, page=page, page_size=pageSize, query=q, project_filter=filter)
    return WorkflowProjectPage(
        items=[_to_project_summary(project) for project in projects.items],
        page=projects.page,
        pageSize=projects.page_size,
        total=projects.total,
    )


@router.post("/workflows/draft", response_model=WorkflowSaveDraftResponse)
async def save_workflow_draft(body: WorkflowSaveDraftRequest, request: Request) -> WorkflowSaveDraftResponse:
    store = _get_workflow_store()
    saved = await store.save_draft(body.workflow, workspace_id=body.workspaceId)
    code_workspace_save_summary = await _save_code_workspaces_for_workflow(saved.workflow, request)
    return WorkflowSaveDraftResponse(
        project=_to_project_summary(saved.project),
        workflow=saved.workflow,
        codeWorkspaceSaveSummary=code_workspace_save_summary,
    )


@router.get("/workflows/{workflow_id}/draft", response_model=WorkflowDocument)
async def get_workflow_draft(workflow_id: str) -> WorkflowDocument:
    store = _get_workflow_store()
    workflow = await store.get_draft(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow draft not found")
    return workflow


@router.get("/workflows/{workflow_id}/versions", response_model=list[WorkflowVersionSummary])
async def list_workflow_versions(
    workflow_id: str,
    workspaceId: str = DEFAULT_WORKSPACE_ID,
) -> list[WorkflowVersionSummary]:
    store = _get_workflow_store()
    versions = await store.list_versions(workflow_id, workspace_id=workspaceId)
    if versions is None:
        raise HTTPException(status_code=404, detail="Workflow project not found")
    return [_to_version_summary(version) for version in versions]


@router.get("/workflows/{workflow_id}/versions/{version_id}", response_model=WorkflowDocument)
async def get_workflow_version(
    workflow_id: str,
    version_id: str,
    workspaceId: str = DEFAULT_WORKSPACE_ID,
) -> WorkflowDocument:
    store = _get_workflow_store()
    workflow = await store.get_version(workflow_id, version_id, workspace_id=workspaceId)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow version not found")
    return workflow


@router.patch("/workflows/{workflow_id}", response_model=WorkflowProjectSummary)
async def update_workflow_project(workflow_id: str, body: WorkflowProjectUpdateRequest) -> WorkflowProjectSummary:
    store = _get_workflow_store()
    project = await store.update_project_metadata(
        workflow_id,
        name=body.name,
        description=body.description,
        workspace_id=body.workspaceId,
    )
    if project is None:
        raise HTTPException(status_code=404, detail="Workflow project not found")
    return _to_project_summary(project)


@router.post("/workflows/{workflow_id}/duplicate", response_model=WorkflowSaveDraftResponse)
async def duplicate_workflow_project(
    workflow_id: str,
    body: WorkflowProjectDuplicateRequest,
) -> WorkflowSaveDraftResponse:
    store = _get_workflow_store()
    saved = await store.duplicate_project(workflow_id, name=body.name, workspace_id=body.workspaceId)
    if saved is None:
        raise HTTPException(status_code=404, detail="Workflow project not found")
    return WorkflowSaveDraftResponse(
        project=_to_project_summary(saved.project),
        workflow=saved.workflow,
    )


async def _save_code_workspaces_for_workflow(workflow: WorkflowDocument, request: Request) -> dict:
    code_nodes = [
        node for node in _flatten_workflow_nodes(workflow.nodes)
        if node.type == "code" and node.config.codeSource == "sandbox_file"
    ]
    summary = {
        "saved": 0,
        "skipped": 0,
        "failed": 0,
        "items": [],
    }
    if not code_nodes:
        return summary

    session_factory = _get_session_factory_or_503()
    sandbox_session = await WorkflowSandboxSessionStore(session_factory).get_session(workflow.id)
    if sandbox_session is None or not sandbox_session.sandbox_id:
        summary["skipped"] = len(code_nodes)
        summary["items"] = [
            {
                "nodeId": node.id,
                "status": "skipped",
                "message": "未绑定调试沙箱",
            }
            for node in code_nodes
        ]
        return summary

    try:
        sandbox = KubernetesApiSandboxPool(get_app_config(request)).get(sandbox_session.sandbox_id)
    except Exception as exc:
        summary["skipped"] = len(code_nodes)
        summary["items"] = [
            {
                "nodeId": node.id,
                "status": "skipped",
                "message": f"获取调试沙箱失败：{exc}",
            }
            for node in code_nodes
        ]
        return summary

    persistence = WorkflowCodePersistenceService(session_factory, get_app_config(request))
    for node in code_nodes:
        try:
            result = await persistence.save_workspace(
                session=sandbox_session,
                sandbox=sandbox,
                node_id=node.id,
                code_capability=node.config.codeCapability,
                entry_file=_code_entry_file_name(node),
                save_reason="workflow_save",
            )
            summary[result.status] = summary.get(result.status, 0) + 1
            summary["items"].append({
                "nodeId": result.node_id,
                "status": result.status,
                "packageId": result.package_id,
                "workspaceHash": result.workspace_hash,
                "fileCount": result.file_count,
                "totalSize": result.total_size,
                "message": result.message,
            })
        except Exception as exc:
            summary["failed"] += 1
            summary["items"].append({
                "nodeId": node.id,
                "status": "failed",
                "message": str(exc),
            })
    return summary


def _flatten_workflow_nodes(nodes: list) -> list:
    result = []
    for node in nodes:
        result.append(node)
        result.extend(_flatten_workflow_nodes(node.config.loopBodyNodes))
    return result


def _code_entry_file_name(node) -> str:
    path = node.config.codeFilePath.strip()
    if path:
        return path.rsplit("/", 1)[-1]
    return "browser_main.py" if node.config.codeCapability == "browser" else "main.py"


@router.delete("/workflows/{workflow_id}", status_code=204)
async def delete_workflow_project(workflow_id: str, workspaceId: str = DEFAULT_WORKSPACE_ID) -> None:
    store = _get_workflow_store()
    deleted = await store.delete_project(workflow_id, workspace_id=workspaceId)
    if not deleted:
        raise HTTPException(status_code=404, detail="Workflow project not found")


@router.post("/workflows/run", response_model=WorkflowRunResponse)
async def run_workflow(body: WorkflowRunRequest, request: Request) -> WorkflowRunResponse:
    runner = WorkflowRunner(get_app_config(request))
    result = await runner.run(body.workflow, body.input)
    return WorkflowRunResponse.model_validate(result)


@router.post("/workflows/stream")
async def stream_workflow(body: WorkflowRunRequest, request: Request) -> StreamingResponse:
    runner = WorkflowRunner(get_app_config(request))

    async def event_source():
        async for event in runner.stream(body.workflow, body.input):
            payload = json.dumps(event["data"], ensure_ascii=False)
            yield f"event: {event['type']}\ndata: {payload}\n\n"

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
