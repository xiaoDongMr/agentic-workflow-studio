from __future__ import annotations

import importlib
import inspect
from collections.abc import Callable
from typing import Any

from langchain_core.runnables import RunnableConfig

from app.agent_platform.definition import AgentDefinition
from deerflow.config.app_config import AppConfig


def _resolve_factory(path: str) -> Callable[..., Any]:
    module_name, separator, attribute = path.partition(":")
    if not separator or not module_name or not attribute:
        raise ValueError(f"Invalid agent runtime factory path: {path!r}")
    module = importlib.import_module(module_name)
    factory = getattr(module, attribute, None)
    if not callable(factory):
        raise ValueError(f"Agent runtime factory is not callable: {path!r}")
    return factory


class AgentRuntimeFactory:
    def create_factory(
        self,
        definition: AgentDefinition,
    ) -> Callable[..., Any]:
        resolved_factory = _resolve_factory(definition.runtime.factory)
        accepts_app_config = "app_config" in inspect.signature(resolved_factory).parameters

        def factory(
            config: RunnableConfig,
            *,
            app_config: AppConfig | None = None,
        ):
            runtime_config = dict(config)
            context = dict(runtime_config.get("context", {}) or {})
            context["agent_definition"] = definition.model_dump(mode="json")
            if definition.model.name is not None:
                context.setdefault("model_name", definition.model.name)
            if definition.model.thinking_enabled is not None:
                context.setdefault(
                    "thinking_enabled",
                    definition.model.thinking_enabled,
                )
            if definition.model.reasoning_effort is not None:
                context.setdefault(
                    "reasoning_effort",
                    definition.model.reasoning_effort,
                )
            runtime_config["context"] = context
            bound_config = RunnableConfig(**runtime_config)

            if accepts_app_config:
                return resolved_factory(
                    config=bound_config,
                    app_config=app_config,
                )
            return resolved_factory(config=bound_config)

        return factory
