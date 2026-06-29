from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


SandboxStatus = Literal["Pending", "Running", "Succeeded", "Failed", "Unknown"]


class SandboxCreateRequest(BaseModel):
    sandbox_id: str = Field(..., min_length=1)
    image_id: str | None = None
    image: str | None = None
    ttl_seconds: int | None = Field(default=None, ge=0)
    env: dict[str, str] = Field(default_factory=dict)
    labels: dict[str, str] = Field(default_factory=dict)


class SandboxSummary(BaseModel):
    sandbox_id: str
    sandbox_url: str = ""
    status: SandboxStatus = "Unknown"
    image_id: str = ""
    image: str = ""
    pod_name: str = ""
    service_name: str = ""
    ingress_name: str = ""
    namespace: str = ""
    node_name: str = ""
    pod_ip: str = ""
    created_at: str = ""
    ttl_seconds: int | None = None
    expires_at: str = ""
    expired: bool = False
    labels: dict[str, str] = Field(default_factory=dict)


class SandboxListResponse(BaseModel):
    sandboxes: list[SandboxSummary]
    continue_token: str = ""
    remaining_item_count: int | None = None
    limit: int = 0


class SandboxPoolHealth(BaseModel):
    backend: Literal["kubernetes_api"] = "kubernetes_api"
    namespace: str
    client: str
    enabled: bool
    extra: dict[str, Any] = Field(default_factory=dict)


class SandboxPythonPackage(BaseModel):
    name: str
    version: str


class SandboxPythonProbeResult(BaseModel):
    sandbox_id: str
    sandbox_url: str
    python_version: str = ""
    package_count: int = 0
    packages: list[SandboxPythonPackage] = Field(default_factory=list)
    raw_output: str = ""


class SandboxImageCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    image: str = Field(..., min_length=1, max_length=512)
    digest: str = ""
    description: str = ""
    python_version: str = ""
    capability_manifest: dict[str, Any] = Field(default_factory=dict)


class SandboxImageSummary(BaseModel):
    id: str
    name: str
    image: str
    digest: str = ""
    source: Literal["builtin", "custom"] = "custom"
    status: str = "active"
    description: str = ""
    python_version: str = ""
    capability_manifest: dict[str, Any] = Field(default_factory=dict)
    is_default: bool = False
    created_at: str = ""
    updated_at: str = ""
    preload_status: str = ""
    preload_ready: int = 0
    preload_desired: int = 0
    preload_message: str = ""


class SandboxImageListResponse(BaseModel):
    images: list[SandboxImageSummary]
