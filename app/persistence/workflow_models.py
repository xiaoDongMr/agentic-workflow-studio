from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from deerflow.persistence.base import Base


def utc_now() -> datetime:
    return datetime.now(UTC)


class WorkflowProjectRow(Base):
    __tablename__ = "workflow_projects"

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(32), default="draft")
    current_draft_version_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False))
    latest_published_version_id: Mapped[str | None] = mapped_column(Uuid(as_uuid=False))
    created_by: Mapped[str | None] = mapped_column(Uuid(as_uuid=False))
    updated_by: Mapped[str | None] = mapped_column(Uuid(as_uuid=False))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revision: Mapped[int] = mapped_column(default=1)

    __table_args__ = (
        Index("idx_workflow_projects_workspace_status", "workspace_id", "status", "updated_at"),
        Index("idx_workflow_projects_name", "workspace_id", "name"),
    )


class WorkflowVersionRow(Base):
    __tablename__ = "workflow_versions"

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True)
    workflow_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("workflow_projects.id"), nullable=False)
    version: Mapped[str] = mapped_column(String(32), nullable=False)
    state: Mapped[str] = mapped_column(String(32), default="draft")
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    graph_snapshot: Mapped[dict] = mapped_column(JSON, default=dict)
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    node_count: Mapped[int] = mapped_column(Integer, default=0)
    edge_count: Mapped[int] = mapped_column(Integer, default=0)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_by: Mapped[str | None] = mapped_column(Uuid(as_uuid=False))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)
    revision: Mapped[int] = mapped_column(default=1)

    __table_args__ = (
        UniqueConstraint("workflow_id", "version", name="uq_workflow_versions_workflow_version"),
        Index("idx_workflow_versions_workflow_state", "workflow_id", "state", "updated_at"),
    )


class WorkflowNodeRow(Base):
    __tablename__ = "workflow_nodes"

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True)
    workflow_version_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("workflow_versions.id", ondelete="CASCADE"), nullable=False)
    node_key: Mapped[str] = mapped_column(String(128), nullable=False)
    parent_node_key: Mapped[str | None] = mapped_column(String(128))
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    position_x: Mapped[float] = mapped_column(Float, default=0)
    position_y: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(32), default="idle")
    inputs: Mapped[list] = mapped_column(JSON, default=list)
    outputs: Mapped[list] = mapped_column(JSON, default=list)
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    __table_args__ = (
        UniqueConstraint("workflow_version_id", "node_key", name="uq_workflow_nodes_version_node"),
        Index("idx_workflow_nodes_version_type", "workflow_version_id", "type"),
        Index("idx_workflow_nodes_parent", "workflow_version_id", "parent_node_key"),
    )


class WorkflowEdgeRow(Base):
    __tablename__ = "workflow_edges"

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True)
    workflow_version_id: Mapped[str] = mapped_column(Uuid(as_uuid=False), ForeignKey("workflow_versions.id", ondelete="CASCADE"), nullable=False)
    edge_key: Mapped[str] = mapped_column(String(128), nullable=False)
    parent_node_key: Mapped[str | None] = mapped_column(String(128))
    source_node_key: Mapped[str] = mapped_column(String(128), nullable=False)
    target_node_key: Mapped[str] = mapped_column(String(128), nullable=False)
    source_port_id: Mapped[str | None] = mapped_column(String(128))
    target_port_id: Mapped[str | None] = mapped_column(String(128))
    condition_key: Mapped[str | None] = mapped_column(String(128))
    edge_metadata: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    __table_args__ = (
        UniqueConstraint("workflow_version_id", "edge_key", name="uq_workflow_edges_version_edge"),
        Index("idx_workflow_edges_version_source", "workflow_version_id", "source_node_key"),
        Index("idx_workflow_edges_version_target", "workflow_version_id", "target_node_key"),
        Index("idx_workflow_edges_parent", "workflow_version_id", "parent_node_key"),
    )


class SandboxImageRow(Base):
    __tablename__ = "sandbox_images"

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    image: Mapped[str] = mapped_column(String(512), nullable=False)
    digest: Mapped[str] = mapped_column(String(256), default="")
    source: Mapped[str] = mapped_column(String(32), default="custom")
    status: Mapped[str] = mapped_column(String(32), default="active")
    description: Mapped[str] = mapped_column(Text, default="")
    python_version: Mapped[str] = mapped_column(String(64), default="")
    capability_manifest: Mapped[dict] = mapped_column(JSON, default=dict)
    is_default: Mapped[bool] = mapped_column(default=False)
    created_by: Mapped[str | None] = mapped_column(Uuid(as_uuid=False))
    updated_by: Mapped[str | None] = mapped_column(Uuid(as_uuid=False))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint("image", name="uq_sandbox_images_image"),
        Index("idx_sandbox_images_source_status", "source", "status", "updated_at"),
        Index("idx_sandbox_images_name", "name"),
    )
