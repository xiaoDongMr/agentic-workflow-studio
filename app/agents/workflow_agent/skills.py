from __future__ import annotations

import re
from typing import Any

from deerflow.config.app_config import AppConfig


_UNSAFE_PATH_SEGMENT = re.compile(r"[^A-Za-z0-9_.-]+")


def workflow_skills_container_path(
    workflow_id: str,
    app_config: AppConfig,
) -> str:
    safe_workflow_id = _safe_path_segment(workflow_id)
    template = app_config.workflow_agent.skills_container_path_template
    return template.format(workflow_id=safe_workflow_id).rstrip("/")


def workflow_skills_container_path_from_state(
    state: dict[str, Any],
    app_config: AppConfig,
) -> str | None:
    workflow_id = workflow_id_from_state(state)
    if not workflow_id:
        return None
    return workflow_skills_container_path(workflow_id, app_config)


def workflow_id_from_state(state: dict[str, Any]) -> str | None:
    request = state.get("workflowAssistant")
    task = state.get("workflowTask")
    return _first_string(
        _nested(request, "workflowId"),
        _nested(request, "workflow", "id"),
        _nested(task, "workflowSummary", "id"),
        _nested(task, "workflow", "id"),
    )


def _nested(value: Any, *keys: str) -> Any:
    current = value
    for key in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def _first_string(*values: Any) -> str | None:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _safe_path_segment(value: str) -> str:
    normalized = _UNSAFE_PATH_SEGMENT.sub("_", value.strip()).strip("._-")
    if not normalized:
        raise ValueError("workflow_id cannot be converted to a safe path segment")
    return normalized
