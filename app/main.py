from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.router import api_router
from app.runtime import create_app_runtime


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with create_app_runtime() as runtime:
        app.state.runtime = runtime
        yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="Harness Streaming API",
        version="0.1.0",
        description="FastAPI API scaffold backed by the DeerFlow harness runtime.",
        lifespan=lifespan,
    )
    app.include_router(api_router)
    return app


app = create_app()
