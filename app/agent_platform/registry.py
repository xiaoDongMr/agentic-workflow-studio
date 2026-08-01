from __future__ import annotations

import re

from app.agent_platform.builtins import (
    BUILTIN_AGENT_DEFINITIONS,
    LEAD_AGENT_DEFINITION,
)
from app.agent_platform.definition import AgentDefinition


_VALID_AGENT_ID = re.compile(r"^[a-z0-9_-]+$")


def normalize_agent_id(agent_id: str) -> str:
    normalized = agent_id.strip().lower()
    if not normalized or not _VALID_AGENT_ID.fullmatch(normalized):
        raise ValueError(
            f"Invalid assistant_id {agent_id!r}: use letters, digits, hyphens, or underscores."
        )
    return normalized


class AgentRegistry:
    def __init__(
        self,
        definitions: tuple[AgentDefinition, ...] = BUILTIN_AGENT_DEFINITIONS,
    ):
        self._definitions: dict[str, AgentDefinition] = {}
        for definition in definitions:
            self.register(definition)

    def register(self, definition: AgentDefinition) -> None:
        normalized = normalize_agent_id(definition.id)
        self._definitions[normalized] = definition
        self._definitions[normalized.replace("_", "-")] = definition
        self._definitions[normalized.replace("-", "_")] = definition

    def resolve(self, assistant_id: str | None) -> AgentDefinition:
        normalized = normalize_agent_id(assistant_id or LEAD_AGENT_DEFINITION.id)
        definition = self._definitions.get(normalized)
        if definition is not None:
            if not definition.enabled:
                raise ValueError(f"Agent {assistant_id!r} is disabled.")
            return definition

        # Preserve the existing custom-agent behavior: unknown valid IDs use
        # the lead runtime and are loaded through config.agent_name.
        return LEAD_AGENT_DEFINITION.model_copy(
            update={
                "id": normalized.replace("_", "-"),
                "name": normalized,
                "builtin": False,
                "metadata": {"agent_name": normalized.replace("_", "-")},
            }
        )

    def is_builtin(self, assistant_id: str | None) -> bool:
        return self.resolve(assistant_id).builtin


_registry = AgentRegistry()


def get_agent_registry() -> AgentRegistry:
    return _registry
