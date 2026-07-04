from __future__ import annotations

import keyword
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
