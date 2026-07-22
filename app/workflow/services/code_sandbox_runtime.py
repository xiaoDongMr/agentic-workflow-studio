from __future__ import annotations

from typing import Protocol
from uuid import UUID

from deerflow.config.app_config import AppConfig
from deerflow.persistence.engine import get_session_factory

from app.sandbox_pool import KubernetesApiSandboxPool
from app.services.workflow_sandbox_session import WorkflowSandboxSessionStore
from app.workflow.state import WorkflowState


class WorkflowCodeSandbox(Protocol):
    def execute_command(self, command: str) -> str: ...

    def read_file(self, path: str) -> str: ...

    def write_file(self, path: str, content: str, append: bool = False) -> None: ...


class CodeSandboxConfigurationError(RuntimeError):
    """Raised when a code node cannot resolve a usable workflow sandbox."""


async def resolve_bound_workflow_sandbox(
    *,
    app_config: AppConfig | None,
    state: WorkflowState,
) -> WorkflowCodeSandbox:
    workflow_id = str(state.get("workflow", {}).get("id") or "").strip()
    if not workflow_id:
        raise CodeSandboxConfigurationError("工作流缺少 workflowId，无法获取绑定沙箱")
    workflow_id = _normalize_workflow_id(workflow_id)
    if app_config is None:
        raise CodeSandboxConfigurationError("沙箱运行配置不可用")

    session_factory = get_session_factory()
    if session_factory is None:
        raise CodeSandboxConfigurationError("Workflow persistence is not available")

    session = await WorkflowSandboxSessionStore(session_factory).get_session(workflow_id)
    if session is None or not session.sandbox_id:
        raise CodeSandboxConfigurationError("请先为当前 workflow 绑定调试沙箱")

    sandbox = KubernetesApiSandboxPool(app_config).get(session.sandbox_id)
    if sandbox.expired:
        raise CodeSandboxConfigurationError("当前调试沙箱已过期，请替换后再运行")
    if sandbox.status != "Running":
        raise CodeSandboxConfigurationError(f"当前调试沙箱状态为 {sandbox.status}，运行中后可执行编码节点")
    if not sandbox.sandbox_url:
        raise CodeSandboxConfigurationError("当前调试沙箱缺少访问地址")

    from deerflow.community.aio_sandbox import AioSandbox

    return AioSandbox(id=session.sandbox_id, base_url=sandbox.sandbox_url)


def _normalize_workflow_id(workflow_id: str) -> str:
    try:
        return str(UUID(workflow_id))
    except ValueError as exc:
        raise CodeSandboxConfigurationError("请先保存 workflow 后再运行编码节点调试沙箱") from exc
