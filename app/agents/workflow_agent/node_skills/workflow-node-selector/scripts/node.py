from __future__ import annotations

from typing import Any

from app.agents.workflow_agent.node_skill_scripts import (
    build_node as build_node_data,
)
from app.agents.workflow_agent.node_skill_scripts import (
    update_node as update_node_data,
)


async def build_node(
    data: dict[str, Any],
    runtime: dict[str, Any],
) -> dict[str, Any]:
    return build_node_data("selector", data, runtime)


async def update_node(
    node_id: str,
    changes: dict[str, Any],
    runtime: dict[str, Any],
) -> dict[str, Any]:
    return update_node_data("selector", node_id, changes, runtime)
