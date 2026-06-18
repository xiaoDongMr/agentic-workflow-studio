from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.persistence.workflow_models import WorkflowEdgeRow, WorkflowNodeRow, WorkflowProjectRow, WorkflowVersionRow
from app.schemas.workflow import WorkflowDocument, WorkflowEdge, WorkflowNode

DEFAULT_WORKSPACE_ID = "00000000-0000-0000-0000-000000000000"


@dataclass(slots=True)
class WorkflowProjectSummary:
    id: str
    name: str
    description: str
    status: str
    current_draft_version_id: str | None
    latest_published_version_id: str | None
    node_count: int
    edge_count: int
    updated_at: datetime


@dataclass(slots=True)
class SavedWorkflowDraft:
    project: WorkflowProjectSummary
    workflow: WorkflowDocument


class WorkflowStore:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def list_projects(self, workspace_id: str = DEFAULT_WORKSPACE_ID) -> list[WorkflowProjectSummary]:
        async with self._session_factory() as session:
            result = await session.execute(
                select(WorkflowProjectRow, WorkflowVersionRow)
                .outerjoin(WorkflowVersionRow, WorkflowVersionRow.id == WorkflowProjectRow.current_draft_version_id)
                .where(WorkflowProjectRow.workspace_id == workspace_id, WorkflowProjectRow.deleted_at.is_(None))
                .order_by(WorkflowProjectRow.updated_at.desc())
            )
            return [self._to_summary(project, version) for project, version in result.all()]

    async def get_draft(self, workflow_id: str) -> WorkflowDocument | None:
        async with self._session_factory() as session:
            project = await session.get(WorkflowProjectRow, workflow_id)
            if project is None or project.deleted_at is not None or project.current_draft_version_id is None:
                return None

            version = await session.get(WorkflowVersionRow, project.current_draft_version_id)
            if version is None:
                return None
            return WorkflowDocument.model_validate(version.graph_snapshot)

    async def save_draft(
        self,
        workflow: WorkflowDocument,
        *,
        workspace_id: str = DEFAULT_WORKSPACE_ID,
        actor_id: str | None = None,
    ) -> SavedWorkflowDraft:
        project_id = _normalize_uuid_or_new(workflow.id)
        workflow = workflow.model_copy(update={"id": project_id})
        snapshot = workflow.model_dump(mode="json")

        async with self._session_factory() as session:
            project = await session.get(WorkflowProjectRow, project_id)
            if project is None:
                project = WorkflowProjectRow(
                    id=project_id,
                    workspace_id=workspace_id,
                    name=workflow.name,
                    description=workflow.description,
                    status="draft",
                    created_by=actor_id,
                    updated_by=actor_id,
                )
                session.add(project)
            else:
                project.name = workflow.name
                project.description = workflow.description
                project.status = "draft"
                project.updated_by = actor_id
                project.revision = (project.revision or 0) + 1

            draft_version_id = project.current_draft_version_id or str(uuid4())
            version = await session.get(WorkflowVersionRow, draft_version_id)
            if version is None:
                version = WorkflowVersionRow(
                    id=draft_version_id,
                    workflow_id=project_id,
                    version="draft",
                    state="draft",
                    name=workflow.name,
                    description=workflow.description,
                )
                session.add(version)

            version.name = workflow.name
            version.description = workflow.description
            version.graph_snapshot = snapshot
            version.config = {}
            version.node_count = len(_flatten_nodes(workflow.nodes))
            version.edge_count = len(_flatten_edges(workflow.nodes, workflow.edges))
            version.revision = (version.revision or 0) + 1

            await session.flush()
            project.current_draft_version_id = draft_version_id

            await session.execute(delete(WorkflowNodeRow).where(WorkflowNodeRow.workflow_version_id == draft_version_id))
            await session.execute(delete(WorkflowEdgeRow).where(WorkflowEdgeRow.workflow_version_id == draft_version_id))
            session.add_all(_build_node_rows(draft_version_id, workflow.nodes))
            session.add_all(_build_edge_rows(draft_version_id, workflow.nodes, workflow.edges))

            await session.commit()
            return SavedWorkflowDraft(
                project=self._to_summary(project, version),
                workflow=workflow,
            )

    def _to_summary(self, project: WorkflowProjectRow, version: WorkflowVersionRow | None) -> WorkflowProjectSummary:
        return WorkflowProjectSummary(
            id=project.id,
            name=project.name,
            description=project.description,
            status=project.status,
            current_draft_version_id=project.current_draft_version_id,
            latest_published_version_id=project.latest_published_version_id,
            node_count=version.node_count if version else 0,
            edge_count=version.edge_count if version else 0,
            updated_at=project.updated_at,
        )


def _normalize_uuid_or_new(value: str) -> str:
    try:
        return str(UUID(value))
    except (TypeError, ValueError):
        return str(uuid4())


def _flatten_nodes(nodes: list[WorkflowNode], parent_node_key: str | None = None) -> list[tuple[WorkflowNode, str | None]]:
    result: list[tuple[WorkflowNode, str | None]] = []
    for node in nodes:
        result.append((node, parent_node_key))
        result.extend(_flatten_nodes(node.config.loopBodyNodes, node.id))
    return result


def _flatten_edges(
    nodes: list[WorkflowNode],
    edges: list[WorkflowEdge],
    parent_node_key: str | None = None,
) -> list[tuple[WorkflowEdge, str | None]]:
    result = [(edge, parent_node_key) for edge in edges]
    for node in nodes:
        result.extend(_flatten_edges(node.config.loopBodyNodes, node.config.loopBodyEdges, node.id))
    return result


def _build_node_rows(version_id: str, nodes: list[WorkflowNode]) -> list[WorkflowNodeRow]:
    rows: list[WorkflowNodeRow] = []
    for sort_order, (node, parent_node_key) in enumerate(_flatten_nodes(nodes)):
        rows.append(
            WorkflowNodeRow(
                id=str(uuid4()),
                workflow_version_id=version_id,
                node_key=node.id,
                parent_node_key=parent_node_key,
                type=node.type,
                title=node.title,
                description=node.description,
                position_x=float(node.position.get("x", 0)),
                position_y=float(node.position.get("y", 0)),
                status=node.status,
                inputs=[item.model_dump(mode="json") for item in node.inputs],
                outputs=[item.model_dump(mode="json") for item in node.outputs],
                config=node.config.model_dump(mode="json"),
                sort_order=sort_order,
            )
        )
    return rows


def _build_edge_rows(version_id: str, nodes: list[WorkflowNode], edges: list[WorkflowEdge]) -> list[WorkflowEdgeRow]:
    rows: list[WorkflowEdgeRow] = []
    for sort_order, (edge, parent_node_key) in enumerate(_flatten_edges(nodes, edges)):
        rows.append(
            WorkflowEdgeRow(
                id=str(uuid4()),
                workflow_version_id=version_id,
                edge_key=edge.id or f"{edge.source}-{edge.target}-{sort_order}",
                parent_node_key=parent_node_key,
                source_node_key=edge.source,
                target_node_key=edge.target,
                source_port_id=str(edge.sourcePortID) if edge.sourcePortID is not None else None,
                target_port_id=str(edge.targetPortID) if edge.targetPortID is not None else None,
                edge_metadata={},
                sort_order=sort_order,
            )
        )
    return rows
