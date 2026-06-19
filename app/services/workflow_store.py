from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
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
    preview: dict


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
            rows = result.all()
            version_ids = [version.id for _, version in rows if version is not None]
            previews = await self._load_project_previews(session, version_ids)
            return [self._to_summary(project, version, previews.get(version.id) if version else None) for project, version in rows]

    async def get_draft(self, workflow_id: str) -> WorkflowDocument | None:
        async with self._session_factory() as session:
            project = await session.get(WorkflowProjectRow, workflow_id)
            if project is None or project.deleted_at is not None or project.current_draft_version_id is None:
                return None

            version = await session.get(WorkflowVersionRow, project.current_draft_version_id)
            if version is None:
                return None
            return WorkflowDocument.model_validate(version.graph_snapshot)

    async def update_project_metadata(
        self,
        workflow_id: str,
        *,
        name: str,
        description: str,
        workspace_id: str = DEFAULT_WORKSPACE_ID,
        actor_id: str | None = None,
    ) -> WorkflowProjectSummary | None:
        next_name = name.strip() or "未命名项目"
        next_description = description.strip()

        async with self._session_factory() as session:
            result = await session.execute(
                select(WorkflowProjectRow, WorkflowVersionRow)
                .outerjoin(WorkflowVersionRow, WorkflowVersionRow.id == WorkflowProjectRow.current_draft_version_id)
                .where(
                    WorkflowProjectRow.id == workflow_id,
                    WorkflowProjectRow.workspace_id == workspace_id,
                    WorkflowProjectRow.deleted_at.is_(None),
                )
            )
            row = result.one_or_none()
            if row is None:
                return None

            project, version = row
            project.name = next_name
            project.description = next_description
            project.updated_by = actor_id
            project.revision = (project.revision or 0) + 1

            if version is not None:
                version.name = next_name
                version.description = next_description
                if version.graph_snapshot:
                    workflow = WorkflowDocument.model_validate(version.graph_snapshot)
                    version.graph_snapshot = workflow.model_copy(
                        update={"name": next_name, "description": next_description}
                    ).model_dump(mode="json")
                version.revision = (version.revision or 0) + 1

            await session.commit()
            return self._to_summary(project, version)

    async def delete_project(self, workflow_id: str, *, workspace_id: str = DEFAULT_WORKSPACE_ID) -> bool:
        async with self._session_factory() as session:
            project = await session.get(WorkflowProjectRow, workflow_id)
            if project is None or project.workspace_id != workspace_id or project.deleted_at is not None:
                return False

            project.deleted_at = datetime.now(UTC)
            project.revision = (project.revision or 0) + 1
            await session.commit()
            return True

    async def duplicate_project(
        self,
        workflow_id: str,
        *,
        name: str | None = None,
        workspace_id: str = DEFAULT_WORKSPACE_ID,
    ) -> SavedWorkflowDraft | None:
        workflow = await self.get_draft(workflow_id)
        if workflow is None:
            return None

        duplicate_name = name.strip() if name else f"{workflow.name or '未命名项目'} 副本"
        duplicated = workflow.model_copy(
            update={
                "id": str(uuid4()),
                "name": duplicate_name or "未命名项目 副本",
                "description": workflow.description,
            }
        )
        return await self.save_draft(duplicated, workspace_id=workspace_id)

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

    async def _load_project_previews(self, session: AsyncSession, version_ids: list[str]) -> dict[str, dict]:
        if not version_ids:
            return {}

        node_result = await session.execute(
            select(WorkflowNodeRow)
            .where(WorkflowNodeRow.workflow_version_id.in_(version_ids), WorkflowNodeRow.parent_node_key.is_(None))
            .order_by(WorkflowNodeRow.workflow_version_id, WorkflowNodeRow.sort_order)
        )
        nodes_by_version: dict[str, list[WorkflowNodeRow]] = defaultdict(list)
        for node in node_result.scalars():
            if len(nodes_by_version[node.workflow_version_id]) < 8:
                nodes_by_version[node.workflow_version_id].append(node)

        edge_result = await session.execute(
            select(WorkflowEdgeRow)
            .where(WorkflowEdgeRow.workflow_version_id.in_(version_ids), WorkflowEdgeRow.parent_node_key.is_(None))
            .order_by(WorkflowEdgeRow.workflow_version_id, WorkflowEdgeRow.sort_order)
        )
        edges_by_version: dict[str, list[WorkflowEdgeRow]] = defaultdict(list)
        for edge in edge_result.scalars():
            if len(edges_by_version[edge.workflow_version_id]) < 24:
                edges_by_version[edge.workflow_version_id].append(edge)

        return {
            version_id: _build_project_preview_from_rows(nodes_by_version[version_id], edges_by_version[version_id])
            for version_id in version_ids
        }

    def _to_summary(
        self,
        project: WorkflowProjectRow,
        version: WorkflowVersionRow | None,
        preview: dict | None = None,
    ) -> WorkflowProjectSummary:
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
            preview=preview if preview is not None else _build_project_preview(version),
        )


def _normalize_uuid_or_new(value: str) -> str:
    try:
        return str(UUID(value))
    except (TypeError, ValueError):
        return str(uuid4())


def _build_project_preview(version: WorkflowVersionRow | None) -> dict:
    if version is None or not version.graph_snapshot:
        return {"nodes": [], "edges": []}

    try:
        workflow = WorkflowDocument.model_validate(version.graph_snapshot)
    except Exception:
        return {"nodes": [], "edges": []}

    nodes = [
        {
            "id": node.id,
            "title": node.title,
            "type": node.type,
            "position": node.position,
        }
        for node in workflow.nodes[:8]
    ]
    preview_node_ids = {node["id"] for node in nodes}
    edges = [
        {
            "id": edge.id,
            "source": edge.source,
            "target": edge.target,
        }
        for edge in workflow.edges
        if edge.source in preview_node_ids and edge.target in preview_node_ids
    ][:12]
    return {"nodes": nodes, "edges": edges}


def _build_project_preview_from_rows(nodes: list[WorkflowNodeRow], edges: list[WorkflowEdgeRow]) -> dict:
    preview_nodes = [
        {
            "id": node.node_key,
            "title": node.title,
            "type": node.type,
            "position": {"x": node.position_x, "y": node.position_y},
        }
        for node in nodes
    ]
    preview_node_ids = {node["id"] for node in preview_nodes}
    preview_edges = [
        {
            "id": edge.edge_key,
            "source": edge.source_node_key,
            "target": edge.target_node_key,
        }
        for edge in edges
        if edge.source_node_key in preview_node_ids and edge.target_node_key in preview_node_ids
    ][:12]
    return {"nodes": preview_nodes, "edges": preview_edges}


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
