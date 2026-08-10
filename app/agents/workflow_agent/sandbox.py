from __future__ import annotations

from dataclasses import dataclass

from deerflow.persistence.engine import get_session_factory

from app.services.workflow_sandbox_session import WorkflowSandboxSessionStore


@dataclass(frozen=True, slots=True)
class WorkflowSandboxResolution:
    workflow_id: str
    bound: bool
    sandbox_id: str = ""
    sandbox_url: str = ""
    image_id: str = ""
    reason: str = ""


class WorkflowSandboxResolver:
    """Resolve the human-managed sandbox binding for one workflow."""

    async def resolve(self, workflow_id: str) -> WorkflowSandboxResolution:
        normalized_id = workflow_id.strip()
        if not normalized_id:
            return WorkflowSandboxResolution(
                workflow_id="",
                bound=False,
                reason="工作流缺少 workflowId，请先保存工作流",
            )

        session_factory = get_session_factory()
        if session_factory is None:
            return WorkflowSandboxResolution(
                workflow_id=normalized_id,
                bound=False,
                reason="工作流持久化不可用，无法读取沙箱绑定",
            )

        session = await WorkflowSandboxSessionStore(session_factory).get_session(
            normalized_id
        )
        if session is None or not session.sandbox_id:
            return WorkflowSandboxResolution(
                workflow_id=normalized_id,
                bound=False,
                reason="当前工作流尚未绑定沙箱",
            )
        return WorkflowSandboxResolution(
            workflow_id=normalized_id,
            bound=True,
            sandbox_id=session.sandbox_id,
            sandbox_url=session.sandbox_url,
            image_id=session.image_id,
        )


__all__ = ["WorkflowSandboxResolution", "WorkflowSandboxResolver"]
