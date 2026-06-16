from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


SandboxStatus = Literal["Pending", "Running", "Succeeded", "Failed", "Unknown"]


class SandboxCreateRequest(BaseModel):
    sandbox_id: str = Field(..., min_length=1)
    image: str | None = None
    env: dict[str, str] = Field(default_factory=dict)
    labels: dict[str, str] = Field(default_factory=dict)


class SandboxSummary(BaseModel):
    sandbox_id: str
    sandbox_url: str = ""
    status: SandboxStatus = "Unknown"
    pod_name: str = ""
    service_name: str = ""
    ingress_name: str = ""
    namespace: str = ""
    node_name: str = ""
    pod_ip: str = ""
    created_at: str = ""
    labels: dict[str, str] = Field(default_factory=dict)


class SandboxListResponse(BaseModel):
    sandboxes: list[SandboxSummary]


class SandboxPoolHealth(BaseModel):
    backend: Literal["kubernetes_api"] = "kubernetes_api"
    namespace: str
    client: str
    enabled: bool
    extra: dict[str, Any] = Field(default_factory=dict)
