from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class AgentRuntimeDefinition(BaseModel):
    kind: Literal["react_agent", "workflow_graph"]
    factory: str
    stream_modes: list[str] = Field(
        default_factory=lambda: ["values", "messages", "custom"]
    )
    max_turns: int | None = None
    timeout_seconds: int | None = None


class AgentModelConfig(BaseModel):
    name: str | None = None
    thinking_enabled: bool | None = None
    reasoning_effort: str | None = None


class AgentPromptConfig(BaseModel):
    system: str | None = None
    template: str | None = None


class AgentToolConfig(BaseModel):
    groups: list[str] | None = None
    allowed: list[str] | None = None
    disallowed: list[str] = Field(default_factory=list)


class AgentMiddlewareConfig(BaseModel):
    enabled: list[str] | None = None
    disabled: list[str] = Field(default_factory=list)


class AgentDefinition(BaseModel):
    id: str
    name: str
    description: str = ""
    builtin: bool = False
    enabled: bool = True
    runtime: AgentRuntimeDefinition
    model: AgentModelConfig = Field(default_factory=AgentModelConfig)
    prompt: AgentPromptConfig = Field(default_factory=AgentPromptConfig)
    skills: list[str] | None = None
    tools: AgentToolConfig = Field(default_factory=AgentToolConfig)
    middleware: AgentMiddlewareConfig = Field(default_factory=AgentMiddlewareConfig)
    metadata: dict[str, Any] = Field(default_factory=dict)
