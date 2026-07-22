from __future__ import annotations

from typing import Any

from deerflow.config.app_config import AppConfig

from app.schemas.workflow import WorkflowNode
from app.workflow.services.code_execution import (
    execute_sandbox_file,
    execute_sandbox_snippet,
    safe_exec,
)
from app.workflow.services.browser_runtime import validate_browser_runtime
from app.workflow.services.code_sandbox_runtime import (
    CodeSandboxConfigurationError,
    resolve_bound_workflow_sandbox,
)
from app.workflow.services.error_policy import (
    emit_error_strategy_event,
    emit_retry_event,
    fallback_output,
    ignored_output,
    output_key,
    retry_attempts,
)
from app.workflow.state import WorkflowState


class CodeNodeConfigurationError(ValueError):
    """Raised when code node configuration is incomplete before sandbox execution."""


class CodeNodeExecutor:
    def __init__(self, app_config: AppConfig | None = None) -> None:
        self._app_config = app_config

    async def run(self, node: WorkflowNode, node_input: dict[str, Any], state: WorkflowState) -> dict[str, Any]:
        attempts = retry_attempts(node)
        last_error: Exception | None = None
        for attempt in range(1, attempts + 1):
            try:
                result = await self._run_code(node, node_input, state)
                return self._format_output(node, result)
            except Exception as exc:
                last_error = exc
                if self._is_non_retryable_error(exc):
                    break
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
        if node.config.codeCapability == "browser" and node.config.codeSource != "sandbox_file":
            raise CodeNodeConfigurationError("浏览器操作仅支持沙箱文件入口，请先打开沙箱 Code 工作区")
        code_source = node.config.codeSource
        if code_source in {"sandbox_snippet", "inline"}:
            return await self._run_sandbox_snippet(node, node_input, state)
        if code_source == "sandbox_file":
            return await self._run_sandbox_file(node, node_input, state)
        return safe_exec(node.config.prompt, node_input)

    async def _run_sandbox_snippet(self, node: WorkflowNode, node_input: dict[str, Any], state: WorkflowState) -> Any:
        code = node.config.prompt.strip()
        if not code:
            raise CodeNodeConfigurationError("脚本片段为空")
        sandbox = await resolve_bound_workflow_sandbox(app_config=self._app_config, state=state)
        try:
            return execute_sandbox_snippet(
                sandbox=sandbox,
                code=code,
                node_input=node_input,
            )
        except RuntimeError as exc:
            raise RuntimeError(f"{format_code_node_context(node, state)}\n{exc}") from exc

    async def _run_sandbox_file(self, node: WorkflowNode, node_input: dict[str, Any], state: WorkflowState) -> Any:
        file_path = node.config.codeFilePath.strip()
        if not file_path:
            raise CodeNodeConfigurationError("入口文件未初始化，请先打开沙箱 Code 工作区")
        sandbox = await resolve_bound_workflow_sandbox(app_config=self._app_config, state=state)
        if node.config.codeCapability == "browser":
            try:
                validate_browser_runtime(sandbox)
            except RuntimeError as exc:
                raise CodeNodeConfigurationError(str(exc)) from exc
        entry_function = (node.config.codeEntryFunction or "main").strip() or "main"
        try:
            return execute_sandbox_file(
                sandbox=sandbox,
                file_path=file_path,
                entry_function=entry_function,
                node_input=node_input,
            )
        except RuntimeError as exc:
            raise RuntimeError(f"{format_code_node_context(node, state, file_path=file_path, entry_function=entry_function)}\n{exc}") from exc

    @staticmethod
    def _is_non_retryable_error(error: Exception) -> bool:
        return isinstance(error, (CodeNodeConfigurationError, CodeSandboxConfigurationError))

    @staticmethod
    def _format_output(node: WorkflowNode, result: Any) -> dict[str, Any]:
        output_names = [output.name.strip() for output in node.outputs if output.name.strip()]
        if not isinstance(result, dict):
            raise CodeNodeConfigurationError("编码节点返回值必须是对象，并与输出变量名称一一对应")
        if output_names:
            missing_outputs = [name for name in output_names if name not in result]
            if missing_outputs:
                raise CodeNodeConfigurationError(
                    f"编码节点返回结果缺少输出变量：{', '.join(missing_outputs)}"
                )
            return {name: result[name] for name in output_names}
        return {output_key(node): result}


def format_code_node_context(
    node: WorkflowNode,
    state: WorkflowState,
    *,
    file_path: str = "",
    entry_function: str = "",
) -> str:
    workflow_id = str(state.get("workflow", {}).get("id") or "")
    details = [
        f"编码节点执行失败：{node.title} ({node.id})",
        f"workflowId: {workflow_id or '<missing>'}",
        f"codeSource: {node.config.codeSource}",
        f"codeCapability: {node.config.codeCapability}",
    ]
    if file_path:
        details.append(f"codeFilePath: {file_path}")
    if entry_function:
        details.append(f"codeEntryFunction: {entry_function}")
    return "\n".join(details)
