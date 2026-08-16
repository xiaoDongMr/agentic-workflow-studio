from __future__ import annotations

import json
import logging
from collections.abc import Awaitable, Callable
from pathlib import PurePosixPath
from typing import Any

from langchain.tools import tool

from app.agents.workflow_agent.node_skill_registry import (
    BuiltinNodeSkill,
    NodeSkillRegistry,
)

logger = logging.getLogger(__name__)


def make_read_node_skill_file_tool(
    registry: NodeSkillRegistry,
    *,
    loaded_skills: list[BuiltinNodeSkill],
    on_read: Callable[
        [str, str],
        Awaitable[dict[str, Any] | None],
    ]
    | None = None,
):
    loaded_by_name = {skill.name: skill for skill in loaded_skills}
    read_paths: set[tuple[str, str]] = set()

    @tool("read_file", parse_docstring=True)
    async def read_file(path: str) -> str:
        """Read a text file from an available workflow Node Skill.

        Args:
            path: Skill-relative path provided by the available Skill catalog.
        """
        requested = PurePosixPath(path)
        if requested.is_absolute() or ".." in requested.parts or len(requested.parts) < 2:
            raise ValueError("path must be <skill-name>/<relative-file>")
        skill = loaded_by_name.get(requested.parts[0])
        if skill is None:
            raise ValueError(f"Node Skill {requested.parts[0]!r} is not available")
        relative_path = str(PurePosixPath(*requested.parts[1:]))
        logger.info(
            "workflow node skill read_file: skill=%s node_type=%s path=%s",
            skill.name,
            skill.node_type,
            relative_path,
        )
        read_key = (skill.node_type, relative_path)
        if read_key in read_paths:
            return (
                f"{path} was already loaded in this run. "
                "Reuse the previously returned Skill contract."
            )
        content = registry.resolve_file(
            skill.node_type,
            relative_path,
        ).read_text(encoding="utf-8")
        read_paths.add(read_key)
        if on_read is not None:
            runtime_context = await on_read(skill.node_type, relative_path)
            if runtime_context:
                content += (
                    "\n\n## Runtime Context\n\n"
                    + json.dumps(runtime_context, ensure_ascii=False)
                )
        return content

    return read_file
