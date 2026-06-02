from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class WorkflowInputMapping(BaseModel):
    field: str
    sourceType: Literal["node", "context", "literal"]
    source: str
    valueType: str = ""


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
    visionInputMappings: list[WorkflowInputMapping] = Field(default_factory=list)
    visionInputAsBase64: bool = False
    supportContinuation: bool = False
    timeoutSeconds: int = 180
    firstTokenTimeoutEnabled: bool = False
    retryCount: int = 0
    errorStrategy: Literal["interrupt", "fallback", "ignore"] = "interrupt"
    fallbackOutput: str = ""


class WorkflowNodeIO(BaseModel):
    name: str
    type: str
    description: str = ""


class WorkflowNode(BaseModel):
    id: str
    title: str
    type: Literal["start", "llm", "selector", "loop", "code", "end"]
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
    status: Literal["success", "error"] = "success"


class WorkflowRunResponse(BaseModel):
    output: dict[str, Any]
    state: dict[str, Any]
    steps: list[WorkflowRunStep]
