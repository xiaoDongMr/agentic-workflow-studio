from __future__ import annotations

import importlib.util
import inspect
import logging
import re
from typing import Any

from app.agents.workflow_agent.node_skill_registry import NodeSkillRegistry

_FUNCTION_NAME = re.compile(r"^[a-z][a-z0-9_]*$")
logger = logging.getLogger(__name__)


class NodeSkillScriptRunner:
    def __init__(self, registry: NodeSkillRegistry | None = None) -> None:
        self._registry = registry or NodeSkillRegistry()

    async def run(
        self,
        *,
        node_type: str,
        relative_path: str,
        entry_function: str,
        arguments: dict[str, Any],
        runtime_context: dict[str, Any],
    ) -> dict[str, Any]:
        if not _FUNCTION_NAME.fullmatch(entry_function):
            raise ValueError("entry_function must be a valid public function name")
        script_path = self._registry.resolve_script(node_type, relative_path)
        logger.info(
            "node skill runner loading: node_type=%s path=%s function=%s arg_keys=%s",
            node_type,
            relative_path,
            entry_function,
            sorted(arguments.keys()),
        )
        module_name = f"workflow_node_skill_{node_type}_{entry_function}"
        spec = importlib.util.spec_from_file_location(module_name, script_path)
        if spec is None or spec.loader is None:
            raise RuntimeError(f"unable to load Node Skill script: {script_path}")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        entry = getattr(module, entry_function, None)
        if entry is None or not inspect.iscoroutinefunction(entry):
            raise ValueError(
                f"Node Skill entry must be async: "
                f"{relative_path}:{entry_function}"
            )
        kwargs = dict(arguments)
        if "runtime" in inspect.signature(entry).parameters:
            kwargs["runtime"] = runtime_context
        try:
            inspect.signature(entry).bind(**kwargs)
        except TypeError as exc:
            raise ValueError(
                f"Invalid arguments for {relative_path}:{entry_function}: {exc}"
            ) from exc
        result = await entry(**kwargs)
        if not isinstance(result, dict):
            raise ValueError("Node Skill script must return an object")
        logger.info(
            "node skill runner completed: node_type=%s function=%s result_keys=%s",
            node_type,
            entry_function,
            sorted(result.keys()),
        )
        return result
