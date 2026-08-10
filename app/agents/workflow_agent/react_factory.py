from __future__ import annotations

from langchain.agents.middleware import AgentMiddleware
from langchain.agents.structured_output import ToolStrategy
from langchain_core.runnables import RunnableConfig

from app.agents.workflow_agent.middleware import (
    WorkflowClarificationMiddleware,
    WorkflowMetadataMiddleware,
    WorkflowSandboxMiddleware,
)
from app.agents.workflow_agent.prompt import WORKFLOW_REACT_SYSTEM_PROMPT
from app.agents.workflow_agent.schemas import WorkflowReactDecision
from app.agents.workflow_agent.skills import (
    workflow_skills_container_path_from_state,
)
from app.agents.workflow_agent.state import WorkflowAgentState
from app.agents.workflow_agent.tools import WORKFLOW_AGENT_TOOLS
from deerflow.agents.factory import create_deerflow_agent
from deerflow.agents.lead_agent.prompt import (
    get_enabled_skills_for_config,
    get_skills_prompt_section,
)
from deerflow.agents.middlewares.dangling_tool_call_middleware import (
    DanglingToolCallMiddleware,
)
from deerflow.agents.middlewares.llm_error_handling_middleware import (
    LLMErrorHandlingMiddleware,
)
from deerflow.agents.middlewares.loop_detection_middleware import (
    LoopDetectionMiddleware,
)
from deerflow.agents.middlewares.summarization_middleware import (
    DeerFlowSummarizationMiddleware,
)
from deerflow.agents.middlewares.token_usage_middleware import (
    TokenUsageMiddleware,
)
from deerflow.agents.middlewares.tool_error_handling_middleware import (
    ToolErrorHandlingMiddleware,
)
from deerflow.agents.middlewares.thread_data_middleware import ThreadDataMiddleware
from deerflow.config.app_config import AppConfig, get_app_config
from deerflow.models import create_chat_model
from deerflow.skills.tool_policy import filter_tools_by_skill_allowed_tools


WORKFLOW_SKILL_NAMES = {"workflow-canvas", "workflow-node-mapping"}
WORKFLOW_CONTROL_TOOL_NAMES = {
    "workflow_ask_clarification",
    "generate_workflow_metadata",
    "request_workflow_sandbox",
}


def make_workflow_react_agent(
    config: RunnableConfig,
    *,
    app_config: AppConfig | None = None,
):
    resolved_app_config = app_config or _app_config_from(config) or get_app_config()
    runtime_config = _runtime_config(config)
    model_name = runtime_config.get("model_name")
    thinking_enabled = bool(runtime_config.get("thinking_enabled", False))
    reasoning_effort = runtime_config.get("reasoning_effort")
    model_kwargs = {"temperature": 0}
    if resolved_app_config.workflow_agent.max_output_tokens is not None:
        model_kwargs["max_tokens"] = (
            resolved_app_config.workflow_agent.max_output_tokens
        )

    model = create_chat_model(
        name=model_name,
        thinking_enabled=thinking_enabled,
        reasoning_effort=reasoning_effort,
        app_config=resolved_app_config,
        **model_kwargs,
    )
    skills = [
        skill
        for skill in get_enabled_skills_for_config(resolved_app_config)
        if skill.name in WORKFLOW_SKILL_NAMES
    ]
    available_tools = [
        tool
        for tool in WORKFLOW_AGENT_TOOLS
        if tool.name != "run_node_skill" or skills
    ]
    filtered_tools = filter_tools_by_skill_allowed_tools(
        available_tools,
        skills,
    )
    filtered_names = {tool.name for tool in filtered_tools}
    tools = [
        tool
        for tool in available_tools
        if tool.name in filtered_names or tool.name in WORKFLOW_CONTROL_TOOL_NAMES
    ]
    prompt = WORKFLOW_REACT_SYSTEM_PROMPT
    skills_section = get_skills_prompt_section(
        WORKFLOW_SKILL_NAMES,
        app_config=resolved_app_config,
    )
    if skills_section:
        global_skills_path = resolved_app_config.skills.container_path.rstrip("/")
        workflow_skills_path = (
            resolved_app_config.workflow_agent.skills_container_path_template
        )
        skills_section = skills_section.replace(
            global_skills_path,
            workflow_skills_path.rstrip("/"),
        )
        prompt = f"{prompt}\n\n{skills_section}"

    return create_deerflow_agent(
        model=model,
        tools=tools,
        system_prompt=prompt,
        middleware=_build_middlewares(resolved_app_config),
        state_schema=WorkflowAgentState,
        response_format=ToolStrategy(WorkflowReactDecision),
        name="workflow-agent",
    )


def _build_middlewares(app_config: AppConfig) -> list[AgentMiddleware]:
    middlewares: list[AgentMiddleware] = [
        ThreadDataMiddleware(lazy_init=True),
        DanglingToolCallMiddleware(),
        ToolErrorHandlingMiddleware(),
    ]
    summarization = _create_workflow_summarization_middleware(app_config)
    if summarization is not None:
        middlewares.append(summarization)
    if app_config.token_usage.enabled:
        middlewares.append(TokenUsageMiddleware())
    middlewares.extend(
        [
            WorkflowClarificationMiddleware(),
            WorkflowMetadataMiddleware(),
            WorkflowSandboxMiddleware(),
            LLMErrorHandlingMiddleware(app_config=app_config),
        ]
    )
    if app_config.loop_detection.enabled:
        middlewares.append(
            LoopDetectionMiddleware.from_config(app_config.loop_detection)
        )
    return middlewares


def _create_workflow_summarization_middleware(
    app_config: AppConfig,
) -> DeerFlowSummarizationMiddleware | None:
    config = app_config.summarization
    if not config.enabled:
        return None

    trigger = None
    if config.trigger is not None:
        trigger = (
            [item.to_tuple() for item in config.trigger]
            if isinstance(config.trigger, list)
            else config.trigger.to_tuple()
        )

    model = create_chat_model(
        name=config.model_name,
        thinking_enabled=False,
        app_config=app_config,
    ).with_config(tags=["middleware:summarize"])
    kwargs = {
        "model": model,
        "trigger": trigger,
        "keep": config.keep.to_tuple(),
    }
    if config.trim_tokens_to_summarize is not None:
        kwargs["trim_tokens_to_summarize"] = config.trim_tokens_to_summarize
    if config.summary_prompt is not None:
        kwargs["summary_prompt"] = config.summary_prompt

    def skills_container_path(state, _runtime):
        return workflow_skills_container_path_from_state(state, app_config)

    return DeerFlowSummarizationMiddleware(
        **kwargs,
        skills_container_path=skills_container_path,
        skill_file_read_tool_names=config.skill_file_read_tool_names,
        before_summarization=[],
        preserve_recent_skill_count=config.preserve_recent_skill_count,
        preserve_recent_skill_tokens=config.preserve_recent_skill_tokens,
        preserve_recent_skill_tokens_per_skill=(
            config.preserve_recent_skill_tokens_per_skill
        ),
    )


def _runtime_config(config: RunnableConfig) -> dict:
    runtime_config = dict(config.get("configurable", {}) or {})
    context = config.get("context", {}) or {}
    if isinstance(context, dict):
        runtime_config.update(context)
    return runtime_config


def _app_config_from(config: RunnableConfig) -> AppConfig | None:
    candidate = _runtime_config(config).get("app_config")
    return candidate if isinstance(candidate, AppConfig) else None
