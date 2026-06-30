from __future__ import annotations

from typing import Any

from deerflow.config.app_config import AppConfig

from app.schemas.workflow import WorkflowNode
from app.workflow.services.code_execution import (
    execute_sandbox_file,
    execute_sandbox_snippet,
    safe_exec,
)
from app.workflow.services.code_sandbox_runtime import resolve_bound_workflow_sandbox
from app.workflow.services.error_policy import (
    emit_error_strategy_event,
    emit_retry_event,
    fallback_output,
    ignored_output,
    output_key,
    retry_attempts,
)
from app.workflow.state import WorkflowState


class CodeNodeExecutor:
    def __init__(self, app_config: AppConfig | None = None) -> None:
        self._app_config = app_config

    async def run(self, node: WorkflowNode, node_input: dict[str, Any], state: WorkflowState) -> dict[str, Any]:
        attempts = retry_attempts(node)
        last_error: Exception | None = None
        for attempt in range(1, attempts + 1):
            try:
                result = await self._run_code(node, node_input, state)
                return {output_key(node): result}
            except Exception as exc:
                last_error = exc
                if attempt < attempts:
                    emit_retry_event(node, attempt=attempt, attempts=attempts, error=exc, title="代码执行重试")

        error = last_error or RuntimeError("代码执行失败")
        if node.config.errorStrategy == "fallback":
            emit_error_strategy_event(node, strategy="fallback", error=error)
            return fallback_output(node)
        if node.config.errorStrategy == "ignore":
            emit_error_strategy_event(node, strategy="ignore", error=error)
            return ignored_output(node)
        emit_error_strategy_event(node, strategy="interrupt", error=error)
        raise error

    async def _run_code(self, node: WorkflowNode, node_input: dict[str, Any], state: WorkflowState) -> Any:
        code_source = node.config.codeSource
        if code_source in {"sandbox_snippet", "inline"}:
            return await self._run_sandbox_snippet(node, node_input, state)
        if code_source == "sandbox_file":
            return await self._run_sandbox_file(node, node_input, state)
        return safe_exec(node.config.prompt, node_input, state.get("variables", {}))

    async def _run_sandbox_snippet(self, node: WorkflowNode, node_input: dict[str, Any], state: WorkflowState) -> Any:
        code = node.config.prompt.strip()
        if not code:
            raise ValueError("脚本片段为空")
        sandbox = await resolve_bound_workflow_sandbox(app_config=self._app_config, state=state)
        return execute_sandbox_snippet(
            sandbox=sandbox,
            code=code,
            node_input=node_input,
            variables=state.get("variables", {}),
        )

    async def _run_sandbox_file(self, node: WorkflowNode, node_input: dict[str, Any], state: WorkflowState) -> Any:
        file_path = node.config.codeFilePath.strip()
        if not file_path:
            raise ValueError("入口文件未初始化，请先打开沙箱 Code 工作区")
        sandbox = await resolve_bound_workflow_sandbox(app_config=self._app_config, state=state)
        return execute_sandbox_file(
            sandbox=sandbox,
            file_path=file_path,
            entry_function=(node.config.codeEntryFunction or "main").strip() or "main",
            node_input=node_input,
            variables=state.get("variables", {}),
        )
