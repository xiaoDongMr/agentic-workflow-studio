from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import AIMessage

from app.agents.workflow_agent.events import workflow_event_type
from app.agents.workflow_agent.policy import WorkflowPolicyGate
from app.agents.workflow_agent.schemas import (
    WorkflowActionPlan,
    WorkflowAgentContext,
    WorkflowAssistantPatchResult,
    WorkflowAssistantStreamRequest,
    WorkflowClarificationQuestion,
    WorkflowMetadataProposal,
    WorkflowPatchStage,
    WorkflowPlanPreviewResult,
    WorkflowPlanStage,
    WorkflowReactDecision,
    WorkflowSandboxRequirement,
)
from app.agents.workflow_agent.state import WorkflowAgentState
from app.workflow.patch.builder import build_workflow_patch
from app.workflow.patch.validator import require_valid_workflow_patch


def finalize_workflow_turn(
    state: WorkflowAgentState,
    *,
    request: WorkflowAssistantStreamRequest,
    context: WorkflowAgentContext,
    writer,
    policy_gate: WorkflowPolicyGate,
) -> dict[str, Any]:
    task = state.get("workflowTask") or {}
    mode = task.get("mode")

    if mode == "cancel":
        writer(
            {
                "type": workflow_event_type("end"),
                "threadId": context.threadId,
                "cancelled": True,
            }
        )
        return _cleared_state()

    if mode == "complete":
        writer(
            {
                "type": workflow_event_type("complete"),
                "threadId": context.threadId,
                "message": "所有阶段已生成并通过校验",
            }
        )
        writer({"type": workflow_event_type("end"), "threadId": context.threadId})
        return _cleared_state()

    clarification = state.get("workflowClarification")
    if clarification:
        questions = [
            WorkflowClarificationQuestion.model_validate(item)
            for item in clarification.get("questions") or []
        ]
        if not questions:
            raise ValueError("clarification result is missing questions")
        next_context = context.model_copy(deep=True)
        next_context.awaitingClarification = True
        writer(
            {
                "type": workflow_event_type("clarification"),
                "threadId": context.threadId,
                "summary": str(
                    clarification.get("summary") or "需要补充关键信息"
                ),
                "questions": [item.model_dump() for item in questions],
            }
        )
        writer({"type": workflow_event_type("end"), "threadId": context.threadId})
        return {
            "workflowAssistant": None,
            "workflowContext": next_context.model_dump(),
            "workflowClarification": None,
            "workflowError": None,
        }

    sandbox_requirement = state.get("workflowSandboxRequirement")
    if sandbox_requirement:
        requirement = WorkflowSandboxRequirement.model_validate(sandbox_requirement)
        next_context = context.model_copy(deep=True)
        next_context.sandboxId = None
        next_context.sandboxBindingStatus = "unbound"
        writer(
            {
                "type": workflow_event_type("sandboxRequired"),
                "threadId": context.threadId,
                **requirement.model_dump(),
            }
        )
        writer({"type": workflow_event_type("end"), "threadId": context.threadId})
        return {
            "workflowAssistant": None,
            "workflowContext": next_context.model_dump(),
            "workflowSandboxRequirement": None,
            "workflowError": None,
        }

    metadata = state.get("workflowMetadata")
    if metadata:
        proposal = WorkflowMetadataProposal.model_validate(metadata)
        decision = WorkflowReactDecision(
            kind="patch",
            action=WorkflowActionPlan(
                intent="modify_workflow",
                scope="workflow_metadata",
                riskLevel="low",
                summary="更新工作流名称和描述",
            ),
            summary="更新工作流名称和描述",
            operations=[
                {
                    "op": "update_metadata",
                    "name": proposal.name,
                    "description": proposal.description,
                }
            ],
        )
        policy = _emit_patch(
            writer,
            request=request,
            context=context,
            decision=decision,
            policy_gate=policy_gate,
        )
        next_context = _updated_context(context, request, decision)
        return {
            "workflowAssistant": None,
            "workflowContext": next_context.model_dump() if next_context else None,
            "workflowDecision": decision.model_dump(),
            "workflowMetadata": None,
            "policyResult": policy.model_dump(),
            "workflowError": None,
        }

    decision = decision_from_state(state)
    policy = policy_gate.assess_action(
        decision.action,
        selected_node_id=request.selectedNodeId,
    )
    if not policy.allowed:
        raise ValueError(policy.reason or "workflow action is not allowed")

    next_context = _updated_context(context, request, decision)
    if decision.kind == "clarification":
        _emit_clarification(writer, context.threadId, decision)
    elif decision.kind == "answer":
        _emit_answer(writer, context.threadId, decision)
        next_context = None
    elif decision.kind == "plan":
        _emit_plan(writer, context.threadId, decision)
    elif decision.kind == "patch":
        if mode in {"generate", "repair"}:
            _require_confirmed_action(context, decision)
        policy = _emit_patch(
            writer,
            request=request,
            context=context,
            decision=decision,
            policy_gate=policy_gate,
        )
    else:
        raise ValueError(decision.message or "workflow agent failed")

    return {
        "workflowAssistant": None,
        "workflowContext": (
            next_context.model_dump() if next_context is not None else None
        ),
        "workflowDecision": decision.model_dump(),
        "policyResult": policy.model_dump(),
        "workflowError": None,
    }


def decision_from_state(state: WorkflowAgentState) -> WorkflowReactDecision:
    structured_response = state.get("structured_response")
    if structured_response is not None:
        return WorkflowReactDecision.model_validate(structured_response)

    messages = state.get("messages") or []
    response = next(
        (
            message
            for message in reversed(messages)
            if isinstance(message, AIMessage) and not message.tool_calls
        ),
        None,
    )
    if response is None:
        raise ValueError("workflow ReAct agent did not return a final response")
    return WorkflowReactDecision.model_validate(_parse_json_object(response.content))


def _cleared_state() -> dict[str, Any]:
    return {
        "workflowAssistant": None,
        "workflowContext": None,
        "workflowDecision": None,
        "workflowClarification": None,
        "workflowMetadata": None,
        "workflowSandboxRequirement": None,
    }


def _updated_context(
    context: WorkflowAgentContext,
    request: WorkflowAssistantStreamRequest,
    decision: WorkflowReactDecision,
) -> WorkflowAgentContext | None:
    next_context = context.model_copy(deep=True)
    next_context.selectedNodeId = request.selectedNodeId
    next_context.targetNodeIds = decision.action.targetNodeIds
    next_context.lastIntent = decision.action.intent
    next_context.lastScope = decision.action.scope
    next_context.lastRiskLevel = decision.action.riskLevel
    next_context.awaitingClarification = decision.kind == "clarification"
    next_context.pendingConfirmation = decision.kind == "plan"
    if decision.kind == "plan":
        stages = _normalize_stages(decision.stages)
        next_context.plan = WorkflowPlanPreviewResult(
            summary=decision.summary,
            mermaid=decision.mermaid,
            assumptions=decision.assumptions,
            stages=stages,
        )
        next_context.stageIndex = 0
        next_context.repairAttempts = 0
    return next_context


def _emit_clarification(
    writer,
    thread_id: str,
    decision: WorkflowReactDecision,
) -> None:
    if not decision.questions:
        raise ValueError("clarification result is missing questions")
    writer(
        {
            "type": workflow_event_type("clarification"),
            "threadId": thread_id,
            "summary": decision.summary,
            "questions": [item.model_dump() for item in decision.questions],
        }
    )
    writer({"type": workflow_event_type("end"), "threadId": thread_id})


def _emit_answer(writer, thread_id: str, decision: WorkflowReactDecision) -> None:
    message = decision.message or decision.summary
    if not message:
        raise ValueError("answer result is missing message")
    writer(
        {
            "type": workflow_event_type("message"),
            "threadId": thread_id,
            "message": message,
        }
    )
    writer(
        {
            "type": workflow_event_type("complete"),
            "threadId": thread_id,
            "message": message,
        }
    )
    writer({"type": workflow_event_type("end"), "threadId": thread_id})


def _emit_plan(writer, thread_id: str, decision: WorkflowReactDecision) -> None:
    if not decision.mermaid.strip() or not decision.stages:
        raise ValueError("workflow plan requires mermaid and stages")
    plan = WorkflowPlanPreviewResult(
        summary=decision.summary,
        mermaid=decision.mermaid,
        assumptions=decision.assumptions,
        stages=_normalize_stages(decision.stages),
    )
    writer(
        {
            "threadId": thread_id,
            **plan.model_dump(),
            "type": workflow_event_type("planPreview"),
        }
    )
    writer({"type": workflow_event_type("end"), "threadId": thread_id})


def _emit_patch(
    writer,
    *,
    request: WorkflowAssistantStreamRequest,
    context: WorkflowAgentContext,
    decision: WorkflowReactDecision,
    policy_gate: WorkflowPolicyGate,
):
    if not decision.operations:
        raise ValueError("patch result is missing operations")
    sequence = 1
    stage: WorkflowPlanStage | None = None
    if context.plan is not None and context.stageIndex < len(context.plan.stages):
        stage = context.plan.stages[context.stageIndex]
        sequence = stage.sequence
    patch = build_workflow_patch(decision.operations, sequence)
    require_valid_workflow_patch(request.workflow, patch)
    confirmed = request.clientEvent in {
        "confirm_plan",
        "stage_validated",
        "validation_failed",
    }
    policy = policy_gate.validate_patch(
        decision.action,
        patch,
        selected_node_id=request.selectedNodeId,
        confirmed=confirmed,
    )
    if not policy.allowed:
        raise ValueError(policy.reason or "workflow patch violates policy")

    stage_result = WorkflowPatchStage(
        stageId=stage.stageId if stage else "direct-change",
        sequence=sequence,
        title=stage.title if stage else decision.summary or "工作流调整",
        status="fixing" if request.clientEvent == "validation_failed" else "completed",
        final=stage.final if stage else True,
    )
    if stage is not None:
        writer(
            {
                "type": workflow_event_type("patchStage"),
                "threadId": context.threadId,
                "stage": stage_result.model_copy(
                    update={"status": "running"}
                ).model_dump(),
            }
        )
    result = WorkflowAssistantPatchResult(
        summary=decision.summary,
        patch=patch,
        stage=stage_result,
    )
    writer(
        {
            "threadId": context.threadId,
            "repair": request.clientEvent == "validation_failed",
            **result.model_dump(),
            "type": workflow_event_type("workflowPatch"),
        }
    )
    writer({"type": workflow_event_type("end"), "threadId": context.threadId})
    return policy


def _require_confirmed_action(
    context: WorkflowAgentContext,
    decision: WorkflowReactDecision,
) -> None:
    expected = (
        context.lastIntent,
        context.lastScope,
        context.lastRiskLevel,
        set(context.targetNodeIds),
    )
    actual = (
        decision.action.intent,
        decision.action.scope,
        decision.action.riskLevel,
        set(decision.action.targetNodeIds),
    )
    if actual != expected:
        raise ValueError(
            "generated patch action does not match the user-confirmed plan"
        )


def _normalize_stages(
    stages: list[WorkflowPlanStage],
) -> list[WorkflowPlanStage]:
    ordered = sorted(stages, key=lambda item: item.sequence)
    return [
        item.model_copy(
            update={"sequence": index, "final": index == len(ordered)}
        )
        for index, item in enumerate(ordered, start=1)
    ]


def _parse_json_object(content: Any) -> dict[str, Any]:
    if isinstance(content, list):
        text = "".join(
            item if isinstance(item, str) else str(item.get("text", ""))
            for item in content
            if isinstance(item, (str, dict))
        )
    else:
        text = str(content)
    text = text.strip()
    if text.startswith("```"):
        first_newline = text.find("\n")
        text = text[first_newline + 1 :] if first_newline >= 0 else text
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start < 0 or end <= start:
            raise ValueError("workflow agent did not return a JSON object")
        value = json.loads(text[start : end + 1])
    if not isinstance(value, dict):
        raise ValueError("workflow agent result must be a JSON object")
    return value
