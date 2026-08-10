from __future__ import annotations

import uuid
from typing import Any, Literal

from app.agents.workflow_agent.schemas import (
    WorkflowAgentContext,
    WorkflowAssistantStreamRequest,
)
from app.agents.workflow_agent.state import WorkflowAgentState


MAX_REPAIR_ATTEMPTS = 2


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
        next_context.stageIndex = 0
        next_context.repairAttempts = 0
        return _generation_task(request, next_context, mode="generate"), next_context

    if request.clientEvent == "stage_validated":
        if context.plan is None:
            if context.lastIntent is None:
                raise ValueError("没有可完成的工作流变更")
            return {"mode": "complete"}, next_context
        next_context.stageIndex += 1
        next_context.repairAttempts = 0
        if next_context.stageIndex >= len(context.plan.stages):
            return {"mode": "complete"}, next_context
        return _generation_task(request, next_context, mode="generate"), next_context

    if request.clientEvent == "validation_failed":
        if context.plan is None and context.lastIntent is None:
            raise ValueError("没有可修复的工作流变更")
        next_context.repairAttempts += 1
        if next_context.repairAttempts > MAX_REPAIR_ATTEMPTS:
            raise ValueError("自动修复已达到最大次数，请调整需求或手动修复")
        if context.plan is None:
            return _direct_repair_task(request, next_context), next_context
        return _generation_task(request, next_context, mode="repair"), next_context

    if request.clientEvent == "sandbox_bound":
        if not request.sandboxId or request.sandboxBindingStatus != "bound":
            raise ValueError("工作流尚未绑定可用沙箱")
        request.message = context.requestSummary or request.message

    previous_request = (
        context.requestSummary if context.awaitingClarification else ""
    )
    next_context.requestSummary = _merge_request(previous_request, request.message)
    next_context.awaitingClarification = False
    return (
        {
            "mode": "decide",
            "userRequest": request.message,
            "previousRequest": previous_request,
            "selectedNodeId": request.selectedNodeId,
            "workflowSummary": {
                "id": request.workflow.id,
                "name": request.workflow.name,
                "nodeCount": len(request.workflow.nodes),
                "edgeCount": len(request.workflow.edges),
            },
            "instruction": (
                "判断用户场景并自主选择工作流工具。只读需求直接回答；"
                "低风险局部修改可返回 patch；中高风险修改返回 plan。"
            ),
        },
        next_context,
    )


def status_message(mode: str) -> str:
    if mode == "repair":
        return "正在根据画布校验结果自动修复"
    if mode == "generate":
        return "正在生成已确认的工作流变更"
    return "正在理解需求并规划工作流调整"


def _generation_task(
    request: WorkflowAssistantStreamRequest,
    context: WorkflowAgentContext,
    *,
    mode: Literal["generate", "repair"],
) -> dict[str, Any]:
    if context.plan is None or context.stageIndex >= len(context.plan.stages):
        raise ValueError("当前工作流阶段不存在")
    stage = context.plan.stages[context.stageIndex]
    return {
        "mode": mode,
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
        "currentStage": stage.model_dump(),
        "validation": request.validation if mode == "repair" else None,
        "repairAttempt": context.repairAttempts,
        "instruction": (
            "只生成当前阶段的最小 Patch，调用 build_workflow_patch 和 "
            "validate_workflow_patch 后返回 kind=patch。"
        ),
    }


def _direct_repair_task(
    request: WorkflowAssistantStreamRequest,
    context: WorkflowAgentContext,
) -> dict[str, Any]:
    return {
        "mode": "repair",
        "confirmed": True,
        "userRequest": context.requestSummary,
        "selectedNodeId": request.selectedNodeId,
        "action": {
            "intent": context.lastIntent,
            "scope": context.lastScope,
            "riskLevel": context.lastRiskLevel,
            "targetNodeIds": context.targetNodeIds,
        },
        "currentStage": {
            "stageId": "direct-change",
            "sequence": 1,
            "title": "修复工作流调整",
            "instruction": "只修复当前工作流变更的校验错误",
            "final": True,
        },
        "validation": request.validation,
        "repairAttempt": context.repairAttempts,
        "instruction": (
            "根据 validation 只生成最小修复 Patch，调用 build_workflow_patch 和 "
            "validate_workflow_patch 后返回 kind=patch。"
        ),
    }


def _merge_request(previous_request: str, message: str) -> str:
    if not previous_request:
        return message.strip()
    return f"{previous_request.strip()}\n用户补充：{message.strip()}"
