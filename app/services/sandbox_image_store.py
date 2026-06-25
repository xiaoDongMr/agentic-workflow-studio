from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.persistence.workflow_models import SandboxImageRow
from app.sandbox_pool.kubernetes_api import DEFAULT_IMAGE
from app.sandbox_pool.schemas import SandboxImageCreateRequest, SandboxImageSummary


DEFAULT_SANDBOX_IMAGE_ID = "00000000-0000-0000-0000-000000000001"


class SandboxImageStore:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def list_images(self) -> list[SandboxImageSummary]:
        async with self._session_factory() as session:
            await self._ensure_builtin_image(session)
            result = await session.execute(
                select(SandboxImageRow)
                .where(SandboxImageRow.deleted_at.is_(None), SandboxImageRow.status == "active")
                .order_by(SandboxImageRow.is_default.desc(), SandboxImageRow.updated_at.desc())
            )
            return [self._to_summary(row) for row in result.scalars()]

    async def get_image(self, image_id: str) -> SandboxImageSummary | None:
        async with self._session_factory() as session:
            await self._ensure_builtin_image(session)
            row = await session.get(SandboxImageRow, image_id)
            if row is None or row.deleted_at is not None or row.status != "active":
                return None
            return self._to_summary(row)

    async def create_custom_image(self, request: SandboxImageCreateRequest) -> SandboxImageSummary:
        image = request.image.strip()
        name = request.name.strip()
        self._validate_custom_image_input(name=name, image=image)

        async with self._session_factory() as session:
            await self._ensure_builtin_image(session)
            existing_result = await session.execute(select(SandboxImageRow).where(SandboxImageRow.image == image))
            existing = existing_result.scalar_one_or_none()
            if existing is not None:
                if existing.source != "custom":
                    raise ValueError("builtin sandbox image cannot be overwritten")
                self._apply_custom_image_update(existing, request, name)
                await session.commit()
                return self._to_summary(existing)

            row = SandboxImageRow(
                id=str(uuid4()),
                name=name,
                image=image,
                digest=request.digest.strip(),
                source="custom",
                status="active",
                description=request.description.strip(),
                python_version=request.python_version.strip(),
                capability_manifest=request.capability_manifest,
                is_default=False,
            )
            session.add(row)
            await session.commit()
            await session.refresh(row)
            return self._to_summary(row)

    async def delete_custom_image(self, image_id: str) -> bool:
        async with self._session_factory() as session:
            row = await session.get(SandboxImageRow, image_id)
            if row is None or row.deleted_at is not None or row.source != "custom":
                return False
            row.deleted_at = datetime.now(UTC)
            row.status = "deleted"
            await session.commit()
            return True

    @staticmethod
    def _validate_custom_image_input(*, name: str, image: str) -> None:
        if not image:
            raise ValueError("image is required")
        if not name:
            raise ValueError("name is required")

    @staticmethod
    def _apply_custom_image_update(row: SandboxImageRow, request: SandboxImageCreateRequest, name: str) -> None:
        row.name = name
        row.digest = request.digest.strip()
        row.status = "active"
        row.description = request.description.strip()
        row.python_version = request.python_version.strip()
        row.capability_manifest = request.capability_manifest
        row.is_default = False
        row.deleted_at = None
        row.updated_at = datetime.now(UTC)

    async def _ensure_builtin_image(self, session: AsyncSession) -> None:
        row = await session.get(SandboxImageRow, DEFAULT_SANDBOX_IMAGE_ID)
        if row is not None:
            return
        session.add(
            SandboxImageRow(
                id=DEFAULT_SANDBOX_IMAGE_ID,
                name="AioSandbox 默认镜像",
                image=DEFAULT_IMAGE,
                digest="由后端资源池配置提供",
                source="builtin",
                status="active",
                description="平台默认 all-in-one 沙箱镜像，面向工作流编码节点、AI 工具调用、浏览器自动化和远程调试。",
                python_version="Python 版本待运行时探测",
                capability_manifest={
                    "tools": ["Shell/Bash", "文件读写", "浏览器/VNC", "VSCode Server", "WebSocket Terminal", "MCP Hub"],
                    "runtimes": ["Python", "JavaScript/Node.js", "Jupyter Notebook", "Code API", "Browser CDP", "代理预览"],
                    "capabilities": ["统一文件系统", "命令执行", "代码执行", "浏览器自动化", "端口代理预览", "人类接管调试"],
                    "limits": ["Python 包清单需从运行中沙箱探测", "额外依赖需通过自定义镜像提供", "正式运行建议固定镜像 digest"],
                },
                is_default=True,
            )
        )
        await session.commit()

    @staticmethod
    def _to_summary(row: SandboxImageRow) -> SandboxImageSummary:
        return SandboxImageSummary(
            id=row.id,
            name=row.name,
            image=row.image,
            digest=row.digest or "",
            source="builtin" if row.source == "builtin" else "custom",
            status=row.status,
            description=row.description or "",
            python_version=row.python_version or "",
            capability_manifest=row.capability_manifest or {},
            is_default=bool(row.is_default),
            created_at=row.created_at.isoformat().replace("+00:00", "Z") if row.created_at else "",
            updated_at=row.updated_at.isoformat().replace("+00:00", "Z") if row.updated_at else "",
        )
