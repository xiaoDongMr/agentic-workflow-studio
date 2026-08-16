from __future__ import annotations

import json
import logging
import uuid
from collections.abc import Awaitable, Callable
from contextvars import ContextVar
from typing import Any, override

from langchain.agents.middleware import AgentMiddleware, hook_config
from langchain.agents.middleware.types import (
    ModelCallResult,
    ModelRequest,
    ModelResponse,
)
from langchain_core.messages import AIMessage, HumanMessage, RemoveMessage, ToolMessage
from langgraph.config import get_stream_writer
from langgraph.graph import END
from langgraph.prebuilt.tool_node import ToolCallRequest
from langgraph.runtime import Runtime
from langgraph.types import Command

from app.agents.workflow_agent.emitter import WorkflowOutputEmitter
from app.agents.workflow_agent.events import workflow_event_type
from app.agents.workflow_agent.graph_payload import node_business_payload
from app.agents.workflow_agent.sandbox import WorkflowSandboxResolver
from app.agents.workflow_agent.schemas import (
    WorkflowActionPlan,
    WorkflowAgentContext,
    WorkflowAssistantStreamRequest,
    WorkflowClarificationInput,
    WorkflowClarificationOption,
    WorkflowClarificationQuestion,
    WorkflowGraphInput,
    WorkflowMetadataProposal,
    WorkflowSandboxRequirement,
)
from app.agents.workflow_agent.state import WorkflowAgentState
from app.agents.workflow_agent.turn import (
    build_task,
    context_from_state,
    request_from_state,
    status_message,
)
from deerflow.agents.middlewares.loop_detection_middleware import (
    LoopDetectionMiddleware,
)
from deerflow.agents.middlewares.llm_error_handling_middleware import (
    LLMErrorHandlingMiddleware,
)

logger = logging.getLogger(__name__)


SANDBOX_TOOL_CAPABILITIES = {
    "run_node_skill": ["python", "filesystem"],
}

FINAL_OUTPUT_TOOL_NAMES = {
    "return_workflow_answer",
    "return_workflow_plan",
    "return_workflow_error",
}

WORKFLOW_TERMINAL_ERROR_KEY = "workflow_terminal_error"


def _plan_action(
    request: WorkflowAssistantStreamRequest,
    summary: str,
) -> WorkflowActionPlan:
    start_only = (
        len(request.workflow.nodes) <= 1
        and not request.workflow.edges
        and all(node.type == "start" for node in request.workflow.nodes)
    )
    if start_only:
        return WorkflowActionPlan(
            intent="create_workflow",
            scope="full_workflow",
            riskLevel="high",
            requiresConfirmation=True,
            summary=summary,
        )
    return WorkflowActionPlan(
        intent="modify_workflow",
        scope="full_workflow",
        riskLevel="high",
        requiresConfirmation=True,
        summary=summary,
    )


def _generated_graph_action(
    request: WorkflowAssistantStreamRequest,
    context: WorkflowAgentContext,
    graph: WorkflowGraphInput,
    summary: str,
) -> WorkflowActionPlan:
    if request.clientEvent == "confirm_plan":
        if (
            context.lastIntent is None
            or context.lastScope is None
            or context.lastRiskLevel is None
        ):
            raise ValueError("Confirmed workflow action is unavailable")
        return WorkflowActionPlan(
            intent=context.lastIntent,
            scope=context.lastScope,
            riskLevel=context.lastRiskLevel,
            targetNodeIds=context.targetNodeIds,
            requiresConfirmation=True,
            summary=summary,
        )

    current_nodes = {
        node.id: node_business_payload(node)
        for node in request.workflow.nodes
    }
    generated_nodes = {
        node.id: node_business_payload(node)
        for node in graph.nodes
    }
    current_edges = [edge.model_dump() for edge in request.workflow.edges]
    generated_edges = [edge.model_dump() for edge in graph.edges]
    if current_nodes.keys() != generated_nodes.keys() or current_edges != generated_edges:
        return WorkflowActionPlan(
            intent="modify_workflow",
            scope="full_workflow",
            riskLevel="high",
            requiresConfirmation=True,
            summary=summary,
        )

    changed_node_ids = [
        node_id
        for node_id, node in generated_nodes.items()
        if current_nodes[node_id] != node
    ]
    if request.selectedNodeId and changed_node_ids == [request.selectedNodeId]:
        return WorkflowActionPlan(
            intent="modify_selected_node",
            scope="selected_node_only",
            riskLevel="low",
            targetNodeIds=changed_node_ids,
            summary=summary,
        )
    return WorkflowActionPlan(
        intent="modify_workflow",
        scope="target_nodes",
        riskLevel="low",
        targetNodeIds=changed_node_ids,
        summary=summary,
    )




TOOL_ACTIVITY_LABELS = {
    "generate_workflow_patch": ("委派完整画布生成任务", "graph"),
    "describe_workflow": ("读取画布概览", "read"),
    "inspect_workflow_node": ("检查节点配置", "read"),
    "run_node_skill": ("执行工作流能力", "sandbox"),
    "workflow_ask_clarification": ("准备澄清问题", "decision"),
    "generate_workflow_metadata": ("生成工作流信息", "metadata"),
    "request_workflow_sandbox": ("申请工作流沙箱", "sandbox"),
    "return_workflow_answer": ("提交工作流答复", "output"),
    "return_workflow_plan": ("提交流程草图", "output"),
    "return_workflow_error": ("提交执行错误", "output"),
}

TOOL_ACTIVITY_KINDS = {
    "generate_workflow_patch": "subagent",
    "run_node_skill": "skill",
}


class WorkflowPrepareMiddleware(AgentMiddleware[WorkflowAgentState]):
    state_schema = WorkflowAgentState

    def __init__(self, emitter: WorkflowOutputEmitter | None = None) -> None:
        super().__init__()
        self._emitter = emitter or WorkflowOutputEmitter()

    @hook_config(can_jump_to=["end"])
    @override
    def before_agent(
        self,
        state: WorkflowAgentState,
        runtime: Runtime,
    ) -> dict[str, Any]:
        request = request_from_state(state)
        context = context_from_state(state, request)
        writer = get_stream_writer()
        writer(
            {
                "type": workflow_event_type("session"),
                "threadId": context.threadId,
            }
        )

        try:
            task, next_context = build_task(request, context)
        except Exception as exc:
            message = str(exc)
            self._emitter.emit_error(writer, context.threadId, message)
            return {
                "workflowAssistant": None,
                "workflowTask": {"mode": "error"},
                "workflowError": {"message": message},
                "jump_to": "end",
            }

        if task["mode"] == "cancel":
            self._emitter.emit_cancel(writer, context.threadId)
            return {
                "workflowAssistant": None,
                "workflowContext": None,
                "workflowTask": task,
                "workflowError": None,
                "jump_to": "end",
            }
        writer(
            {
                "type": workflow_event_type("message"),
                "threadId": context.threadId,
                "message": status_message(
                    task["mode"],
                    client_event=request.clientEvent,
                    has_previous_request=bool(task.get("previousRequest")),
                ),
            }
        )
        return {
            "messages": [
                *_stale_failure_message_removals(state),
                HumanMessage(
                    content=json.dumps(task, ensure_ascii=False),
                    id=f"workflow-task-{uuid.uuid4().hex}",
                )
            ],
            "workflowContext": next_context.model_dump(),
            "workflowTask": task,
            "workflowMetadata": None,
            "workflowError": None,
        }


def _tool_message(
    request: ToolCallRequest,
    content: str,
    *,
    status: str | None = None,
) -> ToolMessage:
    kwargs: dict[str, Any] = {}
    if status is not None:
        kwargs["status"] = status
    return ToolMessage(
        content=content,
        tool_call_id=str(request.tool_call.get("id") or "missing_tool_call_id"),
        name=str(request.tool_call.get("name") or ""),
        **kwargs,
    )


def _state_from_request(request: ToolCallRequest) -> dict[str, Any]:
    runtime = request.runtime
    state = getattr(runtime, "state", None) if runtime is not None else None
    return state if isinstance(state, dict) else {}


def _workflow_runtime(request: ToolCallRequest):
    state = _state_from_request(request)
    workflow_request = request_from_state(state)
    context = context_from_state(state, workflow_request)
    return state, workflow_request, context, get_stream_writer()


def _stale_failure_message_removals(
    state: dict[str, Any],
) -> list[RemoveMessage]:
    messages = state.get("messages") or []
    remove_ids: set[str] = set()
    stale_tool_call_ids: set[str] = set()

    for message in messages:
        if not _is_stale_failure_message(message):
            continue
        message_id = str(getattr(message, "id", "") or "")
        if message_id:
            remove_ids.add(message_id)
        if isinstance(message, ToolMessage):
            tool_call_id = str(getattr(message, "tool_call_id", "") or "")
            if tool_call_id:
                stale_tool_call_ids.add(tool_call_id)

    for message in messages:
        tool_call_ids = _tool_call_ids(message)
        if not tool_call_ids.intersection(stale_tool_call_ids):
            continue
        message_id = str(getattr(message, "id", "") or "")
        if message_id:
            remove_ids.add(message_id)

    if remove_ids:
        logger.info(
            "workflow prepare removed stale failure messages: count=%d",
            len(remove_ids),
        )
    return [RemoveMessage(id=message_id) for message_id in sorted(remove_ids)]


def _is_stale_failure_message(message: Any) -> bool:
    if isinstance(message, AIMessage) and _workflow_terminal_error(message) is not None:
        return True
    if isinstance(message, ToolMessage):
        return getattr(message, "status", None) == "error"
    return False


def _tool_call_ids(message: Any) -> set[str]:
    ids: set[str] = set()
    for call in getattr(message, "tool_calls", None) or []:
        if not isinstance(call, dict):
            continue
        call_id = str(call.get("id") or "")
        if call_id:
            ids.add(call_id)
    return ids


def _generate_mode_final_tool_error(
    state: dict[str, Any],
    tool_name: str,
) -> str | None:
    task = state.get("workflowTask") or {}
    if not isinstance(task, dict) or task.get("mode") != "generate":
        return None
    patch_attempted = _has_generate_workflow_patch_attempt(state)
    patch_failed = _has_generate_workflow_patch_error(state)
    if tool_name == "return_workflow_error" and patch_failed:
        return None
    if patch_attempted:
        return (
            "generate_workflow_patch 失败后应重试，或调用 "
            "return_workflow_error 结束；不要调用其他最终输出工具。"
        )
    return (
        "本轮是已确认方案生成任务，必须调用 generate_workflow_patch，"
        "成功后运行会自动完成；不要直接回答或重新返回方案。"
    )


def _has_generate_workflow_patch_attempt(state: dict[str, Any]) -> bool:
    messages = state.get("messages") or []
    for message in messages:
        if isinstance(message, ToolMessage) and message.name == "generate_workflow_patch":
            return True
        tool_calls = getattr(message, "tool_calls", None)
        if isinstance(tool_calls, list):
            for call in tool_calls:
                if isinstance(call, dict) and call.get("name") == "generate_workflow_patch":
                    return True
    return False


def _has_generate_workflow_patch_error(state: dict[str, Any]) -> bool:
    messages = state.get("messages") or []
    for message in messages:
        if not isinstance(message, ToolMessage):
            continue
        if message.name != "generate_workflow_patch":
            continue
        if getattr(message, "status", None) == "error":
            return True
    return False


def _emit_tool_activity(
    request: ToolCallRequest,
    status: str,
    *,
    detail: str | None = None,
) -> None:
    tool_name = str(request.tool_call.get("name") or "")
    label, category = TOOL_ACTIVITY_LABELS.get(tool_name, (tool_name, "tool"))
    state = _state_from_request(request)
    raw_request = state.get("workflowAssistant") or {}
    args = request.tool_call.get("args") or {}
    requested_capabilities = (
        [str(item) for item in args.get("requested_capabilities") or []]
        if isinstance(args, dict)
        else []
    )
    capabilities = requested_capabilities or SANDBOX_TOOL_CAPABILITIES.get(tool_name, [])
    try:
        writer = get_stream_writer()
        writer(
            {
                "type": workflow_event_type("toolActivity"),
                "threadId": raw_request.get("threadId"),
                "toolName": tool_name,
                "label": label,
                "category": category,
                "actor": "main-agent",
                "actorLabel": "主 Agent",
                "kind": TOOL_ACTIVITY_KINDS.get(tool_name, "tool"),
                "groupId": "main-agent",
                "status": status,
                "detail": detail,
                "capabilities": capabilities,
            }
        )
    except Exception:
        # Tool activity is auxiliary UI telemetry and must never affect execution.
        pass


class WorkflowToolActivityMiddleware(AgentMiddleware[WorkflowAgentState]):
    state_schema = WorkflowAgentState

    @override
    def wrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], ToolMessage | Command],
    ) -> ToolMessage | Command:
        _emit_tool_activity(request, "running")
        try:
            result = handler(request)
        except Exception as exc:
            _emit_tool_activity(request, "failed", detail=str(exc))
            raise
        _emit_tool_activity(
            request,
            _tool_activity_status(
                result,
                str(request.tool_call.get("name") or ""),
            ),
        )
        return result

    @override
    async def awrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[
            [ToolCallRequest],
            Awaitable[ToolMessage | Command],
        ],
    ) -> ToolMessage | Command:
        _emit_tool_activity(request, "running")
        try:
            result = await handler(request)
        except Exception as exc:
            _emit_tool_activity(request, "failed", detail=str(exc))
            raise
        _emit_tool_activity(
            request,
            _tool_activity_status(
                result,
                str(request.tool_call.get("name") or ""),
            ),
        )
        return result


def _tool_activity_status(
    result: ToolMessage | Command,
    tool_name: str,
) -> str:
    if tool_name == "return_workflow_error":
        return "failed"
    if isinstance(result, ToolMessage):
        return "failed" if getattr(result, "status", None) == "error" else "completed"
    return "completed"


class WorkflowLoopDetectionMiddleware(LoopDetectionMiddleware):
    state_schema = WorkflowAgentState

    def __init__(
        self,
        *args,
        emitter: WorkflowOutputEmitter | None = None,
        **kwargs,
    ) -> None:
        super().__init__(*args, **kwargs)
        self._emitter = emitter or WorkflowOutputEmitter()

    def _get_thread_id(self, runtime: Runtime) -> str:
        context = runtime.context if runtime.context else {}
        run_id = context.get("run_id")
        if run_id:
            return f"run:{run_id}"
        return super()._get_thread_id(runtime)

    def _apply(
        self,
        state: WorkflowAgentState,
        runtime: Runtime,
    ) -> dict[str, Any] | None:
        message, hard_stop = self._track_and_check(state, runtime)
        if not message:
            return None

        raw_request = state.get("workflowAssistant") or {}
        thread_id = str(raw_request.get("threadId") or "")
        messages = state.get("messages") or []
        last_message = messages[-1]

        if hard_stop:
            user_message = "检测到工具调用持续重复，已停止本轮执行。请调整需求后重试。"
            if thread_id:
                self._emitter.emit_system_notice(
                    get_stream_writer(),
                    thread_id=thread_id,
                    code="tool_loop_hard_stop",
                    level="error",
                    message=user_message,
                    detail=message,
                    terminal=True,
                )
            content = self._append_text(last_message.content, message)
            stripped_message = last_message.model_copy(
                update=self._build_hard_stop_update(last_message, content)
            )
            return {
                "messages": [stripped_message],
                "workflowAssistant": None,
                "workflowError": {
                    "code": "tool_loop_hard_stop",
                    "message": user_message,
                },
            }

        if thread_id:
            self._emitter.emit_system_notice(
                get_stream_writer(),
                thread_id=thread_id,
                code="tool_loop_warning",
                level="warning",
                message="检测到重复工具调用，正在尝试收敛并结束本轮执行。",
                detail=message,
            )
        patched_message = last_message.model_copy(
            update={
                "content": self._append_text(last_message.content, message)
            }
        )
        return {"messages": [patched_message]}


class WorkflowLLMErrorHandlingMiddleware(LLMErrorHandlingMiddleware):
    state_schema = WorkflowAgentState

    def __init__(
        self,
        *args,
        emitter: WorkflowOutputEmitter | None = None,
        **kwargs,
    ) -> None:
        super().__init__(*args, **kwargs)
        self._emitter = emitter or WorkflowOutputEmitter()
        self._active_request: ContextVar[ModelRequest | None] = ContextVar(
            "workflow_llm_active_request",
            default=None,
        )
        self._terminal_error: ContextVar[dict[str, str] | None] = ContextVar(
            "workflow_llm_terminal_error",
            default=None,
        )

    def _check_circuit(self) -> bool:
        # Workflow requests are user-driven and should get a fresh provider
        # attempt on each turn. Keep per-call retry/backoff, but do not let a
        # previous turn's circuit state fast-fail a later request.
        return False

    def _record_failure(self) -> None:
        logger.warning(
            "workflow llm request failed after retries; circuit breaker is disabled for workflow turns"
        )

    def _emit_retry_event(
        self,
        attempt: int,
        wait_ms: int,
        reason: str,
    ) -> None:
        super()._emit_retry_event(attempt, wait_ms, reason)
        request = self._active_request.get()
        thread_id = _thread_id_from_model_request(request)
        if not thread_id:
            return
        seconds = max(1, round(wait_ms / 1000))
        self._emitter.emit_system_notice(
            get_stream_writer(),
            thread_id=thread_id,
            code="llm_retry",
            level="warning",
            message=(
                f"大模型服务暂时不可用，正在进行第 "
                f"{attempt}/{self.retry_max_attempts} 次重试，约 {seconds} 秒后继续。"
            ),
            detail=f"reason={reason}; wait_ms={wait_ms}",
        )

    def _build_circuit_breaker_message(self) -> str:
        message = super()._build_circuit_breaker_message()
        self._terminal_error.set(
            {
                "code": "llm_circuit_open",
                "message": "大模型服务连续失败，熔断保护已开启，请稍后重试。",
                "detail": message,
            }
        )
        return message

    def _build_user_message(self, exc: BaseException, reason: str) -> str:
        detail = super()._build_user_message(exc, reason)
        messages = {
            "quota": "大模型服务额度不足或账号受限，请检查服务商账户后重试。",
            "auth": "大模型服务鉴权失败，请检查模型凭证和访问权限。",
            "busy": "大模型服务持续繁忙，多次重试后仍不可用，请稍后重试。",
            "transient": "大模型服务连接异常，多次重试后仍不可用，请稍后重试。",
            "generic": "大模型调用失败，本轮执行已停止。",
        }
        self._terminal_error.set(
            {
                "code": f"llm_{reason}",
                "message": messages.get(reason, messages["generic"]),
                "detail": detail,
            }
        )
        return detail

    @override
    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelCallResult:
        request_token = self._active_request.set(request)
        error_token = self._terminal_error.set(None)
        try:
            response = super().wrap_model_call(request, handler)
            return self._finalize_response(request, response)
        finally:
            self._terminal_error.reset(error_token)
            self._active_request.reset(request_token)

    @override
    async def awrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], Awaitable[ModelResponse]],
    ) -> ModelCallResult:
        request_token = self._active_request.set(request)
        error_token = self._terminal_error.set(None)
        try:
            response = await super().awrap_model_call(request, handler)
            return self._finalize_response(request, response)
        finally:
            self._terminal_error.reset(error_token)
            self._active_request.reset(request_token)

    def _finalize_response(
        self,
        request: ModelRequest,
        response: ModelCallResult,
    ) -> ModelCallResult:
        terminal_error = self._terminal_error.get()
        if terminal_error is None or not isinstance(response, AIMessage):
            return response

        thread_id = _thread_id_from_model_request(request)
        task = request.state.get("workflowTask") or {}
        task_mode = task.get("mode") if isinstance(task, dict) else None
        logger.error(
            "workflow llm terminal error: code=%s mode=%s thread_id=%s detail=%s",
            terminal_error.get("code"),
            task_mode,
            thread_id,
            terminal_error.get("detail"),
        )
        if thread_id:
            self._emitter.emit_system_notice(
                get_stream_writer(),
                thread_id=thread_id,
                code=terminal_error["code"],
                level="error",
                message=terminal_error["message"],
                detail=terminal_error["detail"],
                terminal=True,
            )
        additional_kwargs = dict(response.additional_kwargs or {})
        additional_kwargs[WORKFLOW_TERMINAL_ERROR_KEY] = terminal_error
        return response.model_copy(
            update={"additional_kwargs": additional_kwargs}
        )


class WorkflowOutputMiddleware(AgentMiddleware[WorkflowAgentState]):
    state_schema = WorkflowAgentState

    def __init__(self, emitter: WorkflowOutputEmitter | None = None) -> None:
        super().__init__()
        self._emitter = emitter or WorkflowOutputEmitter()

    def _complete_generated_graph(
        self,
        request: ToolCallRequest,
        result: ToolMessage | Command,
    ) -> ToolMessage | Command:
        if not isinstance(result, ToolMessage) or result.status == "error":
            return result
        content = result.content
        if not isinstance(content, str):
            raise ValueError("generate_workflow_patch returned invalid content")
        payload = json.loads(content)
        if not isinstance(payload, dict):
            raise ValueError("generate_workflow_patch returned invalid payload")
        graph = WorkflowGraphInput.model_validate(payload.get("graph") or {})
        summary = str(payload.get("summary") or "工作流已生成")
        _state, workflow_request, context, writer = _workflow_runtime(request)
        action = _generated_graph_action(
            workflow_request,
            context,
            graph,
            summary,
        )
        next_context, _policy = self._emitter.complete_generated_graph(
            writer,
            request=workflow_request,
            context=context,
            action=action,
        )
        return Command(
            update={
                "messages": [_tool_message(request, summary)],
                "workflowAssistant": None,
                "workflowContext": next_context.model_dump(),
                "workflowError": None,
            },
            goto=END,
        )

    def _handle(self, request: ToolCallRequest) -> Command:
        tool_name = str(request.tool_call.get("name") or "")
        state = _state_from_request(request)
        generate_mode_error = _generate_mode_final_tool_error(state, tool_name)
        if generate_mode_error:
            logger.warning(
                "workflow main agent rejected final tool in generate mode: tool=%s reason=%s",
                tool_name,
                generate_mode_error,
            )
            return Command(
                update={
                    "messages": [
                        _tool_message(
                            request,
                            generate_mode_error,
                            status="error",
                        )
                    ]
                }
            )
        _state, workflow_request, context, writer = _workflow_runtime(request)
        args = request.tool_call.get("args") or {}
        action = (
            _plan_action(workflow_request, str(args.get("summary") or ""))
            if tool_name == "return_workflow_plan"
            else None
        )

        if tool_name == "return_workflow_answer":
            message = str(args.get("message") or "")
            self._emitter.emit_answer(
                writer,
                request=workflow_request,
                context=context,
                message=message,
            )
            update = {
                "workflowAssistant": None,
                "workflowContext": None,
                "workflowError": None,
            }
            content = message
        elif tool_name == "return_workflow_plan":
            next_context, _policy = self._emitter.emit_plan(
                writer,
                request=workflow_request,
                context=context,
                action=action,
                summary=str(args.get("summary") or ""),
                mermaid=str(args.get("mermaid") or ""),
            )
            update = {
                "workflowAssistant": None,
                "workflowContext": next_context.model_dump(),
                "workflowError": None,
            }
            content = str(args.get("summary") or "")
        else:
            message = str(args.get("message") or "")
            self._emitter.emit_error(writer, context.threadId, message)
            update = {
                "workflowAssistant": None,
                "workflowError": {"message": message},
            }
            content = message

        update["messages"] = [_tool_message(request, content)]
        return Command(update=update, goto=END)

    @override
    def wrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], ToolMessage | Command],
    ) -> ToolMessage | Command:
        if request.tool_call.get("name") == "generate_workflow_patch":
            return self._complete_generated_graph(request, handler(request))
        if request.tool_call.get("name") not in FINAL_OUTPUT_TOOL_NAMES:
            return handler(request)
        return self._handle(request)

    @override
    async def awrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[
            [ToolCallRequest],
            Awaitable[ToolMessage | Command],
        ],
    ) -> ToolMessage | Command:
        if request.tool_call.get("name") == "generate_workflow_patch":
            return self._complete_generated_graph(
                request,
                await handler(request),
            )
        if request.tool_call.get("name") not in FINAL_OUTPUT_TOOL_NAMES:
            return await handler(request)
        return self._handle(request)


class WorkflowFinalOutputGuardMiddleware(AgentMiddleware[WorkflowAgentState]):
    state_schema = WorkflowAgentState

    def __init__(self, emitter: WorkflowOutputEmitter | None = None) -> None:
        super().__init__()
        self._emitter = emitter or WorkflowOutputEmitter()
        self._direct_final_emitted: set[tuple[str, str]] = set()

    @override
    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelCallResult:
        response = handler(request)
        self._emit_if_direct_final(request.state, response)
        return response

    @override
    async def awrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], Awaitable[ModelResponse]],
    ) -> ModelCallResult:
        response = await handler(request)
        self._emit_if_direct_final(request.state, response)
        return response

    @override
    def after_model(
        self,
        state: WorkflowAgentState,
        runtime: Runtime,
    ) -> dict[str, Any] | None:
        return self._handle(state)

    @override
    async def aafter_model(
        self,
        state: WorkflowAgentState,
        runtime: Runtime,
    ) -> dict[str, Any] | None:
        return self._handle(state)

    def _handle(self, state: WorkflowAgentState) -> dict[str, Any] | None:
        messages = state.get("messages") or []
        response = messages[-1] if messages else None
        if not isinstance(response, AIMessage) or response.tool_calls:
            return None
        raw_request = state.get("workflowAssistant")
        if not raw_request:
            return None
        thread_id = str(raw_request.get("threadId") or "")
        terminal_error = _workflow_terminal_error(response)
        if terminal_error is not None:
            return {
                "workflowAssistant": None,
                "workflowError": terminal_error,
            }
        message = "工作流 Agent 未通过最终输出工具提交结果"
        if self._mark_direct_final_emitted(thread_id, response):
            self._emitter.emit_error(get_stream_writer(), thread_id, message)
        return {
            "workflowAssistant": None,
            "workflowError": {"message": message},
        }

    def _emit_if_direct_final(
        self,
        state: WorkflowAgentState,
        response: ModelCallResult,
    ) -> None:
        ai_message = _ai_message_from_model_result(response)
        if ai_message is None or ai_message.tool_calls:
            return
        if _workflow_terminal_error(ai_message) is not None:
            return
        raw_request = state.get("workflowAssistant")
        if not raw_request or state.get("workflowError"):
            return
        thread_id = str(raw_request.get("threadId") or "")
        if not thread_id:
            return
        if not self._mark_direct_final_emitted(thread_id, ai_message):
            return
        self._emitter.emit_error(
            get_stream_writer(),
            thread_id,
            "工作流 Agent 未通过最终输出工具提交结果",
        )

    def _mark_direct_final_emitted(
        self,
        thread_id: str,
        message: AIMessage,
    ) -> bool:
        key = (thread_id, str(message.id or repr(message.content)))
        if key in self._direct_final_emitted:
            return False
        self._direct_final_emitted.add(key)
        return True


def _ai_message_from_model_result(response: ModelCallResult) -> AIMessage | None:
    if isinstance(response, AIMessage):
        return response
    result = getattr(response, "result", None)
    if isinstance(result, list) and result:
        candidate = result[-1]
        if isinstance(candidate, AIMessage):
            return candidate
    return None


def _thread_id_from_model_request(request: ModelRequest | None) -> str:
    if request is None:
        return ""
    raw_request = request.state.get("workflowAssistant") or {}
    return str(raw_request.get("threadId") or "")


def _workflow_terminal_error(message: AIMessage) -> dict[str, str] | None:
    value = (message.additional_kwargs or {}).get(
        WORKFLOW_TERMINAL_ERROR_KEY
    )
    if not isinstance(value, dict):
        return None
    code = value.get("code")
    user_message = value.get("message")
    if not isinstance(code, str) or not isinstance(user_message, str):
        return None
    return {
        "code": code,
        "message": user_message,
    }


class WorkflowClarificationMiddleware(AgentMiddleware[WorkflowAgentState]):
    state_schema = WorkflowAgentState

    def __init__(self, emitter: WorkflowOutputEmitter | None = None) -> None:
        super().__init__()
        self._emitter = emitter or WorkflowOutputEmitter()

    def _handle(self, request: ToolCallRequest) -> Command:
        _state, _workflow_request, context, writer = _workflow_runtime(request)
        args = request.tool_call.get("args") or {}
        inputs = [
            WorkflowClarificationInput.model_validate(item)
            for item in args.get("questions") or []
        ]
        if not inputs:
            return Command(
                update={
                    "messages": [
                        _tool_message(
                            request,
                            "Clarification requires at least one question",
                            status="error",
                        )
                    ]
                }
            )
        questions: list[WorkflowClarificationQuestion] = []
        for index, item in enumerate(inputs, start=1):
            input_type = "text"
            if item.options:
                input_type = "multiple" if item.multiple else "single"
            questions.append(
                WorkflowClarificationQuestion(
                    id=f"question-{index}",
                    question=item.question,
                    required=False,
                    inputType=input_type,
                    options=[
                        WorkflowClarificationOption(label=option, value=option)
                        for option in item.options
                    ],
                    allowOther=True,
                )
            )
        summary = "需要补充关键信息"
        next_context = self._emitter.emit_clarification(
            writer,
            context=context,
            summary=summary,
            questions=questions,
        )
        return Command(
            update={
                "messages": [
                    _tool_message(
                        request,
                        json.dumps(
                            {
                                "summary": summary,
                                "questions": [
                                    question.model_dump()
                                    for question in questions
                                ],
                            },
                            ensure_ascii=False,
                        ),
                    )
                ],
                "workflowAssistant": None,
                "workflowContext": next_context.model_dump(),
                "workflowError": None,
            },
            goto=END,
        )

    @override
    def wrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], ToolMessage | Command],
    ) -> ToolMessage | Command:
        if request.tool_call.get("name") != "workflow_ask_clarification":
            return handler(request)
        return self._handle(request)

    @override
    async def awrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[
            [ToolCallRequest],
            Awaitable[ToolMessage | Command],
        ],
    ) -> ToolMessage | Command:
        if request.tool_call.get("name") != "workflow_ask_clarification":
            return await handler(request)
        return self._handle(request)


class WorkflowMetadataMiddleware(AgentMiddleware[WorkflowAgentState]):
    state_schema = WorkflowAgentState

    def __init__(self, emitter: WorkflowOutputEmitter | None = None) -> None:
        super().__init__()
        self._emitter = emitter or WorkflowOutputEmitter()

    def _handle(self, request: ToolCallRequest) -> Command:
        state, workflow_request, context, writer = _workflow_runtime(request)
        if state.get("workflowMetadata"):
            return Command(
                update={
                    "messages": [
                        _tool_message(
                            request,
                            "Workflow metadata has already been generated for this run.",
                        )
                    ]
                }
            )
        args = request.tool_call.get("args") or {}
        proposal = WorkflowMetadataProposal.model_validate(args)
        payload = proposal.model_dump()
        self._emitter.emit_metadata(
            writer,
            request=workflow_request,
            context=context,
            proposal=proposal,
        )
        return Command(
            update={
                "messages": [
                    _tool_message(
                        request,
                        json.dumps(payload, ensure_ascii=False),
                    )
                ],
                "workflowMetadata": payload,
                "title": proposal.name,
            },
        )

    @override
    def wrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], ToolMessage | Command],
    ) -> ToolMessage | Command:
        if request.tool_call.get("name") != "generate_workflow_metadata":
            return handler(request)
        return self._handle(request)

    @override
    async def awrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[
            [ToolCallRequest],
            Awaitable[ToolMessage | Command],
        ],
    ) -> ToolMessage | Command:
        if request.tool_call.get("name") != "generate_workflow_metadata":
            return await handler(request)
        return self._handle(request)


class WorkflowSandboxMiddleware(AgentMiddleware[WorkflowAgentState]):
    state_schema = WorkflowAgentState

    def __init__(
        self,
        resolver: WorkflowSandboxResolver | None = None,
        emitter: WorkflowOutputEmitter | None = None,
    ) -> None:
        super().__init__()
        self._resolver = resolver or WorkflowSandboxResolver()
        self._emitter = emitter or WorkflowOutputEmitter()

    @staticmethod
    def _requires_sandbox(request: ToolCallRequest) -> bool:
        return request.tool_call.get("name") in {
            "request_workflow_sandbox",
            *SANDBOX_TOOL_CAPABILITIES,
        }

    @override
    def wrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], ToolMessage | Command],
    ) -> ToolMessage | Command:
        if not self._requires_sandbox(request):
            return handler(request)
        return _tool_message(
            request,
            "Workflow sandbox resolution requires asynchronous execution",
            status="error",
        )

    @override
    async def awrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[
            [ToolCallRequest],
            Awaitable[ToolMessage | Command],
        ],
    ) -> ToolMessage | Command:
        if not self._requires_sandbox(request):
            return await handler(request)

        state = _state_from_request(request)
        raw_request = state.get("workflowAssistant") or {}
        raw_workflow = raw_request.get("workflow") or {}
        workflow_id = str(raw_workflow.get("id") or "")
        resolution = await self._resolver.resolve(workflow_id)
        args = request.tool_call.get("args") or {}
        tool_name = str(request.tool_call.get("name") or "")
        requested_capabilities = (
            [str(item) for item in args.get("requested_capabilities") or []]
            if tool_name == "request_workflow_sandbox"
            else SANDBOX_TOOL_CAPABILITIES.get(tool_name, [])
        )
        if resolution.bound:
            active_sandbox = state.get("sandbox") or {}
            if (
                tool_name != "request_workflow_sandbox"
                and active_sandbox.get("sandbox_id") == resolution.sandbox_id
            ):
                return await handler(request)
            payload = {
                "workflowId": resolution.workflow_id,
                "sandboxId": resolution.sandbox_id,
                "sandboxUrl": resolution.sandbox_url,
                "imageId": resolution.image_id,
                "bindingStatus": "bound",
                "requestedCapabilities": requested_capabilities,
            }
            if tool_name != "request_workflow_sandbox":
                payload["instruction"] = (
                    f"Sandbox is ready. Call {tool_name} again to continue."
                )
            return Command(
                update={
                    "messages": [
                        _tool_message(
                            request,
                            json.dumps(payload, ensure_ascii=False),
                        )
                    ],
                    "sandbox": {"sandbox_id": resolution.sandbox_id},
                }
            )

        requirement = WorkflowSandboxRequirement(
            workflowId=resolution.workflow_id or workflow_id,
            reason=str(
                args.get("reason")
                or resolution.reason
                or f"{tool_name} requires a bound workflow sandbox"
            ),
            requestedCapabilities=requested_capabilities,
        )
        workflow_request = request_from_state(state)
        context = context_from_state(state, workflow_request)
        next_context = self._emitter.emit_sandbox_requirement(
            get_stream_writer(),
            context=context,
            requirement=requirement,
        )
        return Command(
            update={
                "messages": [
                    _tool_message(
                        request,
                        requirement.model_dump_json(),
                    )
                ],
                "workflowAssistant": None,
                "workflowContext": next_context.model_dump(),
                "workflowError": None,
            },
            goto=END,
        )


__all__ = [
    "WorkflowClarificationMiddleware",
    "WorkflowFinalOutputGuardMiddleware",
    "WorkflowLLMErrorHandlingMiddleware",
    "WorkflowLoopDetectionMiddleware",
    "WorkflowMetadataMiddleware",
    "WorkflowOutputMiddleware",
    "WorkflowSandboxMiddleware",
    "WorkflowToolActivityMiddleware",
]
