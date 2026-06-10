from __future__ import annotations

import time
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Literal, TypedDict
from uuid import uuid4

from langgraph.config import get_stream_writer


WorkflowEventType = Literal[
    "node_started",
    "node_completed",
    "node_failed",
    "node_log",
    "llm_started",
    "llm_token",
    "llm_completed",
    "llm_retry",
    "llm_failed",
    "tool_started",
    "tool_completed",
    "tool_failed",
]
WorkflowEventLevel = Literal["debug", "info", "warning", "error"]
_event_context: ContextVar[dict[str, Any]] = ContextVar("workflow_event_context", default={})


class WorkflowRuntimeEvent(TypedDict, total=False):
    id: str
    type: WorkflowEventType
    level: WorkflowEventLevel
    timestamp: float
    nodeId: str
    nodeTitle: str
    title: str
    message: str
    token: str
    durationMs: int
    error: str
    data: dict[str, Any]


def build_workflow_event(
    event_type: WorkflowEventType,
    *,
    node_id: str | None = None,
    node_title: str | None = None,
    level: WorkflowEventLevel = "info",
    title: str | None = None,
    message: str = "",
    token: str | None = None,
    duration_ms: int | None = None,
    error: str | None = None,
    data: dict[str, Any] | None = None,
) -> WorkflowRuntimeEvent:
    event: WorkflowRuntimeEvent = {
        "id": uuid4().hex,
        "type": event_type,
        "level": level,
        "timestamp": time.time(),
        "message": message,
    }
    if node_id:
        event["nodeId"] = node_id
    if node_title:
        event["nodeTitle"] = node_title
    if title:
        event["title"] = title
    if token is not None:
        event["token"] = token
    if duration_ms is not None:
        event["durationMs"] = duration_ms
    if error:
        event["error"] = error
    if data:
        event["data"] = data
    return event


def emit_workflow_event(event: WorkflowRuntimeEvent) -> None:
    try:
        writer = get_stream_writer()
    except RuntimeError:
        return
    context = _event_context.get()
    if context:
        event = {
            **event,
            "data": {
                **context,
                **event.get("data", {}),
            },
        }
    writer(event)


@contextmanager
def workflow_event_context(context: dict[str, Any]) -> Iterator[None]:
    current = _event_context.get()
    token = _event_context.set({**current, **context})
    try:
        yield
    finally:
        _event_context.reset(token)
