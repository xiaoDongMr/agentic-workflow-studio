from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


WorkflowSandboxCodeStatus = Literal["saved", "dirty", "saving", "failed"]


class WorkflowSandboxSession(BaseModel):
    id: str
    workflowId: str
    sandboxId: str = ""
    sandboxUrl: str = ""
    imageId: str = ""
    codeStatus: WorkflowSandboxCodeStatus = "saved"
    lastSavedCodeSignature: str = ""
    createdAt: str
    updatedAt: str


class WorkflowSandboxSessionUpdateRequest(BaseModel):
    sandboxId: str = Field(default="", max_length=128)
    sandboxUrl: str = Field(default="", max_length=512)
    imageId: str = Field(default="", max_length=64)
    codeStatus: WorkflowSandboxCodeStatus | None = None

    @model_validator(mode="after")
    def trim_values(self) -> "WorkflowSandboxSessionUpdateRequest":
        self.sandboxId = self.sandboxId.strip()
        self.sandboxUrl = self.sandboxUrl.strip()
        self.imageId = self.imageId.strip()
        return self
