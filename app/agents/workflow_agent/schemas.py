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
    "sandbox_bound",
]

WorkflowIntent = Literal[
    "create_workflow",
    "modify_workflow",
    "modify_selected_node",
    "insert_node",
    "remove_node",
    "rewire_edges",
    "optimize_node",
    "fix_validation",
    "explain_workflow",
    "debug_node",
]
WorkflowChangeScope = Literal[
    "full_workflow",
    "partial_workflow",
    "selected_node_only",
    "target_nodes",
    "read_only",
    "workflow_metadata",
]
WorkflowRiskLevel = Literal["low", "medium", "high"]
WorkflowSandboxBindingStatus = Literal["unbound", "bound", "unavailable"]


class WorkflowAssistantStreamRequest(BaseModel):
    threadId: str | None = None
    message: str = ""
    workflow: WorkflowDocument
    selectedNodeId: str | None = None
    sandboxId: str | None = None
    sandboxBindingStatus: WorkflowSandboxBindingStatus | None = None
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


class WorkflowActionPlan(BaseModel):
    intent: WorkflowIntent
    scope: WorkflowChangeScope
    riskLevel: WorkflowRiskLevel
    targetNodeIds: list[str] = Field(default_factory=list)
    requiresConfirmation: bool = False
    summary: str = ""


class WorkflowPolicyDecision(BaseModel):
    allowed: bool
    requiresConfirmation: bool = False
    reason: str = ""
    violations: list[str] = Field(default_factory=list)


class WorkflowAgentContext(BaseModel):
    threadId: str
    requestSummary: str = ""
    selectedNodeId: str | None = None
    targetNodeIds: list[str] = Field(default_factory=list)
    lastIntent: WorkflowIntent | None = None
    lastScope: WorkflowChangeScope | None = None
    lastRiskLevel: WorkflowRiskLevel | None = None
    pendingConfirmation: bool = False
    plan: WorkflowPlanPreviewResult | None = None
    stageIndex: int = 0
    repairAttempts: int = 0
    awaitingClarification: bool = False
    sandboxId: str | None = None
    sandboxBindingStatus: WorkflowSandboxBindingStatus = "unbound"


class WorkflowMetadataProposal(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=1000)


class WorkflowSandboxRequirement(BaseModel):
    workflowId: str
    reason: str
    requestedCapabilities: list[str] = Field(default_factory=list)


class WorkflowReactDecision(BaseModel):
    kind: Literal["clarification", "answer", "plan", "patch", "error"]
    action: WorkflowActionPlan
    summary: str = ""
    message: str = ""
    questions: list[WorkflowClarificationQuestion] = Field(default_factory=list)
    mermaid: str = ""
    assumptions: list[str] = Field(default_factory=list)
    stages: list[WorkflowPlanStage] = Field(default_factory=list)
    operations: list[dict[str, Any]] = Field(default_factory=list)


class WorkflowPatchDraft(BaseModel):
    summary: str
    operations: list[dict[str, Any]]


class WorkflowAssistantPatchResult(BaseModel):
    type: Literal["workflow_patch"] = "workflow_patch"
    summary: str
    patch: WorkflowPatch
    stage: WorkflowPatchStage
