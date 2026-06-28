from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.persistence.workflow_models import (
    WorkflowProjectRow,
    WorkflowSandboxSessionRow,
)


DEFAULT_CODE_STATUS = "saved"


@dataclass(slots=True)
class WorkflowSandboxSessionRecord:
    id: str
    workflow_id: str
    sandbox_id: str
    sandbox_url: str
    image_id: str
    code_status: str
    last_saved_code_signature: str
    created_at: datetime
    updated_at: datetime


@dataclass(slots=True)
class WorkflowSandboxSessionBinding:
    sandbox_id: str = ""
    sandbox_url: str = ""
    image_id: str = ""
    code_status: str | None = None


class WorkflowSandboxSessionStore:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def get_session(self, workflow_id: str) -> WorkflowSandboxSessionRecord | None:
        async with self._session_factory() as session:
            if not await self._workflow_exists(session, workflow_id):
                return None
            row = await self._get_session_row(session, workflow_id)
            return self._to_record(row) if row else None

    async def ensure_session(self, workflow_id: str) -> WorkflowSandboxSessionRecord | None:
        async with self._session_factory() as session:
            row, created = await self._get_or_create_session_row(session, workflow_id)
            if row is None:
                return None
            if created:
                await session.commit()
                await session.refresh(row)
            return self._to_record(row)

    async def update_binding(
        self,
        workflow_id: str,
        binding: WorkflowSandboxSessionBinding,
    ) -> WorkflowSandboxSessionRecord | None:
        async with self._session_factory() as session:
            row, _ = await self._get_or_create_session_row(session, workflow_id)
            if row is None:
                return None

            row.sandbox_id = binding.sandbox_id.strip()
            row.sandbox_url = binding.sandbox_url.strip()
            row.image_id = binding.image_id.strip()
            if binding.code_status:
                row.code_status = binding.code_status

            await session.commit()
            await session.refresh(row)
            return self._to_record(row)

    async def _get_or_create_session_row(
        self,
        session: AsyncSession,
        workflow_id: str,
    ) -> tuple[WorkflowSandboxSessionRow | None, bool]:
        if not await self._workflow_exists(session, workflow_id):
            return None, False

        row = await self._get_session_row(session, workflow_id)
        if row is not None:
            return row, False

        row = WorkflowSandboxSessionRow(
            id=str(uuid4()),
            workflow_id=workflow_id,
            code_status=DEFAULT_CODE_STATUS,
        )
        session.add(row)
        return row, True

    async def _workflow_exists(self, session: AsyncSession, workflow_id: str) -> bool:
        result = await session.execute(
            select(WorkflowProjectRow)
            .where(
                WorkflowProjectRow.id == workflow_id,
                WorkflowProjectRow.deleted_at.is_(None),
            )
            .limit(1)
        )
        return result.scalar_one_or_none() is not None

    async def _get_session_row(
        self,
        session: AsyncSession,
        workflow_id: str,
    ) -> WorkflowSandboxSessionRow | None:
        result = await session.execute(
            select(WorkflowSandboxSessionRow)
            .where(
                WorkflowSandboxSessionRow.workflow_id == workflow_id,
            )
            .limit(1)
        )
        return result.scalar_one_or_none()

    def _to_record(self, row: WorkflowSandboxSessionRow) -> WorkflowSandboxSessionRecord:
        return WorkflowSandboxSessionRecord(
            id=row.id,
            workflow_id=row.workflow_id,
            sandbox_id=row.sandbox_id or "",
            sandbox_url=row.sandbox_url or "",
            image_id=row.image_id or "",
            code_status=row.code_status or DEFAULT_CODE_STATUS,
            last_saved_code_signature=row.last_saved_code_signature or "",
            created_at=row.created_at,
            updated_at=row.updated_at,
        )
