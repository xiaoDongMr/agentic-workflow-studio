from fastapi import APIRouter

from app.api.routes.config import router as config_router
from app.api.routes.sandbox_pool import router as sandbox_pool_router
from app.api.routes.storage import router as storage_router
from app.api.routes.stream import router as stream_router
from app.api.routes.threads import router as threads_router
from app.api.routes.workflow_sandbox_sessions import router as workflow_sandbox_sessions_router
from app.api.routes.workflows import router as workflows_router

api_router = APIRouter()
api_router.include_router(config_router, prefix="/api", tags=["config"])
api_router.include_router(sandbox_pool_router, prefix="/api", tags=["sandbox-pool"])
api_router.include_router(storage_router, prefix="/api", tags=["storage"])
api_router.include_router(stream_router, prefix="/api", tags=["stream"])
api_router.include_router(threads_router, prefix="/api", tags=["threads"])
api_router.include_router(workflow_sandbox_sessions_router, prefix="/api", tags=["workflow-sandbox-sessions"])
api_router.include_router(workflows_router, prefix="/api", tags=["workflows"])
