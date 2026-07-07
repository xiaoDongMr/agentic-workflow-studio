from __future__ import annotations

import re
from pathlib import Path

from deerflow.config.app_config import AppConfig

WORKFLOW_CODE_STORAGE_PREFIX = "workflow-code"


class WorkflowCodePackageStorage:
    def __init__(self, app_config: AppConfig) -> None:
        self._app_config = app_config

    def write_package(
        self,
        *,
        workflow_id: str,
        node_id: str,
        package_id: str,
        package_name: str,
        archive_bytes: bytes,
    ) -> str:
        relative_path = (
            Path(WORKFLOW_CODE_STORAGE_PREFIX)
            / _safe_storage_segment(workflow_id)
            / _safe_storage_segment(node_id)
            / package_id
            / package_name
        )
        target = self._storage_root() / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(archive_bytes)
        return relative_path.as_posix()

    def read_package(self, package_uri: str) -> bytes:
        target = self._resolve_package_path(package_uri)
        if not target.is_file():
            raise FileNotFoundError("工作区 package 文件不存在")
        return target.read_bytes()

    def delete_package(self, package_uri: str) -> None:
        target = self._resolve_package_path(package_uri)
        if target.is_file():
            target.unlink(missing_ok=True)

    def _storage_root(self) -> Path:
        root = Path(self._app_config.object_storage.local_dir).expanduser()
        if not root.is_absolute():
            root = Path.cwd() / root
        return root.resolve()

    def _resolve_package_path(self, package_uri: str) -> Path:
        root = self._storage_root()
        target = (root / package_uri).resolve()
        if root not in target.parents:
            raise FileNotFoundError("工作区 package 文件不存在")
        return target


def _safe_storage_segment(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", value).strip("._") or "unknown"
