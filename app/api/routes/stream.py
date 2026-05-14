from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.deps import get_run_service
from app.schemas.run import RunCreateRequest

router = APIRouter()


@router.post("/stream")
async def stream(body: RunCreateRequest, request: Request) -> StreamingResponse:
    run_service = get_run_service(request)
    return await run_service.build_stream_response(body, request)
