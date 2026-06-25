from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request

from deerflow.config.app_config import get_app_config as get_latest_app_config
from deerflow.persistence.engine import get_session_factory

from app.deps import get_app_config as get_runtime_app_config
from app.sandbox_pool import KubernetesApiSandboxPool
from app.sandbox_pool.kubernetes_api import SANDBOX_IMAGE_ID_LABEL
from app.sandbox_pool.schemas import (
    SandboxCreateRequest,
    SandboxImageCreateRequest,
    SandboxImageListResponse,
    SandboxListResponse,
    SandboxPoolHealth,
    SandboxPythonProbeResult,
    SandboxSummary,
)
from app.services.sandbox_image_preload import with_preload_status
from app.services.sandbox_image_store import SandboxImageStore
from app.services.sandbox_python_probe import probe_python_packages

router = APIRouter()
VALID_SANDBOX_STATUSES = {"Pending", "Running", "Succeeded", "Failed", "Unknown"}


def _pool(request: Request) -> KubernetesApiSandboxPool:
    # Load the latest config from disk so sandbox-pool provider switches do not
    # require a full backend restart while iterating on cluster connectivity.
    try:
        app_config = get_latest_app_config()
    except Exception:
        app_config = get_runtime_app_config(request)
    return KubernetesApiSandboxPool(app_config)


def _image_store() -> SandboxImageStore:
    session_factory = get_session_factory()
    if session_factory is None:
        raise HTTPException(status_code=503, detail="database persistence is required for sandbox images")
    return SandboxImageStore(session_factory)


@router.get("/sandbox-pool/health", response_model=SandboxPoolHealth)
async def sandbox_pool_health(request: Request) -> SandboxPoolHealth:
    return SandboxPoolHealth.model_validate(_pool(request).health())


@router.get("/sandboxes", response_model=SandboxListResponse)
async def list_sandboxes(
    request: Request,
    limit: int = Query(default=12, ge=1, le=100),
    continue_token: str = Query(default="", alias="continue"),
    status: str = Query(default=""),
    image_id: str = Query(default=""),
    sandbox_id: str = Query(default=""),
) -> SandboxListResponse:
    try:
        if status and status not in VALID_SANDBOX_STATUSES:
            raise HTTPException(status_code=400, detail="invalid sandbox status filter")
        result = _pool(request).list(
            limit=limit,
            continue_token=continue_token,
            status=status,
            image_id=image_id,
            sandbox_id=sandbox_id,
        )
        return SandboxListResponse(
            sandboxes=result.items,
            continue_token=result.continue_token,
            remaining_item_count=result.remaining_item_count,
            limit=limit,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/sandboxes", response_model=SandboxSummary)
async def create_sandbox(body: SandboxCreateRequest, request: Request) -> SandboxSummary:
    try:
        if body.image_id:
            image = await _image_store().get_image(body.image_id)
            if image is None:
                raise HTTPException(status_code=404, detail="sandbox image not found")
            labels = {**body.labels, SANDBOX_IMAGE_ID_LABEL: image.id}
            body = body.model_copy(update={"image": image.image, "labels": labels})
        return _pool(request).create(body)
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/sandbox-images", response_model=SandboxImageListResponse)
async def list_sandbox_images(request: Request) -> SandboxImageListResponse:
    try:
        images = await _image_store().list_images()
        pool = _pool(request)
        return SandboxImageListResponse(images=with_preload_status(pool, images))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/sandbox-images", response_model=SandboxImageListResponse)
async def create_sandbox_image(body: SandboxImageCreateRequest, request: Request) -> SandboxImageListResponse:
    try:
        image = await _image_store().create_custom_image(body)
        pool = _pool(request)
        pool.preload_image(image.id, image.image)
        images = await _image_store().list_images()
        return SandboxImageListResponse(images=with_preload_status(pool, images))
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.delete("/sandbox-images/{image_id}", response_model=SandboxImageListResponse)
async def delete_sandbox_image(image_id: str, request: Request) -> SandboxImageListResponse:
    try:
        pool = _pool(request)
        pool.delete_image_preload(image_id)
        deleted = await _image_store().delete_custom_image(image_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="custom sandbox image not found")
        images = await _image_store().list_images()
        return SandboxImageListResponse(images=with_preload_status(pool, images))
    except HTTPException:
        raise
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


@router.post("/sandboxes/{sandbox_id}/python-packages/probe", response_model=SandboxPythonProbeResult)
async def probe_sandbox_python_packages(sandbox_id: str, request: Request) -> SandboxPythonProbeResult:
    try:
        summary = _pool(request).get(sandbox_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if summary.status != "Running":
        raise HTTPException(status_code=400, detail="sandbox must be Running before probing Python packages")
    if not summary.sandbox_url:
        raise HTTPException(status_code=400, detail="sandbox_url is empty")

    try:
        return probe_python_packages(summary)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
