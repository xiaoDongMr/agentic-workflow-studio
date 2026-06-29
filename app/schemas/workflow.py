from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


WorkflowReasoningEffort = Literal["minimal", "low", "medium", "high"]
WorkflowSelectorOperator = Literal[
    "equals",
    "not_equals",
    "length_gt",
    "length_gte",
    "length_lt",
    "length_lte",
    "contains",
    "not_contains",
]


class WorkflowInputMapping(BaseModel):
    field: str
    sourceType: Literal["node", "context", "literal"]
    source: str
    valueType: str = ""


class WorkflowLoopOutputRef(BaseModel):
    id: str = ""
    name: str
    nodeId: str = ""
    fieldPath: str = ""
    type: str = "String"

    @model_validator(mode="after")
    def normalize_fields(self) -> "WorkflowLoopOutputRef":
        self.name = self.name.strip()
        self.nodeId = self.nodeId.strip()
        self.fieldPath = self.fieldPath.strip()
        return self


class WorkflowRuleOperand(BaseModel):
    sourceType: Literal["literal", "context", "node"] = "literal"
    source: str = ""
    valueType: str = "String"
    literalValue: Any = None
    contextPath: str = ""
    nodeId: str = ""
    fieldPath: str = ""
    displayLabel: str = ""


class WorkflowSelectorOperand(WorkflowRuleOperand):
    pass


class WorkflowSelectorCondition(BaseModel):
    id: str = ""
    operator: WorkflowSelectorOperator = "equals"
    left: WorkflowSelectorOperand = Field(default_factory=WorkflowSelectorOperand)
    right: WorkflowSelectorOperand = Field(default_factory=WorkflowSelectorOperand)


class WorkflowSelectorBranch(BaseModel):
    id: str = ""
    label: str = ""
    conditions: list[WorkflowSelectorCondition] = Field(default_factory=list)


class WorkflowNodeConfig(BaseModel):
    prompt: str = ""
    systemPrompt: str = ""
    userPrompt: str = ""
    model: str = ""
    modelProvider: str = "deerflow"
    temperature: float = 0
    maxTokens: int = 0
    enabled: bool = True
    fallbackToHuman: bool = False
    responseMode: Literal["text", "json", "stream"] = "text"
    outputKey: str = "output"
    reasoningKey: str = "reasoning_content"
    inputMappings: list[WorkflowInputMapping] = Field(default_factory=list)
    visionInputAsBase64: bool = False
    supportContinuation: bool = False
    thinkingEnabled: bool = False
    reasoningEffort: WorkflowReasoningEffort = "medium"
    timeoutSeconds: int = 180
    retryCount: int = Field(default=1, ge=0, le=10)
    errorStrategy: Literal["interrupt", "fallback", "ignore"] = "ignore"
    fallbackOutput: str = ""
    codeLanguage: Literal["python"] = "python"
    codeSource: Literal["sandbox_file", "inline"] = "sandbox_file"
    codeFilePath: str = "/workspace/code/main.py"
    codeEntryFunction: str = "main"
    codeSyncStatus: Literal["saved", "dirty", "saving", "failed"] = "saved"
    codeLastSavedSignature: str = ""
    selectorBranches: list[WorkflowSelectorBranch] = Field(default_factory=list)
    selectorElseBranch: str = "default"
    loopMode: Literal["array", "count"] = "array"
    loopCount: int = Field(default=3, ge=1, le=100)
    loopBodyNodes: list["WorkflowNode"] = Field(default_factory=list)
    loopBodyEdges: list["WorkflowEdge"] = Field(default_factory=list)
    loopOutputs: list[WorkflowLoopOutputRef] = Field(default_factory=list)
    loopCanvasWidth: int = Field(default=640, ge=420, le=1200)
    loopCanvasHeight: int = Field(default=440, ge=320, le=900)

    @model_validator(mode="before")
    @classmethod
    def migrate_legacy_thinking_level(cls, data: Any) -> Any:
        if not isinstance(data, dict) or "thinkingLevel" not in data:
            return data
        legacy = data.get("thinkingLevel")
        if "thinkingEnabled" not in data:
            data["thinkingEnabled"] = legacy != "minimal"
        if legacy in {"minimal", "low", "medium", "high"} and "reasoningEffort" not in data:
            data["reasoningEffort"] = "medium" if legacy == "minimal" else legacy
        return data

    @model_validator(mode="after")
    def validate_loop_config(self) -> "WorkflowNodeConfig":
        self._validate_loop_outputs()
        return self

    def _validate_loop_outputs(self) -> None:
        output_names: set[str] = set()
        body_nodes_by_id = {node.id: node for node in self.loopBodyNodes}

        for output in self.loopOutputs:
            if not output.name:
                raise ValueError("循环输出变量名不能为空")
            if output.name in output_names:
                raise ValueError(f"循环输出变量名重复：{output.name}")
            output_names.add(output.name)

            if not output.nodeId:
                raise ValueError(f"循环输出 {output.name} 缺少子图节点")
            if output.nodeId not in body_nodes_by_id:
                raise ValueError(f"循环输出 {output.name} 引用了不存在的子图节点")
            if not output.fieldPath:
                raise ValueError(f"循环输出 {output.name} 缺少子图输出变量")

            body_node = body_nodes_by_id[output.nodeId]
            if output.fieldPath not in {item.name for item in body_node.outputs}:
                raise ValueError(f"循环输出 {output.name} 引用了不存在的子图输出变量")


class WorkflowNodeIO(BaseModel):
    name: str
    type: str
    description: str = ""


class WorkflowNode(BaseModel):
    id: str
    title: str
    type: Literal["start", "llm", "selector", "loop", "loop-start", "loop-end", "code", "end"]
    description: str = ""
    position: dict[str, float] = Field(default_factory=dict)
    status: str = "idle"
    inputs: list[WorkflowNodeIO] = Field(default_factory=list)
    outputs: list[WorkflowNodeIO] = Field(default_factory=list)
    config: WorkflowNodeConfig


class WorkflowEdge(BaseModel):
    id: str | None = None
    source: str
    target: str
    sourcePortID: str | int | None = None
    targetPortID: str | int | None = None


class WorkflowDocument(BaseModel):
    id: str
    name: str
    description: str = ""
    version: str = "v0.1.0"
    nodes: list[WorkflowNode]
    edges: list[WorkflowEdge]


WorkflowNodeConfig.model_rebuild()
WorkflowNode.model_rebuild()


class WorkflowRunRequest(BaseModel):
    workflow: WorkflowDocument
    input: dict[str, Any] = Field(default_factory=dict)


class WorkflowRunStep(BaseModel):
    nodeId: str
    nodeTitle: str
    log: str
    input: dict[str, Any]
    output: dict[str, Any]
    durationMs: int
    status: Literal["running", "success", "error"] = "success"
    error: str | None = None


class WorkflowRunResponse(BaseModel):
    output: dict[str, Any]
    state: dict[str, Any]
    steps: list[WorkflowRunStep]


class WorkflowSaveDraftRequest(BaseModel):
    workflow: WorkflowDocument
    workspaceId: str = "00000000-0000-0000-0000-000000000000"


class WorkflowProjectUpdateRequest(BaseModel):
    name: str
    description: str = ""
    workspaceId: str = "00000000-0000-0000-0000-000000000000"


class WorkflowProjectDuplicateRequest(BaseModel):
    name: str | None = None
    workspaceId: str = "00000000-0000-0000-0000-000000000000"


class WorkflowProjectSummary(BaseModel):
    id: str
    name: str
    description: str = ""
    status: str = "draft"
    currentDraftVersionId: str | None = None
    latestPublishedVersionId: str | None = None
    nodeCount: int = 0
    edgeCount: int = 0
    updatedAt: str
    preview: dict[str, Any] = Field(default_factory=dict)


class WorkflowProjectPage(BaseModel):
    items: list[WorkflowProjectSummary]
    page: int = 1
    pageSize: int = 6
    total: int = 0


class WorkflowVersionSummary(BaseModel):
    id: str
    version: str
    name: str
    description: str = ""
    nodeCount: int = 0
    edgeCount: int = 0
    createdAt: str
    updatedAt: str
    isCurrent: bool = False


class WorkflowSaveDraftResponse(BaseModel):
    project: WorkflowProjectSummary
    workflow: WorkflowDocument
