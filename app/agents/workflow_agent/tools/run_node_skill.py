from __future__ import annotations

import re
from typing import Any

from langchain.tools import tool

from app.agents.workflow_agent.skills import (
    workflow_skills_container_path_from_payload,
)
from app.agents.workflow_agent.tools.output import (
    bounded_tool_json,
    workflow_tool_output_limit,
)
from app.workflow.services.code_execution import execute_sandbox_file
from deerflow.config.app_config import get_app_config
from deerflow.sandbox.tools import ensure_sandbox_initialized
from deerflow.skills.storage import get_or_new_skill_storage
from deerflow.tools.types import Runtime


_SCRIPT_NAME = re.compile(r"^[a-zA-Z0-9_-]+\.py$")


@tool("run_node_skill", parse_docstring=True)
def run_node_skill_tool(
    runtime: Runtime,
    skill_name: str,
    script_name: str,
    payload: dict[str, Any],
) -> str:
    """Run a workflow node-mapping Skill script in the current sandbox.

    The script must live under ``scripts/`` and expose
    ``async def main(args: Args) -> Output``.

    Args:
        skill_name: Enabled Skill name containing the node mapping script.
        script_name: Python filename under the Skill's scripts directory.
        payload: Structured node intent and workflow context for the script.
    """
    if not _SCRIPT_NAME.fullmatch(script_name):
        raise ValueError("script_name must be a Python filename without path segments")

    app_config = runtime.context.get("app_config") if runtime.context else None
    if app_config is None:
        app_config = get_app_config()
    storage_kwargs = {"app_config": app_config} if app_config is not None else {}
    skills = get_or_new_skill_storage(**storage_kwargs).load_skills(enabled_only=True)
    skill = next((item for item in skills if item.name == skill_name), None)
    if skill is None:
        raise ValueError(f"Enabled workflow Skill not found: {skill_name}")

    host_script = (skill.skill_dir / "scripts" / script_name).resolve()
    scripts_root = (skill.skill_dir / "scripts").resolve()
    try:
        host_script.relative_to(scripts_root)
    except ValueError as exc:
        raise ValueError("Skill script must stay within the scripts directory") from exc
    if not host_script.is_file():
        raise FileNotFoundError(f"Workflow Skill script not found: {script_name}")

    sandbox = ensure_sandbox_initialized(runtime)
    container_base_path = (
        workflow_skills_container_path_from_payload(payload, app_config)
        or app_config.skills.container_path
    )
    container_script = (
        f"{skill.get_container_path(container_base_path)}/scripts/{script_name}"
    )
    result = execute_sandbox_file(
        sandbox=sandbox,
        file_path=container_script,
        entry_function="main",
        node_input=payload,
    )
    if not isinstance(result, dict):
        raise ValueError("Workflow Skill script must return an object")
    return bounded_tool_json(
        result,
        max_chars=workflow_tool_output_limit(runtime),
    )
