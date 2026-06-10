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
    selectorBranches: list[WorkflowSelectorBranch] = Field(default_factory=list)
    selectorElseBranch: str = "default"
    loopMode: Literal["array", "count"] = "array"
    loopArraySource: str = ""
    loopCount: int = Field(default=3, ge=0, le=1000)
    loopIntermediateVariables: list[dict[str, Any]] = Field(default_factory=list)
    loopBodyNodes: list[dict[str, Any]] = Field(default_factory=list)
    loopBodyEdges: list[dict[str, Any]] = Field(default_factory=list)
    loopOutputs: list[dict[str, Any]] = Field(default_factory=list)
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
