from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from deerflow.persistence.engine import get_session_factory

from app.deps import get_app_config
from app.schemas.workflow import (
    WorkflowDocument,
    WorkflowProjectDuplicateRequest,
    WorkflowProjectSummary,
    WorkflowProjectUpdateRequest,
    WorkflowRunRequest,
    WorkflowRunResponse,
    WorkflowSaveDraftRequest,
    WorkflowSaveDraftResponse,
)
from app.services.workflow_store import DEFAULT_WORKSPACE_ID, WorkflowStore, WorkflowProjectSummary as StoredWorkflowProjectSummary
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


@router.get("/workflows", response_model=list[WorkflowProjectSummary])
async def list_workflows(workspaceId: str = DEFAULT_WORKSPACE_ID) -> list[WorkflowProjectSummary]:
    store = _get_workflow_store()
    projects = await store.list_projects(workspaceId)
    return [_to_project_summary(project) for project in projects]


@router.post("/workflows/draft", response_model=WorkflowSaveDraftResponse)
async def save_workflow_draft(body: WorkflowSaveDraftRequest) -> WorkflowSaveDraftResponse:
    store = _get_workflow_store()
    saved = await store.save_draft(body.workflow, workspace_id=body.workspaceId)
    return WorkflowSaveDraftResponse(
        project=_to_project_summary(saved.project),
        workflow=saved.workflow,
    )


@router.get("/workflows/{workflow_id}/draft", response_model=WorkflowDocument)
async def get_workflow_draft(workflow_id: str) -> WorkflowDocument:
    store = _get_workflow_store()
    workflow = await store.get_draft(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow draft not found")
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
