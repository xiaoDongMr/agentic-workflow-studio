from __future__ import annotations

import base64
import mimetypes
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse
from urllib.request import urlopen

from deerflow.config.app_config import AppConfig


def is_vision_value_type(value_type: str) -> bool:
    normalized = value_type.strip().lower()
    return normalized in {"image", "video", "array<image>", "array<video>"}


def vision_kind(value_type: str) -> str:
    return "video" if "video" in value_type.strip().lower() else "image"


def collect_media_urls(value: Any) -> list[str]:
    urls: list[str] = []

    def visit(item: Any) -> None:
        if isinstance(item, str):
            text = item.strip()
            if text:
                urls.append(text)
        elif isinstance(item, dict):
            candidate = item.get("url") or item.get("src")
            if isinstance(candidate, str) and candidate.strip():
                urls.append(candidate.strip())
        elif isinstance(item, list):
            for sub in item:
                visit(sub)

    visit(value)
    return urls


def media_url_to_data_url(url: str, app_config: AppConfig | None) -> str:
    if url.startswith("data:"):
        return url
    data, mime_type = read_media_bytes(url, app_config)
    return f"data:{mime_type};base64,{base64.b64encode(data).decode('utf-8')}"


def read_media_bytes(url: str, app_config: AppConfig | None) -> tuple[bytes, str]:
    local_path = resolve_local_storage_url(url, app_config)
    if local_path is not None:
        data = local_path.read_bytes()
        mime_type = mimetypes.guess_type(local_path.name)[0] or "application/octet-stream"
        return data, mime_type

    with urlopen(url, timeout=20) as response:
        data = response.read()
        mime_type = response.headers.get_content_type() or mimetypes.guess_type(urlparse(url).path)[0] or "application/octet-stream"
        return data, mime_type


def resolve_local_storage_url(url: str, app_config: AppConfig | None) -> Path | None:
    if app_config is None:
        return None
    storage_config = app_config.object_storage
    public_prefix = storage_config.public_url_prefix.rstrip("/")
    parsed = urlparse(url)
    path = unquote(parsed.path)
    if not path.startswith(f"{public_prefix}/"):
        return None

    root = Path(storage_config.local_dir).expanduser()
    if not root.is_absolute():
        root = Path.cwd() / root
    root = root.resolve()
    relative_path = path[len(public_prefix) + 1:]
    target = (root / relative_path).resolve()
    if not target.is_file() or root not in target.parents:
        raise FileNotFoundError(f"视觉输入文件不存在: {url}")
    return target
