from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.workflow import WorkflowDocument
from app.workflow.patch.schemas import WorkflowPatch


WorkflowAssistantClientEvent = Literal[
    "user_message",
    "confirm_plan",
    "revise_plan",
    "cancel_plan",
    "stage_validated",
    "validation_failed",
]


class WorkflowAssistantStreamRequest(BaseModel):
    threadId: str | None = None
    message: str = ""
    workflow: WorkflowDocument
    selectedNodeId: str | None = None
    clientEvent: WorkflowAssistantClientEvent = "user_message"
    validation: dict[str, Any] | None = None


class WorkflowPatchStage(BaseModel):
    stageId: str
    sequence: int = Field(ge=1)
    title: str
    status: Literal["running", "completed", "fixing", "failed"] = "completed"
    final: bool = False


class WorkflowClarificationOption(BaseModel):
    label: str
    value: str


class WorkflowClarificationQuestion(BaseModel):
    id: str
    question: str
    reason: str = ""
    required: bool = True
    inputType: Literal["single", "multiple", "text"] = "text"
    options: list[WorkflowClarificationOption] = Field(default_factory=list)
    allowOther: bool = True


class WorkflowPlanStage(BaseModel):
    stageId: str
    sequence: int = Field(ge=1)
    title: str
    instruction: str
    final: bool = False


class WorkflowPlanPreviewResult(BaseModel):
    type: Literal["plan_preview"] = "plan_preview"
    summary: str
    mermaid: str
    assumptions: list[str] = Field(default_factory=list)
    stages: list[WorkflowPlanStage] = Field(default_factory=list)


class WorkflowPlanDecision(BaseModel):
    kind: Literal["clarification", "plan"]
    summary: str = ""
    questions: list[WorkflowClarificationQuestion] = Field(default_factory=list)
    mermaid: str = ""
    assumptions: list[str] = Field(default_factory=list)
    stages: list[WorkflowPlanStage] = Field(default_factory=list)


class WorkflowPatchDraft(BaseModel):
    summary: str
    operations: list[dict[str, Any]]


class WorkflowAssistantPatchResult(BaseModel):
    type: Literal["workflow_patch"] = "workflow_patch"
    summary: str
    patch: WorkflowPatch
    stage: WorkflowPatchStage
