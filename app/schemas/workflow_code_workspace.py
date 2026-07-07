from __future__ import annotations

import keyword
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class WorkflowCodeWorkspaceRequest(BaseModel):
    entryFunction: str = Field(default="main", max_length=128)
    codeCapability: Literal["python", "browser"] = "python"

    @field_validator("entryFunction")
    @classmethod
    def normalize_entry_function(cls, value: str) -> str:
        normalized = value.strip() or "main"
        if not normalized.isidentifier() or keyword.iskeyword(normalized):
            raise ValueError("entryFunction must be a valid Python function name")
        return normalized


class WorkflowCodeWorkspace(BaseModel):
    workflowId: str
    nodeId: str
    sandboxId: str
    sandboxUrl: str
    folderPath: str
    entryFilePath: str
    codeUrl: str
    created: bool = False


class WorkflowCodeWorkspaceStatus(BaseModel):
    nodeId: str
    packageId: str = ""
    workspaceHash: str = ""
    fileCount: int = 0
    totalSize: int = 0
    savedAt: datetime | None = None


class WorkflowCodeWorkspaceSaveRequest(BaseModel):
    codeCapability: Literal["python", "browser"] = "python"
    entryFile: str = Field(default="main.py", max_length=128)


class WorkflowCodeWorkspaceSaveResult(BaseModel):
    nodeId: str
    status: Literal["saved", "skipped", "failed"]
    packageId: str = ""
    workspaceHash: str = ""
    fileCount: int = 0
    totalSize: int = 0
    packageUri: str = ""
    message: str = ""


class WorkflowCodeWorkspaceRestoreRequest(BaseModel):
    codeCapability: Literal["python", "browser"] = "python"


class WorkflowCodeWorkspaceRestoreResult(BaseModel):
    nodeId: str
    packageId: str = ""
    restored: bool = False
    message: str = ""


class WorkflowCodePackageSummary(BaseModel):
    id: str
    nodeId: str
    codeCapability: str = "python"
    entryFile: str = "main.py"
    packageName: str = ""
    packageHash: str = ""
    workspaceHash: str = ""
    fileCount: int = 0
    totalSize: int = 0
    sourceSandboxId: str = ""
    saveReason: str = "workflow_save"
    createdAt: datetime


class WorkflowCodePackagePage(BaseModel):
    items: list[WorkflowCodePackageSummary] = Field(default_factory=list)
