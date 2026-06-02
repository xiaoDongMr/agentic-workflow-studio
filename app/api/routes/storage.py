from __future__ import annotations

import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.deps import get_app_config

router = APIRouter()

MEDIA_CONTENT_PREFIXES = ("image/", "video/")
DEFAULT_SAFE_FILENAME = "upload"


class UploadResponse(BaseModel):
    url: str
    filename: str
    content_type: str
    size: int


def _storage_root(request: Request) -> Path:
    config = get_app_config(request).object_storage
    root = Path(config.local_dir).expanduser()
    if not root.is_absolute():
        root = Path.cwd() / root
    return root.resolve()


def _safe_filename(filename: str | None) -> str:
    raw_name = Path(filename or DEFAULT_SAFE_FILENAME).name
    safe = "".join(char if char.isalnum() or char in {".", "-", "_"} else "_" for char in raw_name).strip("._")
    return safe or DEFAULT_SAFE_FILENAME


def _public_url(request: Request, relative_path: Path) -> str:
    prefix = get_app_config(request).object_storage.public_url_prefix.rstrip("/")
    return f"{prefix}/{relative_path.as_posix()}"


def _resolve_uploaded_file(request: Request, file_path: str) -> Path:
    root = _storage_root(request)
    target = (root / file_path).resolve()
    if not target.is_file() or root not in target.parents:
        raise HTTPException(status_code=404, detail="文件不存在")
    return target


@router.post("/storage/uploads", response_model=UploadResponse)
async def upload_media_file(request: Request, file: UploadFile = File(...)) -> UploadResponse:
    content_type = file.content_type or "application/octet-stream"
    if not content_type.startswith(MEDIA_CONTENT_PREFIXES):
        raise HTTPException(status_code=400, detail="仅支持上传图片或视频文件")

    config = get_app_config(request).object_storage
    max_size = max(config.max_file_size_mb, 1) * 1024 * 1024
    root = _storage_root(request)
    today = datetime.utcnow().strftime("%Y/%m/%d")
    object_id = uuid.uuid4().hex
    filename = _safe_filename(file.filename)
    relative_path = Path("workflow-debug") / today / object_id / filename
    target_path = root / relative_path
    target_path.parent.mkdir(parents=True, exist_ok=True)

    size = 0
    try:
        with target_path.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > max_size:
                    output.close()
                    target_path.unlink(missing_ok=True)
                    raise HTTPException(status_code=413, detail=f"文件大小不能超过 {config.max_file_size_mb} MB")
                output.write(chunk)
    except HTTPException:
        raise
    except Exception as exc:
        target_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="文件保存失败") from exc
    finally:
        await file.close()

    return UploadResponse(
        url=_public_url(request, relative_path),
        filename=filename,
        content_type=content_type,
        size=size,
    )


@router.get("/storage/files/{file_path:path}")
async def get_uploaded_file(request: Request, file_path: str) -> FileResponse:
    target = _resolve_uploaded_file(request, file_path)
    return FileResponse(target)
