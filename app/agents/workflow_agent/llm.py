from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents.workflow_agent.prompt import (
    WORKFLOW_PLAN_SYSTEM_PROMPT,
    WORKFLOW_REPAIR_SYSTEM_PROMPT,
    WORKFLOW_STAGE_SYSTEM_PROMPT,
)
from app.agents.workflow_agent.schemas import (
    WorkflowPatchDraft,
    WorkflowPlanDecision,
    WorkflowPlanPreviewResult,
    WorkflowPlanStage,
)
from app.schemas.workflow import WorkflowDocument
from deerflow.config.app_config import AppConfig
from deerflow.models import create_chat_model


class WorkflowGenerationModel:
    """Workflow-domain LLM adapter with strict JSON boundaries."""

    def __init__(self, app_config: AppConfig):
        self._app_config = app_config

    async def plan(
        self,
        *,
        message: str,
        workflow: WorkflowDocument,
        selected_node_id: str | None,
        previous_request: str = "",
    ) -> WorkflowPlanDecision:
        raw = await self._invoke(
            WORKFLOW_PLAN_SYSTEM_PROMPT,
            {
                "userRequest": message,
                "previousRequest": previous_request,
                "selectedNodeId": selected_node_id,
                "workflow": workflow.model_dump(),
            },
        )
        decision = WorkflowPlanDecision.model_validate(_parse_json_object(raw))
        if decision.kind == "plan":
            decision.stages = _normalize_stages(decision.stages)
            if not decision.mermaid.strip():
                raise ValueError("workflow plan is missing mermaid")
            if not decision.stages:
                raise ValueError("workflow plan is missing stages")
        elif not decision.questions:
            raise ValueError("clarification result is missing questions")
        return decision

    async def generate_stage(
        self,
        *,
        request: str,
        plan: WorkflowPlanPreviewResult,
        stage: WorkflowPlanStage,
        workflow: WorkflowDocument,
        selected_node_id: str | None,
    ) -> WorkflowPatchDraft:
        raw = await self._invoke(
            WORKFLOW_STAGE_SYSTEM_PROMPT,
            {
                "userRequest": request,
                "selectedNodeId": selected_node_id,
                "confirmedPlan": plan.model_dump(),
                "currentStage": stage.model_dump(),
                "currentWorkflow": workflow.model_dump(),
            },
        )
        return WorkflowPatchDraft.model_validate(_parse_json_object(raw))

    async def repair(
        self,
        *,
        request: str,
        workflow: WorkflowDocument,
        validation: dict[str, Any],
        stage: WorkflowPlanStage,
    ) -> WorkflowPatchDraft:
        raw = await self._invoke(
            WORKFLOW_REPAIR_SYSTEM_PROMPT,
            {
                "userRequest": request,
                "currentStage": stage.model_dump(),
                "currentWorkflow": workflow.model_dump(),
                "validation": validation,
            },
        )
        return WorkflowPatchDraft.model_validate(_parse_json_object(raw))

    async def _invoke(self, system_prompt: str, payload: dict[str, Any]) -> str:
        model = create_chat_model(
            name=None,
            thinking_enabled=False,
            app_config=self._app_config,
            temperature=0,
        )
        response = await model.ainvoke(
            [
                SystemMessage(content=system_prompt),
                HumanMessage(content=json.dumps(payload, ensure_ascii=False)),
            ]
        )
        return _message_text(response)


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


def _parse_json_object(raw: str) -> dict[str, Any]:
    text = raw.strip()
    if text.startswith("```"):
        first_newline = text.find("\n")
        text = text[first_newline + 1 :] if first_newline >= 0 else text
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start < 0 or end <= start:
            raise ValueError("model did not return a JSON object")
        parsed = json.loads(text[start : end + 1])
    if not isinstance(parsed, dict):
        raise ValueError("model result must be a JSON object")
    return parsed


def _message_text(message: Any) -> str:
    content = getattr(message, "content", message)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and isinstance(item.get("text"), str):
                parts.append(item["text"])
        return "".join(parts)
    return json.dumps(content, ensure_ascii=False)
