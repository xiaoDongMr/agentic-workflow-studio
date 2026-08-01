from __future__ import annotations

from typing import Any, TypedDict

from langchain_core.runnables import RunnableConfig
from langgraph.config import get_stream_writer
from langgraph.graph import END, StateGraph

from app.agents.workflow_agent.events import workflow_event_type
from app.agents.workflow_agent.orchestrator import WorkflowAgentOrchestrator
from app.agents.workflow_agent.schemas import WorkflowAssistantStreamRequest
from deerflow.config.app_config import AppConfig, get_app_config


class WorkflowAgentState(TypedDict, total=False):
    workflowAssistant: dict[str, Any]


def make_workflow_agent(
    config: RunnableConfig,
    *,
    app_config: AppConfig | None = None,
):
    resolved_app_config = app_config or _app_config_from(config) or get_app_config()

    async def workflow_agent_node(
        state: WorkflowAgentState,
    ) -> WorkflowAgentState:
        raw_request = state.get("workflowAssistant")
        if raw_request is None:
            raise ValueError("workflowAssistant input is required")

        request = WorkflowAssistantStreamRequest.model_validate(raw_request)
        orchestrator = WorkflowAgentOrchestrator(resolved_app_config)
        writer = get_stream_writer()

        async for event_name, payload in orchestrator.stream(request):
            writer(
                {
                    **payload,
                    "type": workflow_event_type(event_name),
                }
            )
        return state

    graph = StateGraph(WorkflowAgentState)
    graph.add_node("workflow_agent", workflow_agent_node)
    graph.set_entry_point("workflow_agent")
    graph.add_edge("workflow_agent", END)
    return graph.compile()


def _app_config_from(config: RunnableConfig) -> AppConfig | None:
    context = config.get("context", {}) or {}
    if isinstance(context, dict):
        candidate = context.get("app_config")
        if isinstance(candidate, AppConfig):
            return candidate
    configurable = config.get("configurable", {}) or {}
    if isinstance(configurable, dict):
        candidate = configurable.get("app_config")
        if isinstance(candidate, AppConfig):
            return candidate
    return None
