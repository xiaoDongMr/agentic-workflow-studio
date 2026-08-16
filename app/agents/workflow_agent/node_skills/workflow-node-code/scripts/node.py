from __future__ import annotations

from typing import Any

from app.agents.workflow_agent.node_skill_scripts import (
    build_node as build_node_data,
)
from app.agents.workflow_agent.node_skill_scripts import (
    list_input_sources as list_input_source_data,
)
from app.agents.workflow_agent.node_skill_scripts import (
    update_node as update_node_data,
)
from app.agents.workflow_agent.node_skill_scripts import (
    validate_node_io,
)


async def list_input_sources(
    runtime: dict[str, Any],
    node_id: str = "",
    upstream_node_ids: list[str] | None = None,
) -> dict[str, Any]:
    return list_input_source_data(
        runtime,
        node_id=node_id,
        upstream_node_ids=upstream_node_ids,
    )


async def build_node(
    data: dict[str, Any],
    runtime: dict[str, Any],
    upstream_node_ids: list[str] | None = None,
) -> dict[str, Any]:
    result = build_node_data("code", data, runtime)
    validate_node_io(
        result["node"],
        runtime,
        upstream_node_ids=upstream_node_ids,
    )
    return result


async def update_node(
    node_id: str,
    changes: dict[str, Any],
    runtime: dict[str, Any],
) -> dict[str, Any]:
    result = update_node_data("code", node_id, changes, runtime)
    validate_node_io(result["node"], runtime, node_id=node_id)
    return result
