from __future__ import annotations

import json
from typing import Any, Literal

from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig
from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph

from app.agents.workflow_agent.events import workflow_event_type
from app.agents.workflow_agent.policy import WorkflowPolicyGate
from app.agents.workflow_agent.react_factory import make_workflow_react_agent
from app.agents.workflow_agent.result import finalize_workflow_turn
from app.agents.workflow_agent.state import WorkflowAgentState
from app.agents.workflow_agent.turn import (
    build_task,
    context_from_state,
    request_from_state,
    status_message,
)
from deerflow.config.app_config import AppConfig, get_app_config


def make_workflow_agent(
    config: RunnableConfig,
    *,
    app_config: AppConfig | None = None,
):
    resolved_app_config = app_config or _app_config_from(config) or get_app_config()
    react_agent = make_workflow_react_agent(
        config,
        app_config=resolved_app_config,
    )
    policy_gate = WorkflowPolicyGate()

    async def prepare_node(state: WorkflowAgentState) -> dict[str, Any]:
        request = request_from_state(state)
        context = context_from_state(state, request)
        writer = get_stream_writer()
        writer(
            {
                "type": workflow_event_type("session"),
                "threadId": context.threadId,
            }
        )

        task, next_context = build_task(request, context)
        if task["mode"] not in {"cancel", "complete"}:
            writer(
                {
                    "type": workflow_event_type("message"),
                    "threadId": context.threadId,
                    "message": status_message(task["mode"]),
                }
            )
        if task["mode"] == "repair":
            writer(
                {
                    "type": workflow_event_type("fixing"),
                    "threadId": context.threadId,
                    "stageId": task["currentStage"]["stageId"],
                    "attempt": next_context.repairAttempts,
                    "message": "正在根据画布校验结果自动修复",
                }
            )
        return {
            "messages": [
                HumanMessage(
                    content=json.dumps(task, ensure_ascii=False),
                )
            ],
            "workflowContext": next_context.model_dump(),
            "workflowTask": task,
            "workflowDecision": None,
            "workflowClarification": None,
            "workflowMetadata": None,
            "workflowSandboxRequirement": None,
            "policyResult": None,
            "validationResult": None,
            "workflowError": None,
        }

    async def finalize_node(state: WorkflowAgentState) -> dict[str, Any]:
        request = request_from_state(state)
        context = context_from_state(state, request)
        writer = get_stream_writer()
        try:
            return finalize_workflow_turn(
                state,
                request=request,
                context=context,
                writer=writer,
                policy_gate=policy_gate,
            )
        except Exception as exc:
            writer(
                {
                    "type": workflow_event_type("error"),
                    "threadId": context.threadId,
                    "message": str(exc),
                }
            )
            writer(
                {
                    "type": workflow_event_type("end"),
                    "threadId": context.threadId,
                }
            )
            return {
                "workflowAssistant": None,
                "workflowError": {"message": str(exc)},
            }

    graph = StateGraph(WorkflowAgentState)
    graph.add_node("prepare", prepare_node)
    graph.add_node("react", react_agent)
    graph.add_node("finalize", finalize_node)
    graph.add_edge(START, "prepare")
    graph.add_conditional_edges(
        "prepare",
        _route_after_prepare,
        {
            "react": "react",
            "finalize": "finalize",
        },
    )
    graph.add_edge("react", "finalize")
    graph.add_edge("finalize", END)
    return graph.compile()


def _route_after_prepare(
    state: WorkflowAgentState,
) -> Literal["react", "finalize"]:
    task = state.get("workflowTask") or {}
    return "finalize" if task.get("mode") in {"cancel", "complete"} else "react"


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
