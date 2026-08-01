from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass
from typing import Any, AsyncIterator

from app.agents.workflow_agent.llm import WorkflowGenerationModel
from app.agents.workflow_agent.schemas import (
    WorkflowAssistantPatchResult,
    WorkflowAssistantStreamRequest,
    WorkflowPatchStage,
    WorkflowPlanDecision,
    WorkflowPlanPreviewResult,
)
from app.schemas.workflow import WorkflowDocument
from app.workflow.patch.builder import build_workflow_patch
from app.workflow.patch.validator import require_valid_workflow_patch
from deerflow.config.app_config import AppConfig


MAX_REPAIR_ATTEMPTS = 2


@dataclass
class WorkflowAgentSession:
    thread_id: str
    request: str
    selected_node_id: str | None
    workflow: WorkflowDocument
    plan: WorkflowPlanPreviewResult | None = None
    stage_index: int = 0
    repair_attempts: int = 0
    awaiting_clarification: bool = False


class WorkflowAgentOrchestrator:
    _sessions: dict[str, WorkflowAgentSession] = {}
    _sessions_lock = asyncio.Lock()

    def __init__(self, app_config: AppConfig):
        self._agent = WorkflowGenerationModel(app_config)

    async def stream(
        self,
        request: WorkflowAssistantStreamRequest,
    ) -> AsyncIterator[tuple[str, dict[str, Any]]]:
        thread_id = request.threadId or f"workflow-agent-{uuid.uuid4().hex}"
        yield "session", {"threadId": thread_id}

        try:
            if request.clientEvent in {"user_message", "revise_plan"}:
                async for event in self._plan(thread_id, request):
                    yield event
                return
            if request.clientEvent == "confirm_plan":
                session = await self._require_session(thread_id)
                session.workflow = request.workflow
                session.stage_index = 0
                session.repair_attempts = 0
                async for event in self._generate_current_stage(session):
                    yield event
                return
            if request.clientEvent == "stage_validated":
                session = await self._require_session(thread_id)
                session.workflow = request.workflow
                session.repair_attempts = 0
                session.stage_index += 1
                if session.plan is None or session.stage_index >= len(session.plan.stages):
                    async with self._sessions_lock:
                        self._sessions.pop(thread_id, None)
                    yield "complete", {
                        "threadId": thread_id,
                        "message": "所有阶段已生成并通过校验",
                    }
                    yield "end", {"threadId": thread_id}
                    return
                async for event in self._generate_current_stage(session):
                    yield event
                return
            if request.clientEvent == "validation_failed":
                session = await self._require_session(thread_id)
                session.workflow = request.workflow
                async for event in self._repair_current_stage(
                    session,
                    request.validation or {},
                ):
                    yield event
                return
            if request.clientEvent == "cancel_plan":
                async with self._sessions_lock:
                    self._sessions.pop(thread_id, None)
                yield "end", {"threadId": thread_id, "cancelled": True}
                return
            raise ValueError(f"unsupported client event: {request.clientEvent}")
        except Exception as exc:
            yield "error", {"threadId": thread_id, "message": str(exc)}
            yield "end", {"threadId": thread_id}

    async def _plan(
        self,
        thread_id: str,
        request: WorkflowAssistantStreamRequest,
    ) -> AsyncIterator[tuple[str, dict[str, Any]]]:
        existing = self._sessions.get(thread_id)
        previous_request = (
            existing.request if existing and existing.awaiting_clarification else ""
        )
        yield "message", {
            "threadId": thread_id,
            "message": "正在理解需求并规划工作流",
        }
        decision = await self._agent.plan(
            message=request.message,
            workflow=request.workflow,
            selected_node_id=request.selectedNodeId,
            previous_request=previous_request,
        )
        session = WorkflowAgentSession(
            thread_id=thread_id,
            request=_merge_request(previous_request, request.message),
            selected_node_id=request.selectedNodeId,
            workflow=request.workflow,
        )
        if decision.kind == "clarification":
            session.awaiting_clarification = True
            await self._save_session(session)
            yield "clarification", _clarification_payload(thread_id, decision)
            yield "end", {"threadId": thread_id}
            return

        plan = WorkflowPlanPreviewResult(
            summary=decision.summary,
            mermaid=decision.mermaid,
            assumptions=decision.assumptions,
            stages=decision.stages,
        )
        session.plan = plan
        await self._save_session(session)
        yield "planPreview", {"threadId": thread_id, **plan.model_dump()}
        yield "end", {"threadId": thread_id}

    async def _generate_current_stage(
        self,
        session: WorkflowAgentSession,
    ) -> AsyncIterator[tuple[str, dict[str, Any]]]:
        if session.plan is None:
            raise ValueError("workflow plan is missing")
        stage = session.plan.stages[session.stage_index]
        yield "patchStage", {
            "threadId": session.thread_id,
            "stage": WorkflowPatchStage(
                stageId=stage.stageId,
                sequence=stage.sequence,
                title=stage.title,
                status="running",
                final=stage.final,
            ).model_dump(),
        }
        draft = await self._agent.generate_stage(
            request=session.request,
            plan=session.plan,
            stage=stage,
            workflow=session.workflow,
            selected_node_id=session.selected_node_id,
        )
        patch = build_workflow_patch(draft.operations, stage.sequence)
        require_valid_workflow_patch(session.workflow, patch)
        result = WorkflowAssistantPatchResult(
            summary=draft.summary,
            patch=patch,
            stage=WorkflowPatchStage(
                stageId=stage.stageId,
                sequence=stage.sequence,
                title=stage.title,
                status="completed",
                final=stage.final,
            ),
        )
        yield "workflowPatch", {
            "threadId": session.thread_id,
            **result.model_dump(),
        }
        yield "end", {"threadId": session.thread_id}

    async def _repair_current_stage(
        self,
        session: WorkflowAgentSession,
        validation: dict[str, Any],
    ) -> AsyncIterator[tuple[str, dict[str, Any]]]:
        if session.plan is None or session.stage_index >= len(session.plan.stages):
            raise ValueError("no workflow stage is available for repair")
        session.repair_attempts += 1
        if session.repair_attempts > MAX_REPAIR_ATTEMPTS:
            raise ValueError("自动修复已达到最大次数，请调整需求或手动修复")

        stage = session.plan.stages[session.stage_index]
        yield "fixing", {
            "threadId": session.thread_id,
            "stageId": stage.stageId,
            "attempt": session.repair_attempts,
            "message": "正在根据画布校验结果自动修复",
        }
        draft = await self._agent.repair(
            request=session.request,
            workflow=session.workflow,
            validation=validation,
            stage=stage,
        )
        patch = build_workflow_patch(draft.operations, stage.sequence)
        require_valid_workflow_patch(session.workflow, patch)
        result = WorkflowAssistantPatchResult(
            summary=draft.summary,
            patch=patch,
            stage=WorkflowPatchStage(
                stageId=f"{stage.stageId}-fix-{session.repair_attempts}",
                sequence=stage.sequence,
                title=f"修复：{stage.title}",
                status="fixing",
                final=stage.final,
            ),
        )
        yield "workflowPatch", {
            "threadId": session.thread_id,
            "repair": True,
            **result.model_dump(),
        }
        yield "end", {"threadId": session.thread_id}

    async def _save_session(self, session: WorkflowAgentSession) -> None:
        async with self._sessions_lock:
            self._sessions[session.thread_id] = session

    async def _require_session(self, thread_id: str) -> WorkflowAgentSession:
        async with self._sessions_lock:
            session = self._sessions.get(thread_id)
        if session is None:
            raise ValueError("工作流助手会话不存在或已过期，请重新提交需求")
        return session


def _merge_request(previous_request: str, message: str) -> str:
    if not previous_request:
        return message.strip()
    return f"{previous_request.strip()}\n用户补充：{message.strip()}"


def _clarification_payload(
    thread_id: str,
    decision: WorkflowPlanDecision,
) -> dict[str, Any]:
    return {
        "threadId": thread_id,
        "summary": decision.summary,
        "questions": [question.model_dump() for question in decision.questions],
    }
