from __future__ import annotations

from typing import Literal

from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from app.schemas.workflow import WorkflowDocument, WorkflowEdge, WorkflowNode


WorkflowAssistantClientEvent = Literal[
    "user_message",
    "clarification_response",
    "confirm_plan",
    "revise_plan",
    "cancel_plan",
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
    workflowId: str = ""
    message: str = ""
    workflow: WorkflowDocument
    selectedNodeId: str | None = None
    sandboxId: str | None = None
    sandboxBindingStatus: WorkflowSandboxBindingStatus | None = None
    clientEvent: WorkflowAssistantClientEvent = "user_message"

    @model_validator(mode="after")
    def normalize_workflow_id(self) -> WorkflowAssistantStreamRequest:
        document_id = self.workflow.id.strip()
        request_id = self.workflowId.strip()
        if not document_id:
            raise ValueError("workflow.id is required")
        if request_id and request_id != document_id:
            raise ValueError("workflowId must match workflow.id")
        self.workflowId = document_id
        return self


class WorkflowClarificationOption(BaseModel):
    label: str = Field(description="展示给用户的选项文本。")
    value: str = Field(description="提交给 Agent 的选项值。")


class WorkflowClarificationInput(BaseModel):
    question: str = Field(description="需要用户回答的明确问题。")
    options: list[str] = Field(
        default_factory=list,
        description="可选答案；自由文本问题留空。",
    )
    multiple: bool = Field(
        default=False,
        description="存在候选项时，是否允许多选。",
    )

    @field_validator("question")
    @classmethod
    def validate_question(cls, value: str) -> str:
        question = value.strip()
        if not question:
            raise ValueError("clarification question must not be empty")
        return question

    @field_validator("options")
    @classmethod
    def normalize_options(cls, values: list[str]) -> list[str]:
        options: list[str] = []
        seen: set[str] = set()
        for value in values:
            option = value.strip()
            if option and option not in seen:
                options.append(option)
                seen.add(option)
        return options


class WorkflowClarificationQuestion(BaseModel):
    id: str = Field(
        validation_alias=AliasChoices("id", "field"),
        description="问题的稳定唯一标识，例如 goal、channel。",
    )
    question: str = Field(description="展示给用户的明确问题。")
    reason: str = Field(
        default="",
        description="需要询问该问题的简短原因。",
    )
    required: bool = Field(
        default=True,
        description="是否必须回答。",
    )
    inputType: Literal["single", "multiple", "text"] = Field(
        default="text",
        validation_alias=AliasChoices("inputType", "type"),
        description="回答方式：单选、多选或文本输入。",
    )
    options: list[WorkflowClarificationOption] = Field(
        default_factory=list,
        description="单选或多选的候选项；文本输入时为空。",
    )
    allowOther: bool = Field(
        default=True,
        description="是否允许用户填写候选项之外的答案。",
    )


class WorkflowPlanPreviewResult(BaseModel):
    type: Literal["plan_preview"] = "plan_preview"
    summary: str
    mermaid: str


class WorkflowActionPlan(BaseModel):
    intent: WorkflowIntent = Field(
        description="用户请求的动作类型，例如创建工作流、修改节点、解释流程或修复校验错误。",
    )
    scope: WorkflowChangeScope = Field(
        description="本次动作的影响范围，例如整张工作流、局部节点、当前选中节点、只读或仅元数据。",
    )
    riskLevel: WorkflowRiskLevel = Field(
        description="变更风险等级；低风险局部配置可直接改，中高风险或整图变更需要先确认。",
    )
    targetNodeIds: list[str] = Field(
        default_factory=list,
        description="本次动作允许影响的节点 ID；只读或整图创建时可为空。",
    )
    requiresConfirmation: bool = Field(
        default=False,
        description="是否需要用户确认后再生成变更；整图、中高风险、删除或重连通常为 true。",
    )
    summary: str = Field(
        default="",
        description="本次动作的简短中文摘要。",
    )


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


class WorkflowGraphInput(BaseModel):
    nodes: list[WorkflowNode]
    edges: list[WorkflowEdge]


class WorkflowGraphEdgeInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str | None = None
    source: str
    target: str
    sourcePortID: str | int | None = None
    targetPortID: str | int | None = None
