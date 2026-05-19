from fastapi import APIRouter

from app.api.routes.stream import router as stream_router
from app.api.routes.threads import router as threads_router

api_router = APIRouter()
api_router.include_router(stream_router, prefix="/api", tags=["stream"])
api_router.include_router(threads_router, prefix="/api", tags=["threads"])
