from __future__ import annotations

from typing import Protocol

from deerflow.config.app_config import AppConfig
from deerflow.persistence.engine import get_session_factory

from app.sandbox_pool import KubernetesApiSandboxPool
from app.services.workflow_sandbox_session import WorkflowSandboxSessionStore
from app.workflow.state import WorkflowState


class WorkflowCodeSandbox(Protocol):
    def execute_command(self, command: str) -> str: ...


async def resolve_bound_workflow_sandbox(
    *,
    app_config: AppConfig | None,
    state: WorkflowState,
) -> WorkflowCodeSandbox:
    workflow_id = str(state.get("workflow", {}).get("id") or "").strip()
    if not workflow_id:
        raise RuntimeError("工作流缺少 workflowId，无法获取绑定沙箱")
    if app_config is None:
        raise RuntimeError("沙箱运行配置不可用")

    session_factory = get_session_factory()
    if session_factory is None:
        raise RuntimeError("Workflow persistence is not available")

    session = await WorkflowSandboxSessionStore(session_factory).get_session(workflow_id)
    if session is None or not session.sandbox_id:
        raise RuntimeError("请先为当前 workflow 绑定调试沙箱")

    sandbox = KubernetesApiSandboxPool(app_config).get(session.sandbox_id)
    if sandbox.expired:
        raise RuntimeError("当前调试沙箱已过期，请替换后再运行")
    if sandbox.status != "Running":
        raise RuntimeError(f"当前调试沙箱状态为 {sandbox.status}，运行中后可执行编码节点")
    if not sandbox.sandbox_url:
        raise RuntimeError("当前调试沙箱缺少访问地址")

    from deerflow.community.aio_sandbox import AioSandbox

    return AioSandbox(id=session.sandbox_id, base_url=sandbox.sandbox_url)
