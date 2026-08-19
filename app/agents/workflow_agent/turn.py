from __future__ import annotations

import uuid
from typing import Any

from app.agents.workflow_agent.graph_payload import (
    graph_business_payload,
    node_business_payload,
)
from app.agents.workflow_agent.schemas import (
    WorkflowAgentContext,
    WorkflowAssistantStreamRequest,
)
from app.agents.workflow_agent.state import WorkflowAgentState


def request_from_state(
    state: WorkflowAgentState,
) -> WorkflowAssistantStreamRequest:
    raw_request = state.get("workflowAssistant")
    if raw_request is None:
        raise ValueError("workflowAssistant input is required")
    return WorkflowAssistantStreamRequest.model_validate(raw_request)


def context_from_state(
    state: WorkflowAgentState,
    request: WorkflowAssistantStreamRequest,
) -> WorkflowAgentContext:
    raw_context = state.get("workflowContext")
    if raw_context:
        return WorkflowAgentContext.model_validate(raw_context)
    return WorkflowAgentContext(
        threadId=request.threadId or f"workflow-agent-{uuid.uuid4().hex}",
        selectedNodeId=request.selectedNodeId,
        sandboxId=request.sandboxId,
        sandboxBindingStatus=request.sandboxBindingStatus or "unbound",
    )


def build_task(
    request: WorkflowAssistantStreamRequest,
    context: WorkflowAgentContext,
) -> tuple[dict[str, Any], WorkflowAgentContext]:
    next_context = context.model_copy(deep=True)
    next_context.selectedNodeId = request.selectedNodeId
    if request.sandboxId is not None:
        next_context.sandboxId = request.sandboxId
    if request.sandboxBindingStatus is not None:
        next_context.sandboxBindingStatus = request.sandboxBindingStatus

    if request.clientEvent == "cancel_plan":
        return {"mode": "cancel"}, next_context

    if request.clientEvent == "confirm_plan":
        if context.plan is None:
            raise ValueError("工作流计划不存在或已过期，请重新提交需求")
        next_context.pendingConfirmation = False
        return _generation_task(request, next_context), next_context

    if request.clientEvent == "sandbox_bound":
        if not request.sandboxId or request.sandboxBindingStatus != "bound":
            raise ValueError("工作流尚未绑定可用沙箱")
        request.message = context.requestSummary or request.message

    previous_request = (
        context.requestSummary if context.awaitingClarification else ""
    )
    next_context.requestSummary = _merge_request(previous_request, request.message)
    next_context.awaitingClarification = False
    is_start_only_draft = _is_start_only_draft(request)
    return (
        {
            "mode": "decide",
            "userRequest": request.message,
            "previousRequest": previous_request,
            "selectedNodeId": request.selectedNodeId,
            "selectedNode": _selected_node_payload(request),
            "workflowSummary": {
                "id": request.workflowId,
                "name": request.workflow.name,
                "nodeCount": len(request.workflow.nodes),
                "edgeCount": len(request.workflow.edges),
                "isStartOnlyDraft": is_start_only_draft,
            },
            "workflowGraph": _graph_payload(request),
            "instruction": (
                "先判断用户意图是否具体明确；若存在无法从当前请求和已有"
                "上下文确定、且不同答案会显著改变流程结构的关键选择，"
                "必须先调用 workflow_ask_clarification，禁止自行假设后"
                "直接画流程草图。只读需求直接回答；"
                "调用 generate_workflow_patch 时只传最终业务目标 goal；"
                "工具会从当前运行状态读取完整 workflowGraph 和已确认草图。"
                "生成成功后会自动完成并结束当前运行；"
                "中高风险修改调用 return_workflow_plan，且只传 summary "
                "和 mermaid。"
                "如果 workflowSummary.isStartOnlyDraft=true，表示当前画布只有"
                "占位开始节点，应按从 0 创建完整工作流处理，优先使用 "
                "intent=create_workflow、scope=full_workflow 并调用 "
                "return_workflow_plan；确认前不要调用 generate_workflow_patch。"
            ),
        },
        next_context,
    )


def status_message(
    mode: str,
    *,
    client_event: str | None = None,
    has_previous_request: bool = False,
) -> str:
    if mode == "generate":
        return "正在生成已确认的完整工作流"
    if client_event == "sandbox_bound":
        return "沙箱已就绪，正在恢复中断的执行"
    if has_previous_request:
        return "正在整合补充信息并更新方案"
    return "正在理解需求并规划工作流调整"


def _is_start_only_draft(request: WorkflowAssistantStreamRequest) -> bool:
    return (
        len(request.workflow.nodes) == 1
        and request.workflow.nodes[0].type == "start"
        and len(request.workflow.edges) == 0
    )


def _generation_task(
    request: WorkflowAssistantStreamRequest,
    context: WorkflowAgentContext,
) -> dict[str, Any]:
    if context.plan is None:
        raise ValueError("已确认的工作流计划不存在")
    return {
        "mode": "generate",
        "confirmed": True,
        "userRequest": context.requestSummary,
        "selectedNodeId": request.selectedNodeId,
        "action": {
            "intent": context.lastIntent,
            "scope": context.lastScope,
            "riskLevel": context.lastRiskLevel,
            "targetNodeIds": context.targetNodeIds,
        },
        "confirmedPlan": context.plan.model_dump(),
        "workflowGraph": _graph_payload(request),
        "instruction": (
            "如需补全工作流名称或描述，可先调用 generate_workflow_metadata。"
            "随后调用 generate_workflow_patch，并且只传最终业务目标 goal；"
            "工具会从当前运行状态读取完整 workflowGraph 和 confirmedPlan.mermaid。"
            "成功后会自动完成并结束当前运行。"
            "本模式禁止调用 return_workflow_answer 或 return_workflow_plan；"
            "即使历史里有失败说明，也必须先尝试 generate_workflow_patch。"
        ),
    }


def _graph_payload(request: WorkflowAssistantStreamRequest) -> dict[str, Any]:
    return graph_business_payload(request.workflow)


def _selected_node_payload(
    request: WorkflowAssistantStreamRequest,
) -> dict[str, Any] | None:
    if not request.selectedNodeId:
        return None
    node = next(
        (
            item
            for item in request.workflow.nodes
            if item.id == request.selectedNodeId
        ),
        None,
    )
    return (
        node_business_payload(node)
        if node is not None
        else None
    )


def _merge_request(previous_request: str, message: str) -> str:
    if not previous_request:
        return message.strip()
    return f"{previous_request.strip()}\n用户补充：{message.strip()}"
