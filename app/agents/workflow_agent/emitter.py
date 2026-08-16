from __future__ import annotations

from app.agents.workflow_agent.events import workflow_event_type
from app.agents.workflow_agent.graph_payload import graph_business_payload
from app.agents.workflow_agent.policy import WorkflowPolicyGate
from app.agents.workflow_agent.schemas import (
    WorkflowActionPlan,
    WorkflowAgentContext,
    WorkflowAssistantGraphResult,
    WorkflowAssistantStreamRequest,
    WorkflowClarificationQuestion,
    WorkflowGraphInput,
    WorkflowMetadataProposal,
    WorkflowPlanPreviewResult,
    WorkflowPlanStage,
    WorkflowPolicyDecision,
    WorkflowSandboxRequirement,
)
from app.schemas.workflow import WorkflowEdge, WorkflowNode


class WorkflowOutputEmitter:
    def __init__(self, policy_gate: WorkflowPolicyGate | None = None) -> None:
        self._policy_gate = policy_gate or WorkflowPolicyGate()

    def emit_metadata(
        self,
        writer,
        *,
        request: WorkflowAssistantStreamRequest,
        context: WorkflowAgentContext,
        proposal: WorkflowMetadataProposal,
    ) -> WorkflowPolicyDecision:
        action = WorkflowActionPlan(
            intent="modify_workflow",
            scope="workflow_metadata",
            riskLevel="low",
            summary="更新工作流名称和描述",
        )
        policy = self._assess_action(action, request)
        writer(
            {
                "type": workflow_event_type("workflowMetadata"),
                "threadId": context.threadId,
                **proposal.model_dump(),
            }
        )
        return policy

    def emit_clarification(
        self,
        writer,
        *,
        context: WorkflowAgentContext,
        summary: str,
        questions: list[WorkflowClarificationQuestion],
    ) -> WorkflowAgentContext:
        if not questions:
            raise ValueError("clarification result is missing questions")
        next_context = context.model_copy(deep=True)
        next_context.awaitingClarification = True
        writer(
            {
                "type": workflow_event_type("clarification"),
                "threadId": context.threadId,
                "summary": summary or "需要补充关键信息",
                "questions": [question.model_dump() for question in questions],
            }
        )
        self.emit_end(writer, context.threadId)
        return next_context

    def emit_sandbox_requirement(
        self,
        writer,
        *,
        context: WorkflowAgentContext,
        requirement: WorkflowSandboxRequirement,
    ) -> WorkflowAgentContext:
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
        self.emit_end(writer, context.threadId)
        return next_context

    def emit_answer(
        self,
        writer,
        *,
        request: WorkflowAssistantStreamRequest,
        context: WorkflowAgentContext,
        action: WorkflowActionPlan,
        message: str,
    ) -> WorkflowPolicyDecision:
        policy = self._assess_action(action, request)
        if action.scope != "read_only":
            raise ValueError("workflow answer requires read_only scope")
        if not message.strip():
            raise ValueError("answer result is missing message")
        writer(
            {
                "type": workflow_event_type("message"),
                "threadId": context.threadId,
                "message": message,
            }
        )
        writer(
            {
                "type": workflow_event_type("complete"),
                "threadId": context.threadId,
                "message": message,
            }
        )
        self.emit_end(writer, context.threadId)
        return policy

    def emit_plan(
        self,
        writer,
        *,
        request: WorkflowAssistantStreamRequest,
        context: WorkflowAgentContext,
        action: WorkflowActionPlan,
        summary: str,
        mermaid: str,
        assumptions: list[str],
        stages: list[WorkflowPlanStage],
    ) -> tuple[WorkflowAgentContext, WorkflowPolicyDecision]:
        policy = self._assess_action(action, request)
        if not policy.requiresConfirmation:
            raise ValueError("workflow plan requires a confirmable action")
        if not mermaid.strip() or not stages:
            raise ValueError("workflow plan requires mermaid and stages")
        plan = WorkflowPlanPreviewResult(
            summary=summary,
            mermaid=mermaid,
            assumptions=assumptions,
            stages=_normalize_stages(stages),
        )
        next_context = _update_action_context(context, request, action)
        next_context.pendingConfirmation = True
        next_context.plan = plan
        writer(
            {
                "threadId": context.threadId,
                **plan.model_dump(),
                "type": workflow_event_type("planPreview"),
            }
        )
        self.emit_end(writer, context.threadId)
        return next_context, policy

    def emit_graph(
        self,
        writer,
        *,
        request: WorkflowAssistantStreamRequest,
        context: WorkflowAgentContext,
        action: WorkflowActionPlan,
        summary: str,
        nodes: list[WorkflowNode],
        edges: list[WorkflowEdge],
    ) -> tuple[WorkflowAgentContext, WorkflowPolicyDecision]:
        if request.clientEvent == "confirm_plan":
            _require_confirmed_action(context, action)
        policy = self._assess_action(action, request)
        if policy.requiresConfirmation and request.clientEvent != "confirm_plan":
            raise ValueError("workflow change requires user confirmation")
        result = WorkflowAssistantGraphResult(
            summary=summary,
            graph=WorkflowGraphInput(nodes=nodes, edges=edges),
        )
        writer(
            {
                "threadId": context.threadId,
                "summary": result.summary,
                "graph": graph_business_payload(result.graph),
                "type": workflow_event_type("workflowGraph"),
            }
        )
        writer(
            {
                "type": workflow_event_type("complete"),
                "threadId": context.threadId,
                "message": "工作流已生成，可以应用到正式画布",
            }
        )
        self.emit_end(writer, context.threadId)
        next_context = _update_action_context(context, request, action)
        next_context.pendingConfirmation = False
        next_context.plan = None
        return next_context, policy

    def emit_cancel(self, writer, thread_id: str) -> None:
        writer(
            {
                "type": workflow_event_type("end"),
                "threadId": thread_id,
                "cancelled": True,
            }
        )

    def emit_complete(self, writer, thread_id: str) -> None:
        writer(
            {
                "type": workflow_event_type("complete"),
                "threadId": thread_id,
                "message": "工作流已生成，可以应用到正式画布",
            }
        )
        self.emit_end(writer, thread_id)

    def emit_system_notice(
        self,
        writer,
        *,
        thread_id: str,
        code: str,
        level: str,
        message: str,
        detail: str = "",
        terminal: bool = False,
    ) -> None:
        writer(
            {
                "type": workflow_event_type("systemNotice"),
                "threadId": thread_id,
                "code": code,
                "level": level,
                "message": message,
                "detail": detail,
                "terminal": terminal,
            }
        )
        if terminal:
            self.emit_end(writer, thread_id)

    def emit_error(self, writer, thread_id: str, message: str) -> None:
        if not message.strip():
            raise ValueError("workflow error requires a message")
        writer(
            {
                "type": workflow_event_type("error"),
                "threadId": thread_id,
                "message": message,
            }
        )
        self.emit_end(writer, thread_id)

    @staticmethod
    def emit_end(writer, thread_id: str) -> None:
        writer({"type": workflow_event_type("end"), "threadId": thread_id})

    def _assess_action(
        self,
        action: WorkflowActionPlan,
        request: WorkflowAssistantStreamRequest,
    ) -> WorkflowPolicyDecision:
        policy = self._policy_gate.assess_action(
            action,
            selected_node_id=request.selectedNodeId,
        )
        if not policy.allowed:
            raise ValueError(policy.reason or "workflow action is not allowed")
        return policy

def _update_action_context(
    context: WorkflowAgentContext,
    request: WorkflowAssistantStreamRequest,
    action: WorkflowActionPlan,
) -> WorkflowAgentContext:
    next_context = context.model_copy(deep=True)
    next_context.selectedNodeId = request.selectedNodeId
    next_context.targetNodeIds = action.targetNodeIds
    next_context.lastIntent = action.intent
    next_context.lastScope = action.scope
    next_context.lastRiskLevel = action.riskLevel
    next_context.awaitingClarification = False
    return next_context


def _require_confirmed_action(
    context: WorkflowAgentContext,
    action: WorkflowActionPlan,
) -> None:
    expected = (
        context.lastIntent,
        context.lastScope,
        context.lastRiskLevel,
        set(context.targetNodeIds),
    )
    actual = (
        action.intent,
        action.scope,
        action.riskLevel,
        set(action.targetNodeIds),
    )
    if actual != expected:
        raise ValueError(
            "generated Graph action does not match the user-confirmed plan"
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
