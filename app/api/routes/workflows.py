from __future__ import annotations

import json

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.deps import get_app_config
from app.schemas.workflow import WorkflowRunRequest, WorkflowRunResponse
from app.services.workflow_runner import WorkflowRunner

router = APIRouter()


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
