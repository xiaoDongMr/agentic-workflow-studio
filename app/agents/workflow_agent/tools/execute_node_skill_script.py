from __future__ import annotations

import json
import logging
from collections.abc import Callable
from pathlib import PurePosixPath
from typing import Any

from langchain.tools import tool

from app.agents.workflow_agent.node_skill_registry import BuiltinNodeSkill
from app.agents.workflow_agent.node_skill_runner import NodeSkillScriptRunner

logger = logging.getLogger(__name__)


def make_execute_node_skill_script_tool(
    runner: NodeSkillScriptRunner,
    *,
    skills: list[BuiltinNodeSkill],
    read_node_types: set[str],
    runtime_context: dict[str, Any],
    on_node_result: Callable[[dict[str, Any]], None] | None = None,
    before_execute: Callable[[], None] | None = None,
):
    skills_by_name = {skill.name: skill for skill in skills}
    reusable_results: set[str] = set()

    @tool("execute_node_skill_script", parse_docstring=True)
    async def execute_node_skill_script(
        path: str,
        function_name: str,
        arguments: dict[str, Any],
    ) -> str:
        """Execute an entry function documented by a previously read Node Skill.

        Args:
            path: Skill script path documented in SKILL.md.
            function_name: Async entry function documented in SKILL.md.
            arguments: Named function arguments documented in SKILL.md.
        """
        requested = PurePosixPath(path)
        if (
            requested.is_absolute()
            or ".." in requested.parts
            or len(requested.parts) < 2
        ):
            raise ValueError("path must be <skill-name>/<relative-script-path>")
        skill = skills_by_name.get(requested.parts[0])
        if skill is None:
            raise ValueError(f"Node Skill {requested.parts[0]!r} is not available")
        if skill.node_type not in read_node_types:
            raise ValueError(f"Read {skill.name}/SKILL.md before executing scripts")
        if before_execute is not None:
            before_execute()
        relative_path = str(PurePosixPath(*requested.parts[1:]))
        reusable_key = json.dumps(
            {
                "nodeType": skill.node_type,
                "path": relative_path,
                "function": function_name,
                "arguments": arguments,
            },
            ensure_ascii=False,
            sort_keys=True,
            default=str,
        )
        if (
            function_name in {"list_models", "resolve_model_config"}
            and reusable_key in reusable_results
        ):
            return json.dumps(
                {
                    "reused": True,
                    "instruction": (
                        "Reuse the previous result for this identical "
                        f"{function_name} request."
                    ),
                },
                ensure_ascii=False,
            )
        logger.info(
            "execute_node_skill_script start: skill=%s node_type=%s path=%s function=%s arg_keys=%s",
            skill.name,
            skill.node_type,
            relative_path,
            function_name,
            sorted(arguments.keys()),
        )
        result = await runner.run(
            node_type=skill.node_type,
            relative_path=relative_path,
            entry_function=function_name,
            arguments=arguments,
            runtime_context=runtime_context,
        )
        logger.info(
            "execute_node_skill_script done: skill=%s function=%s result_keys=%s has_node=%s",
            skill.name,
            function_name,
            sorted(result.keys()),
            isinstance(result.get("node"), dict),
        )
        node = result.get("node")
        if isinstance(node, dict):
            if on_node_result is not None:
                on_node_result(node)
            return json.dumps(
                {
                    "nodeId": node.get("id"),
                    "nodeType": node.get("type"),
                    "cached": True,
                },
                ensure_ascii=False,
            )
        if function_name in {"list_models", "resolve_model_config"}:
            reusable_results.add(reusable_key)
        return json.dumps(result, ensure_ascii=False)

    return execute_node_skill_script
