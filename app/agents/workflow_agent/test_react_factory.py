from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from langchain_core.language_models.fake_chat_models import (
    FakeMessagesListChatModel,
)
from langchain_core.messages import AIMessage

from deerflow.agents.middlewares.token_usage_middleware import (
    TokenUsageMiddleware,
)
from deerflow.config.summarization_config import (
    ContextSize,
    SummarizationConfig,
)
from deerflow.config.token_usage_config import TokenUsageConfig
from deerflow.config.app_config import CircuitBreakerConfig
from deerflow.config.loop_detection_config import LoopDetectionConfig

from app.agents.workflow_agent.skills import (
    workflow_skills_container_path_from_state,
)
from app.agents.workflow_agent.react_factory import (
    _build_middlewares,
    _create_workflow_summarization_middleware,
    make_workflow_react_agent,
)
from app.agents.workflow_agent.middleware import (
    WorkflowLoopDetectionMiddleware,
)


def _app_config(
    *,
    summarization: SummarizationConfig,
    token_usage: TokenUsageConfig | None = None,
):
    return SimpleNamespace(
        summarization=summarization,
        token_usage=token_usage or TokenUsageConfig(enabled=False),
        circuit_breaker=CircuitBreakerConfig(),
        loop_detection=SimpleNamespace(enabled=False),
        skills=SimpleNamespace(container_path="/mnt/workflow-skills"),
        workflow_agent=SimpleNamespace(
            skills_container_path_template="/workflows/{workflow_id}/skills",
            max_output_tokens=8192,
        ),
    )


class ToolBoundFakeChatModel(FakeMessagesListChatModel):
    def bind_tools(self, tools, *, tool_choice=None, **kwargs):
        return self


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

    def test_workflow_skill_path_uses_workflow_id_from_state(self) -> None:
        app_config = _app_config(
            summarization=SummarizationConfig(enabled=False),
        )

        self.assertEqual(
            workflow_skills_container_path_from_state(
                {
                    "workflowAssistant": {
                        "workflowId": "../workflow 1",
                    }
                },
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

    def test_loop_detection_uses_workflow_event_bridge(self) -> None:
        app_config = _app_config(
            summarization=SummarizationConfig(enabled=False),
        )
        app_config.loop_detection = LoopDetectionConfig(enabled=True)

        middlewares = _build_middlewares(app_config)

        self.assertTrue(
            any(
                isinstance(middleware, WorkflowLoopDetectionMiddleware)
                for middleware in middlewares
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
                "generate_workflow_patch",
                "workflow_ask_clarification",
                "generate_workflow_metadata",
                "request_workflow_sandbox",
                "return_workflow_answer",
                "return_workflow_plan",
                "return_workflow_error",
            },
        )
        self.assertEqual(
            [type(item).__name__ for item in agent_kwargs["middleware"]],
            [
                "ThreadDataMiddleware",
                "WorkflowPrepareMiddleware",
                "DanglingToolCallMiddleware",
                "ToolErrorHandlingMiddleware",
                "TokenUsageMiddleware",
                "WorkflowToolActivityMiddleware",
                "WorkflowOutputMiddleware",
                "WorkflowMetadataMiddleware",
                "WorkflowSandboxMiddleware",
                "WorkflowFinalOutputGuardMiddleware",
                "WorkflowLLMErrorHandlingMiddleware",
                "WorkflowClarificationMiddleware",
            ],
        )
        self.assertNotIn("response_format", agent_kwargs)
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


class WorkflowReactStreamTest(unittest.IsolatedAsyncioTestCase):
    async def test_loop_hard_stop_streams_specific_terminal_notice(self) -> None:
        app_config = _app_config(
            summarization=SummarizationConfig(enabled=False),
        )
        app_config.loop_detection = LoopDetectionConfig(
            enabled=True,
            warn_threshold=2,
            hard_limit=3,
            tool_freq_warn=20,
            tool_freq_hard_limit=30,
        )
        model = ToolBoundFakeChatModel(
            responses=[
                AIMessage(
                    content="",
                    tool_calls=[
                        {
                            "name": "describe_workflow",
                            "id": f"call-read-{index}",
                            "type": "tool_call",
                            "args": {},
                        }
                    ],
                )
                for index in range(3)
            ]
        )
        with (
            patch(
                "app.agents.workflow_agent.react_factory.create_chat_model",
                return_value=model,
            ),
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
        ):
            agent = make_workflow_react_agent({}, app_config=app_config)

        events = [
            event
            async for event in agent.astream(
                {
                    "workflowAssistant": {
                        "threadId": "thread-loop",
                        "message": "检查当前流程",
                        "workflow": {
                            "id": "workflow-1",
                            "name": "测试流程",
                            "nodes": [],
                            "edges": [],
                        },
                    }
                },
                config={"configurable": {"thread_id": "thread-loop"}},
                stream_mode="custom",
            )
        ]
        event_types = [event["type"] for event in events]

        self.assertEqual(event_types.count("workflow.systemNotice"), 2)
        self.assertNotIn("workflow.error", event_types)
        self.assertEqual(
            event_types[-2:],
            ["workflow.systemNotice", "workflow.end"],
        )
        self.assertEqual(events[-2]["code"], "tool_loop_hard_stop")
        self.assertTrue(events[-2]["terminal"])

    async def test_final_tool_events_stream_without_subgraph_mode(self) -> None:
        app_config = _app_config(
            summarization=SummarizationConfig(enabled=False),
        )
        model = ToolBoundFakeChatModel(
            responses=[
                AIMessage(
                    content="",
                    tool_calls=[
                        {
                            "name": "return_workflow_plan",
                            "id": "call-plan",
                            "type": "tool_call",
                            "args": {
                                "summary": "创建测试流程",
                                "mermaid": (
                                    "flowchart TD\n"
                                    "  start[提交订单] --> review[审核订单]"
                                ),
                            },
                        }
                    ],
                )
            ]
        )
        with (
            patch(
                "app.agents.workflow_agent.react_factory.create_chat_model",
                return_value=model,
            ),
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
        ):
            agent = make_workflow_react_agent({}, app_config=app_config)

        events = [
            event
            async for event in agent.astream(
                {
                    "workflowAssistant": {
                        "threadId": "thread-stream",
                        "message": "创建测试流程",
                        "workflow": {
                            "id": "workflow-1",
                            "name": "未命名项目",
                            "nodes": [],
                            "edges": [],
                        },
                    }
                },
                config={"configurable": {"thread_id": "thread-stream"}},
                stream_mode="custom",
            )
        ]

        self.assertEqual(
            [event["type"] for event in events],
            [
                "workflow.session",
                "workflow.message",
                "workflow.toolActivity",
                "workflow.planPreview",
                "workflow.end",
                "workflow.toolActivity",
            ],
        )
        tool_events = [
            event
            for event in events
            if event["type"] == "workflow.toolActivity"
        ]
        self.assertEqual(
            [event["status"] for event in tool_events],
            ["running", "completed"],
        )
        self.assertTrue(
            all(
                event["toolName"] == "return_workflow_plan"
                for event in tool_events
            )
        )
        self.assertTrue(
            all(event["actor"] == "main-agent" for event in tool_events)
        )


if __name__ == "__main__":
    unittest.main()
