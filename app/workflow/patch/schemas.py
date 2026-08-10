from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas.workflow import WorkflowDocument, WorkflowEdge, WorkflowNode


class AddNodeOperation(BaseModel):
    op: Literal["add_node"]
    node: WorkflowNode


class UpdateNodeOperation(BaseModel):
    op: Literal["update_node"]
    nodeId: str
    partial: dict[str, Any]


class DeleteNodeOperation(BaseModel):
    op: Literal["delete_node"]
    nodeId: str


class AddEdgeOperation(BaseModel):
    op: Literal["add_edge"]
    edge: WorkflowEdge


class DeleteEdgeOperation(BaseModel):
    op: Literal["delete_edge"]
    edgeId: str


class UpdateWorkflowMetadataOperation(BaseModel):
    op: Literal["update_metadata"]
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def require_change(self) -> "UpdateWorkflowMetadataOperation":
        if self.name is None and self.description is None:
            raise ValueError("update_metadata requires name or description")
        return self


class ReplaceWorkflowOperation(BaseModel):
    op: Literal["replace_workflow"]
    workflow: WorkflowDocument


WorkflowPatchOperation = Annotated[
    AddNodeOperation
    | UpdateNodeOperation
    | DeleteNodeOperation
    | AddEdgeOperation
    | DeleteEdgeOperation
    | UpdateWorkflowMetadataOperation
    | ReplaceWorkflowOperation,
    Field(discriminator="op"),
]


class WorkflowPatch(BaseModel):
    operations: list[WorkflowPatchOperation] = Field(default_factory=list)
