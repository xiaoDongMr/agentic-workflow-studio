from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.runtime import create_app_runtime
from app.services.sandbox_ttl_cleanup import SandboxTtlCleanupService


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with create_app_runtime() as runtime:
        app.state.runtime = runtime
        sandbox_ttl_cleanup = SandboxTtlCleanupService(runtime.app_config)
        sandbox_ttl_cleanup.start()
        app.state.sandbox_ttl_cleanup = sandbox_ttl_cleanup
        try:
            yield
        finally:
            await sandbox_ttl_cleanup.stop()


def _get_cors_origins() -> list[str]:
    raw = os.getenv("APP_CORS_ORIGINS", "*").strip()
    if not raw:
        return ["*"]

    if raw == "*":
        return ["*"]

    return [origin.strip() for origin in raw.split(",") if origin.strip()] or ["*"]


def create_app() -> FastAPI:
    app = FastAPI(
        title="Harness Streaming API",
        version="0.1.0",
        description="FastAPI API scaffold backed by the DeerFlow harness runtime.",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_get_cors_origins(),
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Location"],
    )
    app.include_router(api_router)
    return app


app = create_app()
