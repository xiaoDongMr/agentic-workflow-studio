from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field

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


class ReplaceWorkflowOperation(BaseModel):
    op: Literal["replace_workflow"]
    workflow: WorkflowDocument


WorkflowPatchOperation = Annotated[
    AddNodeOperation
    | UpdateNodeOperation
    | DeleteNodeOperation
    | AddEdgeOperation
    | DeleteEdgeOperation
    | ReplaceWorkflowOperation,
    Field(discriminator="op"),
]


class WorkflowPatch(BaseModel):
    operations: list[WorkflowPatchOperation] = Field(default_factory=list)
