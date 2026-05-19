from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.deps import get_run_service
from app.schemas.run import RunCreateRequest

router = APIRouter()


def _with_thread_id(body: RunCreateRequest, thread_id: str | None) -> RunCreateRequest:
    if not thread_id:
        return body

    config = dict(body.config or {})
    configurable = dict(config.get("configurable") or {})
    configurable["thread_id"] = thread_id
    config["configurable"] = configurable
    return body.model_copy(update={"config": config})


@router.post("/stream")
async def stream(body: RunCreateRequest, request: Request) -> StreamingResponse:
    run_service = get_run_service(request)
    return await run_service.build_stream_response(body, request)


@router.post("/runs/stream")
async def stream_run(body: RunCreateRequest, request: Request) -> StreamingResponse:
    run_service = get_run_service(request)
    return await run_service.build_stream_response(body, request)


@router.post("/threads/{thread_id}/runs/stream")
async def stream_thread_run(
    thread_id: str,
    body: RunCreateRequest,
    request: Request,
) -> StreamingResponse:
    run_service = get_run_service(request)
    return await run_service.build_stream_response(_with_thread_id(body, thread_id), request)
