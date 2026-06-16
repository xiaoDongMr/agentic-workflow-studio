from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from deerflow.config.app_config import get_app_config as get_latest_app_config

from app.deps import get_app_config as get_runtime_app_config
from app.sandbox_pool import KubernetesApiSandboxPool
from app.sandbox_pool.schemas import (
    SandboxCreateRequest,
    SandboxListResponse,
    SandboxPoolHealth,
    SandboxSummary,
)

router = APIRouter()


def _pool(request: Request) -> KubernetesApiSandboxPool:
    # Load the latest config from disk so sandbox-pool provider switches do not
    # require a full backend restart while iterating on cluster connectivity.
    try:
        app_config = get_latest_app_config()
    except Exception:
        app_config = get_runtime_app_config(request)
    return KubernetesApiSandboxPool(app_config)


@router.get("/sandbox-pool/health", response_model=SandboxPoolHealth)
async def sandbox_pool_health(request: Request) -> SandboxPoolHealth:
    return SandboxPoolHealth.model_validate(_pool(request).health())


@router.get("/sandboxes", response_model=SandboxListResponse)
async def list_sandboxes(request: Request) -> SandboxListResponse:
    try:
        return SandboxListResponse(sandboxes=_pool(request).list())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/sandboxes", response_model=SandboxSummary)
async def create_sandbox(body: SandboxCreateRequest, request: Request) -> SandboxSummary:
    try:
        return _pool(request).create(body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/sandboxes/{sandbox_id}", response_model=SandboxSummary)
async def get_sandbox(sandbox_id: str, request: Request) -> SandboxSummary:
    try:
        return _pool(request).get(sandbox_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/sandboxes/{sandbox_id}")
async def delete_sandbox(sandbox_id: str, request: Request) -> dict[str, bool]:
    try:
        _pool(request).delete(sandbox_id)
        return {"ok": True}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
