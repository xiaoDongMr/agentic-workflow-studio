from __future__ import annotations

import base64
import json
import textwrap
from typing import Any

WORKSPACE_MANIFEST_PREFIX = "__WORKFLOW_CODE_WORKSPACE_MANIFEST__"
WORKSPACE_ARCHIVE_PREFIX = "__WORKFLOW_CODE_WORKSPACE_ARCHIVE__"
WORKSPACE_RESTORE_OK_MARKER = "__WORKFLOW_CODE_WORKSPACE_RESTORED__"

MAX_WORKSPACE_FILE_COUNT = 200
MAX_WORKSPACE_FILE_SIZE = 2 * 1024 * 1024
MAX_WORKSPACE_TOTAL_SIZE = 10 * 1024 * 1024

EXCLUDED_DIR_NAMES = {
    ".git",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".venv",
    "__pycache__",
    "node_modules",
}
EXCLUDED_FILE_NAMES = {
    ".DS_Store",
}
EXCLUDED_SUFFIXES = {
    ".log",
    ".pyc",
}


def build_manifest_command(workspace_path: str) -> str:
    script = f"""
import hashlib
import json
from pathlib import Path

root = Path({workspace_path!r})
excluded_dirs = {sorted(EXCLUDED_DIR_NAMES)!r}
excluded_files = {sorted(EXCLUDED_FILE_NAMES)!r}
excluded_suffixes = {sorted(EXCLUDED_SUFFIXES)!r}
max_file_count = {MAX_WORKSPACE_FILE_COUNT}
max_file_size = {MAX_WORKSPACE_FILE_SIZE}
max_total_size = {MAX_WORKSPACE_TOTAL_SIZE}

def file_sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()

files = []
total_size = 0
root_resolved = root.resolve()
if root.exists():
    for path in sorted(root.rglob("*")):
        if path.is_symlink() or not path.is_file():
            continue
        if root_resolved not in path.resolve().parents:
            continue
        relative = path.relative_to(root)
        if any(part in excluded_dirs for part in relative.parts):
            continue
        if path.name in excluded_files or path.suffix in excluded_suffixes:
            continue
        size = path.stat().st_size
        if size > max_file_size:
            continue
        total_size += size
        if total_size > max_total_size:
            raise RuntimeError("工作区文件总大小超过限制")
        files.append({{
            "path": relative.as_posix(),
            "size": size,
            "sha256": file_sha256(path),
        }})
        if len(files) > max_file_count:
            raise RuntimeError("工作区文件数量超过限制")

manifest_text = "\\n".join(f"{{item['path']}}:{{item['sha256']}}:{{item['size']}}" for item in files)
workspace_hash = hashlib.sha256(manifest_text.encode("utf-8")).hexdigest()
print({WORKSPACE_MANIFEST_PREFIX!r} + json.dumps({{
    "workspaceHash": workspace_hash,
    "fileCount": len(files),
    "totalSize": total_size,
    "files": files,
}}, ensure_ascii=False))
"""
    return _python_stdin_command(script)


def build_archive_command(workspace_path: str) -> str:
    script = f"""
import base64
import io
import zipfile
from pathlib import Path

root = Path({workspace_path!r})
excluded_dirs = {sorted(EXCLUDED_DIR_NAMES)!r}
excluded_files = {sorted(EXCLUDED_FILE_NAMES)!r}
excluded_suffixes = {sorted(EXCLUDED_SUFFIXES)!r}
max_file_count = {MAX_WORKSPACE_FILE_COUNT}
max_file_size = {MAX_WORKSPACE_FILE_SIZE}
max_total_size = {MAX_WORKSPACE_TOTAL_SIZE}

buffer = io.BytesIO()
file_count = 0
total_size = 0
root_resolved = root.resolve()
with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    if root.exists():
        for path in sorted(root.rglob("*")):
            if path.is_symlink() or not path.is_file():
                continue
            if root_resolved not in path.resolve().parents:
                continue
            relative = path.relative_to(root)
            if any(part in excluded_dirs for part in relative.parts):
                continue
            if path.name in excluded_files or path.suffix in excluded_suffixes:
                continue
            data = path.read_bytes()
            if len(data) > max_file_size:
                continue
            total_size += len(data)
            if total_size > max_total_size:
                raise RuntimeError("工作区文件总大小超过限制")
            file_count += 1
            if file_count > max_file_count:
                raise RuntimeError("工作区文件数量超过限制")
            info = zipfile.ZipInfo(relative.as_posix(), date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, data)

print({WORKSPACE_ARCHIVE_PREFIX!r} + base64.b64encode(buffer.getvalue()).decode("ascii"))
"""
    return _python_stdin_command(script)


def build_restore_command(workspace_path: str, archive_bytes: bytes) -> str:
    encoded = base64.b64encode(archive_bytes).decode("ascii")
    script = f"""
import base64
import io
import shutil
import zipfile
from pathlib import Path

root = Path({workspace_path!r})
archive_bytes = base64.b64decode({encoded!r})
temp_root = root.parent / f".{{root.name}}.restore_tmp"
if temp_root.exists():
    shutil.rmtree(temp_root)
temp_root.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(io.BytesIO(archive_bytes), "r") as archive:
    members = archive.infolist()
    if len(members) > {MAX_WORKSPACE_FILE_COUNT * 2}:
        raise RuntimeError("zip 文件数量超过限制")

    file_count = 0
    total_size = 0
    for member in members:
        if (member.external_attr >> 16) & 0o170000 == 0o120000:
            raise RuntimeError("zip 包含非法符号链接")
        target = (temp_root / member.filename).resolve()
        temp_root_resolved = temp_root.resolve()
        if temp_root_resolved not in target.parents and target != temp_root_resolved:
            raise RuntimeError("zip 包含非法路径")
        if member.is_dir():
            target.mkdir(parents=True, exist_ok=True)
            continue
        if target == temp_root_resolved:
            raise RuntimeError("zip 包含非法文件路径")
        if member.file_size > {MAX_WORKSPACE_FILE_SIZE}:
            raise RuntimeError("zip 单文件大小超过限制")
        total_size += member.file_size
        if total_size > {MAX_WORKSPACE_TOTAL_SIZE}:
            raise RuntimeError("zip 文件总大小超过限制")
        file_count += 1
        if file_count > {MAX_WORKSPACE_FILE_COUNT}:
            raise RuntimeError("zip 文件数量超过限制")
        target.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(member, "r") as source, target.open("wb") as destination:
            shutil.copyfileobj(source, destination)
if root.exists():
    shutil.rmtree(root)
root.parent.mkdir(parents=True, exist_ok=True)
temp_root.replace(root)
print({WORKSPACE_RESTORE_OK_MARKER!r})
"""
    return _python_stdin_command(script)


def parse_manifest_output(output: str) -> dict[str, Any]:
    payload = _parse_prefixed_json(output, WORKSPACE_MANIFEST_PREFIX)
    if not isinstance(payload, dict) or "workspaceHash" not in payload:
        raise RuntimeError("沙箱工作区 manifest 解析失败")
    return payload


def parse_archive_output(output: str) -> bytes:
    for line in output.splitlines():
        if line.startswith(WORKSPACE_ARCHIVE_PREFIX):
            return base64.b64decode(line[len(WORKSPACE_ARCHIVE_PREFIX):])
    raise RuntimeError(f"沙箱工作区打包失败: {_tail(output)}")


def raise_for_sandbox_error(output: str, prefix: str) -> None:
    if output.startswith("Error:"):
        raise RuntimeError(f"{prefix}：{_tail(output)}")


def has_restore_marker(output: str) -> bool:
    return WORKSPACE_RESTORE_OK_MARKER in output


def tail_output(output: str, limit: int = 500) -> str:
    return _tail(output, limit)


def _parse_prefixed_json(output: str, prefix: str) -> Any:
    for line in output.splitlines():
        if line.startswith(prefix):
            return json.loads(line[len(prefix):])
    raise RuntimeError(f"沙箱命令未返回预期结果：{_tail(output)}")


def _python_stdin_command(script: str) -> str:
    return f"python3 - <<'PY'\n{textwrap.dedent(script).strip()}\nPY"


def _tail(output: str, limit: int = 500) -> str:
    return output[-limit:] if output else "(no output)"
