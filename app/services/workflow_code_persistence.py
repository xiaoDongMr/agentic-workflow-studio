from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import desc, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from deerflow.config.app_config import AppConfig

from app.persistence.workflow_models import (
    WorkflowProjectRow,
    WorkflowNodeCodePackageRow,
    WorkflowNodeCodeWorkspaceRow,
)
from app.sandbox_pool.schemas import SandboxSummary
from app.services.workflow_code_package_storage import WorkflowCodePackageStorage
from app.services.workflow_code_workspace_commands import (
    build_archive_command,
    build_manifest_command,
    build_restore_command,
    has_restore_marker,
    parse_archive_output,
    parse_manifest_output,
    raise_for_sandbox_error,
    tail_output,
)
from app.services.workflow_code_workspace import (
    DEFAULT_SANDBOX_HOME_DIR,
    build_workflow_code_workspace_paths,
)
from app.services.workflow_sandbox_session import WorkflowSandboxSessionRecord


@dataclass(slots=True)
class WorkflowCodeWorkspaceSaveResult:
    node_id: str
    status: str
    package_id: str = ""
    workspace_hash: str = ""
    file_count: int = 0
    total_size: int = 0
    package_uri: str = ""
    message: str = ""


@dataclass(slots=True)
class WorkflowCodeWorkspaceRestoreResult:
    node_id: str
    package_id: str
    restored: bool
    message: str = ""


@dataclass(slots=True)
class WorkflowCodeWorkspaceStatus:
    node_id: str
    package_id: str = ""
    workspace_hash: str = ""
    file_count: int = 0
    total_size: int = 0
    saved_at: datetime | None = None


@dataclass(slots=True)
class WorkflowCodePackageSummary:
    id: str
    node_id: str
    code_capability: str
    entry_file: str
    package_name: str
    package_hash: str
    workspace_hash: str
    file_count: int
    total_size: int
    source_sandbox_id: str
    save_reason: str
    created_at: datetime


class WorkflowCodePersistenceService:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        app_config: AppConfig,
    ) -> None:
        self._session_factory = session_factory
        self._storage = WorkflowCodePackageStorage(app_config)

    async def get_status(self, *, workflow_id: str, node_id: str) -> WorkflowCodeWorkspaceStatus:
        async with self._session_factory() as db_session:
            workspace = await self._get_workspace(db_session, workflow_id=workflow_id, node_id=node_id)
            if workspace is None or not workspace.latest_package_id:
                return WorkflowCodeWorkspaceStatus(node_id=node_id)
            package = await db_session.get(WorkflowNodeCodePackageRow, workspace.latest_package_id)
            return WorkflowCodeWorkspaceStatus(
                node_id=node_id,
                package_id=workspace.latest_package_id,
                workspace_hash=workspace.latest_workspace_hash,
                file_count=package.file_count if package else 0,
                total_size=package.total_size if package else 0,
                saved_at=workspace.latest_saved_at,
            )

    async def list_packages(
        self,
        *,
        workflow_id: str,
        node_id: str,
        limit: int = 20,
    ) -> list[WorkflowCodePackageSummary]:
        safe_limit = min(max(limit, 1), 100)
        async with self._session_factory() as db_session:
            result = await db_session.execute(
                select(WorkflowNodeCodePackageRow)
                .where(
                    WorkflowNodeCodePackageRow.workflow_id == workflow_id,
                    WorkflowNodeCodePackageRow.node_id == node_id,
                )
                .order_by(desc(WorkflowNodeCodePackageRow.created_at))
                .limit(safe_limit)
            )
            return [_package_to_summary(row) for row in result.scalars().all()]

    async def save_workspace(
        self,
        *,
        session: WorkflowSandboxSessionRecord,
        sandbox: SandboxSummary,
        node_id: str,
        code_capability: str,
        entry_file: str,
        save_reason: str = "workflow_save",
        workflow_version_id: str = "",
        actor_id: str | None = None,
    ) -> WorkflowCodeWorkspaceSaveResult:
        if not session.sandbox_id:
            return WorkflowCodeWorkspaceSaveResult(node_id=node_id, status="skipped", message="未绑定调试沙箱")
        if sandbox.expired:
            return WorkflowCodeWorkspaceSaveResult(node_id=node_id, status="skipped", message="调试沙箱已过期")
        if sandbox.status != "Running":
            return WorkflowCodeWorkspaceSaveResult(
                node_id=node_id,
                status="skipped",
                message=f"调试沙箱状态为 {sandbox.status}",
            )
        if not sandbox.sandbox_url:
            return WorkflowCodeWorkspaceSaveResult(node_id=node_id, status="skipped", message="调试沙箱缺少访问地址")

        sandbox_client = _sandbox_client(session.sandbox_id, sandbox.sandbox_url)
        workspace_path = build_workflow_code_workspace_paths(
            session.workflow_id,
            node_id,
            sandbox_home_dir=_sandbox_home_dir(sandbox_client),
            code_capability=code_capability,
        ).folder_path
        manifest_output = sandbox_client.execute_command(build_manifest_command(workspace_path))
        raise_for_sandbox_error(manifest_output, "扫描沙箱工作区失败")
        manifest = parse_manifest_output(manifest_output)
        workspace_hash = manifest["workspaceHash"]
        if int(manifest["fileCount"]) == 0:
            return WorkflowCodeWorkspaceSaveResult(
                node_id=node_id,
                status="skipped",
                workspace_hash=workspace_hash,
                message="工作区为空，已跳过保存",
            )

        async with self._session_factory() as db_session:
            package_workflow_version_id = workflow_version_id or await self._current_draft_version_id(
                db_session,
                workflow_id=session.workflow_id,
            )
            workspace = await self._ensure_workspace(
                db_session,
                workflow_id=session.workflow_id,
                node_id=node_id,
                code_capability=code_capability,
                entry_file=entry_file,
            )
            if workspace.latest_workspace_hash == workspace_hash:
                await db_session.commit()
                return WorkflowCodeWorkspaceSaveResult(
                    node_id=node_id,
                    status="skipped",
                    package_id=workspace.latest_package_id or "",
                    workspace_hash=workspace_hash,
                    file_count=int(manifest["fileCount"]),
                    total_size=int(manifest["totalSize"]),
                    message="工作区内容无变化",
                )

            archive_output = sandbox_client.execute_command(build_archive_command(workspace_path))
            raise_for_sandbox_error(archive_output, "打包沙箱工作区失败")
            archive_bytes = parse_archive_output(archive_output)
            package_hash = hashlib.sha256(archive_bytes).hexdigest()
            package_id = str(uuid4())
            package_name = f"{node_id}-{datetime.now(UTC).strftime('%Y%m%d%H%M%S')}.zip"
            package_uri = self._storage.write_package(
                workflow_id=session.workflow_id,
                node_id=node_id,
                package_id=package_id,
                package_name=package_name,
                archive_bytes=archive_bytes,
            )
            now = datetime.now(UTC)
            package = WorkflowNodeCodePackageRow(
                id=package_id,
                workflow_id=session.workflow_id,
                node_id=node_id,
                workflow_version_id=package_workflow_version_id,
                code_capability=code_capability,
                entry_file=entry_file,
                package_uri=package_uri,
                package_name=package_name,
                package_hash=package_hash,
                workspace_hash=workspace_hash,
                manifest=manifest,
                file_count=int(manifest["fileCount"]),
                total_size=int(manifest["totalSize"]),
                source_sandbox_id=session.sandbox_id,
                save_reason=save_reason,
                created_by=actor_id,
                created_at=now,
            )
            db_session.add(package)
            workspace.latest_package_id = package_id
            workspace.latest_workspace_hash = workspace_hash
            workspace.latest_saved_at = now
            try:
                await db_session.commit()
            except SQLAlchemyError:
                self._storage.delete_package(package_uri)
                raise
            return WorkflowCodeWorkspaceSaveResult(
                node_id=node_id,
                status="saved",
                package_id=package_id,
                workspace_hash=workspace_hash,
                file_count=package.file_count,
                total_size=package.total_size,
                package_uri=package_uri,
                message="工作区已保存",
            )

    async def restore_workspace_package(
        self,
        *,
        session: WorkflowSandboxSessionRecord,
        sandbox: SandboxSummary,
        node_id: str,
        code_capability: str,
        package_id: str,
    ) -> WorkflowCodeWorkspaceRestoreResult:
        async with self._session_factory() as db_session:
            package = await db_session.get(WorkflowNodeCodePackageRow, package_id)
            if package is None or package.workflow_id != session.workflow_id or package.node_id != node_id:
                return WorkflowCodeWorkspaceRestoreResult(
                    node_id=node_id,
                    package_id=package_id,
                    restored=False,
                    message="工作区历史版本不存在",
                )
            if package.code_capability != code_capability:
                return WorkflowCodeWorkspaceRestoreResult(
                    node_id=node_id,
                    package_id=package_id,
                    restored=False,
                    message="历史版本能力类型与当前节点不一致，已取消恢复",
                )
        return self._restore_package_to_sandbox(
            session=session,
            sandbox=sandbox,
            node_id=node_id,
            code_capability=code_capability,
            package=package,
        )

    def _restore_package_to_sandbox(
        self,
        *,
        session: WorkflowSandboxSessionRecord,
        sandbox: SandboxSummary,
        node_id: str,
        code_capability: str,
        package: WorkflowNodeCodePackageRow,
    ) -> WorkflowCodeWorkspaceRestoreResult:
        if sandbox.expired or sandbox.status != "Running" or not sandbox.sandbox_url:
            return WorkflowCodeWorkspaceRestoreResult(
                node_id=node_id,
                package_id=package.id,
                restored=False,
                message="调试沙箱不可用",
            )

        archive_bytes = self._storage.read_package(package.package_uri)
        if package.package_hash and hashlib.sha256(archive_bytes).hexdigest() != package.package_hash:
            return WorkflowCodeWorkspaceRestoreResult(
                node_id=node_id,
                package_id=package.id,
                restored=False,
                message="工作区历史包校验失败，已取消恢复",
            )
        sandbox_client = _sandbox_client(session.sandbox_id, sandbox.sandbox_url)
        workspace_path = build_workflow_code_workspace_paths(
            session.workflow_id,
            node_id,
            sandbox_home_dir=_sandbox_home_dir(sandbox_client),
            code_capability=code_capability,
        ).folder_path
        output = sandbox_client.execute_command(build_restore_command(workspace_path, archive_bytes))
        raise_for_sandbox_error(output, "恢复沙箱工作区失败")
        if not has_restore_marker(output):
            return WorkflowCodeWorkspaceRestoreResult(
                node_id=node_id,
                package_id=package.id,
                restored=False,
                message=f"恢复失败：{tail_output(output)}",
            )
        return WorkflowCodeWorkspaceRestoreResult(node_id=node_id, package_id=package.id, restored=True, message="工作区已恢复")

    async def _get_workspace(
        self,
        db_session: AsyncSession,
        *,
        workflow_id: str,
        node_id: str,
    ) -> WorkflowNodeCodeWorkspaceRow | None:
        result = await db_session.execute(
            select(WorkflowNodeCodeWorkspaceRow).where(
                WorkflowNodeCodeWorkspaceRow.workflow_id == workflow_id,
                WorkflowNodeCodeWorkspaceRow.node_id == node_id,
            )
        )
        return result.scalar_one_or_none()

    async def _ensure_workspace(
        self,
        db_session: AsyncSession,
        *,
        workflow_id: str,
        node_id: str,
        code_capability: str,
        entry_file: str,
    ) -> WorkflowNodeCodeWorkspaceRow:
        workspace = await self._get_workspace(db_session, workflow_id=workflow_id, node_id=node_id)
        if workspace is not None:
            workspace.code_capability = code_capability
            workspace.entry_file = entry_file
            return workspace

        workspace = WorkflowNodeCodeWorkspaceRow(
            id=str(uuid4()),
            workflow_id=workflow_id,
            node_id=node_id,
            code_capability=code_capability,
            entry_file=entry_file,
        )
        db_session.add(workspace)
        return workspace

    async def _current_draft_version_id(self, db_session: AsyncSession, *, workflow_id: str) -> str | None:
        project = await db_session.get(WorkflowProjectRow, workflow_id)
        return project.current_draft_version_id if project else None


def _package_to_summary(row: WorkflowNodeCodePackageRow) -> WorkflowCodePackageSummary:
    return WorkflowCodePackageSummary(
        id=row.id,
        node_id=row.node_id,
        code_capability=row.code_capability,
        entry_file=row.entry_file,
        package_name=row.package_name,
        package_hash=row.package_hash,
        workspace_hash=row.workspace_hash,
        file_count=row.file_count,
        total_size=row.total_size,
        source_sandbox_id=row.source_sandbox_id,
        save_reason=row.save_reason,
        created_at=row.created_at,
    )


def _sandbox_client(sandbox_id: str, sandbox_url: str):
    from deerflow.community.aio_sandbox import AioSandbox

    return AioSandbox(id=sandbox_id, base_url=sandbox_url)


def _sandbox_home_dir(sandbox: Any) -> str:
    home_dir = getattr(sandbox, "home_dir", "") or DEFAULT_SANDBOX_HOME_DIR
    return home_dir.rstrip("/") or DEFAULT_SANDBOX_HOME_DIR
