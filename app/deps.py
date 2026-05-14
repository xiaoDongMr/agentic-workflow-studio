from __future__ import annotations

from fastapi import Request

from app.runtime import AppRuntime
from app.services.runs import RunService


def get_runtime(request: Request) -> AppRuntime:
    return request.app.state.runtime


def get_app_config(request: Request):
    return get_runtime(request).app_config


def get_checkpointer(request: Request):
    return get_runtime(request).checkpointer


def get_store(request: Request):
    return get_runtime(request).store


def get_stream_bridge(request: Request):
    return get_runtime(request).stream_bridge


def get_run_manager(request: Request):
    return get_runtime(request).run_manager


def get_run_context(request: Request):
    return get_runtime(request).run_context


def get_thread_store(request: Request):
    return get_runtime(request).thread_store


def get_run_event_store(request: Request):
    return get_runtime(request).run_event_store


def get_run_service(request: Request) -> RunService:
    runtime = get_runtime(request)
    return RunService(
        stream_bridge=runtime.stream_bridge,
        run_manager=runtime.run_manager,
        run_context=runtime.run_context,
    )
