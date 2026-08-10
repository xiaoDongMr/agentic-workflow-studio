from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from deerflow.agents.middlewares.token_usage_middleware import (
    TokenUsageMiddleware,
)
from deerflow.config.summarization_config import (
    ContextSize,
    SummarizationConfig,
)
from deerflow.config.token_usage_config import TokenUsageConfig

from app.agents.workflow_agent.skills import (
    workflow_skills_container_path_from_payload,
)
from app.agents.workflow_agent.react_factory import (
    _build_middlewares,
    _create_workflow_summarization_middleware,
    make_workflow_react_agent,
)


def _app_config(
    *,
    summarization: SummarizationConfig,
    token_usage: TokenUsageConfig | None = None,
):
    return SimpleNamespace(
        summarization=summarization,
        token_usage=token_usage or TokenUsageConfig(enabled=False),
        loop_detection=SimpleNamespace(enabled=False),
        skills=SimpleNamespace(container_path="/mnt/workflow-skills"),
        workflow_agent=SimpleNamespace(
            skills_container_path_template="/workflows/{workflow_id}/skills",
            max_output_tokens=8192,
        ),
    )


class WorkflowReactFactoryTest(unittest.TestCase):
    def test_disabled_summarization_does_not_create_model(self) -> None:
        app_config = _app_config(
            summarization=SummarizationConfig(enabled=False),
        )

        with patch(
            "app.agents.workflow_agent.react_factory.create_chat_model",
        ) as create_model:
            middleware = _create_workflow_summarization_middleware(app_config)

        self.assertIsNone(middleware)
        create_model.assert_not_called()

    def test_enabled_summarization_uses_config_and_middleware_tag(self) -> None:
        app_config = _app_config(
            summarization=SummarizationConfig(
                enabled=True,
                model_name="summary-model",
                trigger=[
                    ContextSize(type="messages", value=30),
                    ContextSize(type="tokens", value=8000),
                ],
                keep=ContextSize(type="messages", value=12),
                trim_tokens_to_summarize=3000,
            ),
        )
        model = MagicMock()
        tagged_model = MagicMock()
        middleware = MagicMock()
        model.with_config.return_value = tagged_model

        with (
            patch(
                "app.agents.workflow_agent.react_factory.create_chat_model",
                return_value=model,
            ) as create_model,
            patch(
                "app.agents.workflow_agent.react_factory."
                "DeerFlowSummarizationMiddleware",
                return_value=middleware,
            ) as middleware_class,
        ):
            result = _create_workflow_summarization_middleware(app_config)

        self.assertIs(result, middleware)
        create_model.assert_called_once_with(
            name="summary-model",
            thinking_enabled=False,
            app_config=app_config,
        )
        model.with_config.assert_called_once_with(tags=["middleware:summarize"])
        middleware_kwargs = middleware_class.call_args.kwargs
        self.assertEqual(
            {
                key: value
                for key, value in middleware_kwargs.items()
                if key != "skills_container_path"
            },
            {
                "model": tagged_model,
                "trigger": [("messages", 30), ("tokens", 8000)],
                "keep": ("messages", 12),
                "trim_tokens_to_summarize": 3000,
                "skill_file_read_tool_names": ["read_file", "read", "view", "cat"],
                "before_summarization": [],
                "preserve_recent_skill_count": 5,
                "preserve_recent_skill_tokens": 25000,
                "preserve_recent_skill_tokens_per_skill": 5000,
            },
        )
        self.assertEqual(
            middleware_kwargs["skills_container_path"](
                {
                    "workflowAssistant": {
                        "workflow": {
                            "id": "workflow-1",
                        },
                    },
                },
                None,
            ),
            "/workflows/workflow-1/skills",
        )

    def test_workflow_skill_path_uses_safe_workflow_id(self) -> None:
        app_config = _app_config(
            summarization=SummarizationConfig(enabled=False),
        )

        self.assertEqual(
            workflow_skills_container_path_from_payload(
                {"workflow": {"id": "../workflow 1"}},
                app_config,
            ),
            "/workflows/workflow_1/skills",
        )

    def test_token_usage_middleware_follows_config(self) -> None:
        disabled = _app_config(
            summarization=SummarizationConfig(enabled=False),
            token_usage=TokenUsageConfig(enabled=False),
        )
        enabled = _app_config(
            summarization=SummarizationConfig(enabled=False),
            token_usage=TokenUsageConfig(enabled=True),
        )

        disabled_middlewares = _build_middlewares(disabled)
        enabled_middlewares = _build_middlewares(enabled)

        self.assertFalse(
            any(
                isinstance(middleware, TokenUsageMiddleware)
                for middleware in disabled_middlewares
            )
        )
        self.assertTrue(
            any(
                isinstance(middleware, TokenUsageMiddleware)
                for middleware in enabled_middlewares
            )
        )

    def test_agent_assembly_uses_domain_whitelists_and_output_limit(self) -> None:
        app_config = _app_config(
            summarization=SummarizationConfig(enabled=False),
            token_usage=TokenUsageConfig(enabled=True),
        )
        model = MagicMock()
        compiled_agent = MagicMock()

        with (
            patch(
                "app.agents.workflow_agent.react_factory.create_chat_model",
                return_value=model,
            ) as create_model,
            patch(
                "app.agents.workflow_agent.react_factory."
                "get_enabled_skills_for_config",
                return_value=[],
            ),
            patch(
                "app.agents.workflow_agent.react_factory."
                "get_skills_prompt_section",
                return_value="/mnt/workflow-skills/public/foo/SKILL.md",
            ),
            patch(
                "app.agents.workflow_agent.react_factory."
                "filter_tools_by_skill_allowed_tools",
                side_effect=lambda tools, _skills: tools,
            ),
            patch(
                "app.agents.workflow_agent.react_factory.create_deerflow_agent",
                return_value=compiled_agent,
            ) as create_agent,
        ):
            result = make_workflow_react_agent(
                {
                    "configurable": {
                        "model_name": "workflow-model",
                        "thinking_enabled": False,
                    }
                },
                app_config=app_config,
            )

        self.assertIs(result, compiled_agent)
        create_model.assert_called_once_with(
            name="workflow-model",
            thinking_enabled=False,
            reasoning_effort=None,
            app_config=app_config,
            temperature=0,
            max_tokens=8192,
        )
        agent_kwargs = create_agent.call_args.kwargs
        self.assertEqual(
            {tool.name for tool in agent_kwargs["tools"]},
            {
                "describe_workflow",
                "inspect_workflow_node",
                "build_workflow_patch",
                "validate_workflow_patch",
                "validate_python_node_code",
                "workflow_ask_clarification",
                "generate_workflow_metadata",
                "request_workflow_sandbox",
            },
        )
        self.assertEqual(
            [type(item).__name__ for item in agent_kwargs["middleware"]],
            [
                "ThreadDataMiddleware",
                "DanglingToolCallMiddleware",
                "ToolErrorHandlingMiddleware",
                "TokenUsageMiddleware",
                "WorkflowClarificationMiddleware",
                "WorkflowMetadataMiddleware",
                "WorkflowSandboxMiddleware",
                "LLMErrorHandlingMiddleware",
            ],
        )
        self.assertEqual(agent_kwargs["name"], "workflow-agent")
        self.assertIn(
            "/workflows/{workflow_id}/skills/public/foo/SKILL.md",
            agent_kwargs["system_prompt"],
        )
        self.assertNotIn(
            "/mnt/workflow-skills/public/foo/SKILL.md",
            agent_kwargs["system_prompt"],
        )

    def test_null_output_limit_uses_model_configuration(self) -> None:
        app_config = _app_config(
            summarization=SummarizationConfig(enabled=False),
        )
        app_config.workflow_agent.max_output_tokens = None
        model = MagicMock()

        with (
            patch(
                "app.agents.workflow_agent.react_factory.create_chat_model",
                return_value=model,
            ) as create_model,
            patch(
                "app.agents.workflow_agent.react_factory."
                "get_enabled_skills_for_config",
                return_value=[],
            ),
            patch(
                "app.agents.workflow_agent.react_factory."
                "get_skills_prompt_section",
                return_value="",
            ),
            patch(
                "app.agents.workflow_agent.react_factory."
                "filter_tools_by_skill_allowed_tools",
                side_effect=lambda tools, _skills: tools,
            ),
            patch(
                "app.agents.workflow_agent.react_factory.create_deerflow_agent",
            ),
        ):
            make_workflow_react_agent({}, app_config=app_config)

        self.assertNotIn("max_tokens", create_model.call_args.kwargs)


if __name__ == "__main__":
    unittest.main()
