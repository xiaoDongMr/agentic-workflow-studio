from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.deps import get_checkpointer, get_run_event_store, get_run_manager, get_thread_store
from deerflow.persistence.engine import get_session_factory
from deerflow.persistence.feedback import FeedbackRepository
from deerflow.runtime import serialize_channel_values

router = APIRouter()


class ThreadCreateRequest(BaseModel):
    thread_id: str | None = Field(default=None)
    assistant_id: str | None = Field(default=None)
    metadata: dict[str, Any] | None = Field(default=None)


class ThreadSearchRequest(BaseModel):
    metadata: dict[str, Any] | None = Field(default=None)
    limit: int = Field(default=50, ge=1, le=200)
    offset: int = Field(default=0, ge=0)
    status: str | None = Field(default=None)


class ThreadHistoryRequest(BaseModel):
    limit: int = Field(default=1, ge=1, le=100)
    before: str | None = Field(default=None)


class ThreadStateUpdateRequest(BaseModel):
    values: dict[str, Any] | None = Field(default=None)


class RunFeedbackRequest(BaseModel):
    rating: int = Field(ge=-1, le=1)
    comment: str | None = Field(default=None)


def _get_memory_feedback_store(request: Request) -> dict[str, dict[str, dict[str, Any]]]:
    store = getattr(request.app.state, "feedback_memory", None)
    if store is None:
        store = {}
        request.app.state.feedback_memory = store
    return store


async def _list_feedback_by_thread(request: Request, thread_id: str) -> dict[str, dict[str, Any]]:
    session_factory = get_session_factory()
    if session_factory is not None:
        repository = FeedbackRepository(session_factory)
        return await repository.list_by_thread_grouped(thread_id, user_id=None)

    return dict(_get_memory_feedback_store(request).get(thread_id, {}))


async def _upsert_feedback(
    request: Request,
    *,
    thread_id: str,
    run_id: str,
    rating: int,
    comment: str | None = None,
) -> dict[str, Any]:
    if rating not in (1, -1):
        raise HTTPException(status_code=422, detail="rating must be +1 or -1")

    session_factory = get_session_factory()
    if session_factory is not None:
        repository = FeedbackRepository(session_factory)
        return await repository.upsert(thread_id=thread_id, run_id=run_id, rating=rating, comment=comment, user_id=None)

    row = {
        "feedback_id": f"{thread_id}:{run_id}",
        "thread_id": thread_id,
        "run_id": run_id,
        "rating": rating,
        "comment": comment,
    }
    _get_memory_feedback_store(request).setdefault(thread_id, {})[run_id] = row
    return row


async def _delete_feedback(request: Request, *, thread_id: str, run_id: str) -> bool:
    session_factory = get_session_factory()
    if session_factory is not None:
        repository = FeedbackRepository(session_factory)
        return await repository.delete_by_run(thread_id=thread_id, run_id=run_id, user_id=None)

    thread_feedback = _get_memory_feedback_store(request).get(thread_id, {})
    return thread_feedback.pop(run_id, None) is not None


async def _get_checkpoint_values(request: Request, thread_id: str) -> dict[str, Any]:
    checkpointer = get_checkpointer(request)
    config = {"configurable": {"thread_id": thread_id, "checkpoint_ns": ""}}
    checkpoint_tuple = await checkpointer.aget_tuple(config)
    if checkpoint_tuple is None:
        return {}

    checkpoint = getattr(checkpoint_tuple, "checkpoint", {}) or {}
    return serialize_channel_values(checkpoint.get("channel_values", {}) or {})


async def _thread_response(thread: dict[str, Any], request: Request) -> dict[str, Any]:
    checkpoint_values = await _get_checkpoint_values(request, thread["thread_id"])
    title = checkpoint_values.get("title") or thread.get("display_name") or thread.get("metadata", {}).get("title")
    return {
        **thread,
        "values": {**checkpoint_values, **({"title": title} if title else {})},
        "interrupts": thread.get("interrupts", {}),
    }


def _run_response(record: Any) -> dict[str, Any]:
    return {
        "run_id": record.run_id,
        "thread_id": record.thread_id,
        "assistant_id": record.assistant_id,
        "status": record.status.value if hasattr(record.status, "value") else str(record.status),
        "metadata": record.metadata,
        "kwargs": record.kwargs,
        "multitask_strategy": record.multitask_strategy,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
    }


async def _check_thread_exists(request: Request, thread_id: str) -> dict[str, Any]:
    thread_store = get_thread_store(request)
    thread = await thread_store.get(thread_id, user_id=None)
    if thread is None:
        raise HTTPException(status_code=404, detail=f"Thread {thread_id!r} not found")
    return thread


@router.get("/threads")
async def list_threads(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    thread_store = get_thread_store(request)
    threads = await thread_store.search(limit=limit, offset=offset, user_id=None)
    return {"data": [await _thread_response(thread, request) for thread in threads]}


@router.post("/threads/search")
async def search_threads(body: ThreadSearchRequest, request: Request) -> list[dict[str, Any]]:
    thread_store = get_thread_store(request)
    threads = await thread_store.search(
        metadata=body.metadata,
        status=body.status,
        limit=body.limit,
        offset=body.offset,
        user_id=None,
    )
    return [await _thread_response(thread, request) for thread in threads]


@router.post("/threads")
async def create_thread(body: ThreadCreateRequest, request: Request) -> dict[str, Any]:
    thread_store = get_thread_store(request)
    thread_id = body.thread_id or str(uuid.uuid4())
    existing = await thread_store.get(thread_id, user_id=None)
    if existing is not None:
        return existing

    metadata = dict(body.metadata or {})
    assistant_id = body.assistant_id or metadata.pop("graph_id", None)
    return await thread_store.create(
        thread_id,
        assistant_id=assistant_id,
        user_id=None,
        metadata=metadata,
    )


@router.get("/threads/{thread_id}")
async def get_thread(thread_id: str, request: Request) -> dict[str, Any]:
    thread = await _check_thread_exists(request, thread_id)
    return {"data": await _thread_response(thread, request)}


@router.delete("/threads/{thread_id}")
async def delete_thread(thread_id: str, request: Request) -> dict[str, Any]:
    await _check_thread_exists(request, thread_id)
    thread_store = get_thread_store(request)
    run_event_store = get_run_event_store(request)
    checkpointer = get_checkpointer(request)

    await run_event_store.delete_by_thread(thread_id)
    if hasattr(checkpointer, "adelete_thread"):
        await checkpointer.adelete_thread(thread_id)
    await thread_store.delete(thread_id, user_id=None)

    return {"success": True, "message": f"Deleted thread {thread_id}"}


@router.get("/threads/{thread_id}/state")
async def get_thread_state(thread_id: str, request: Request) -> dict[str, Any]:
    await _check_thread_exists(request, thread_id)
    checkpointer = get_checkpointer(request)
    config = {"configurable": {"thread_id": thread_id, "checkpoint_ns": ""}}
    checkpoint_tuple = await checkpointer.aget_tuple(config)
    if checkpoint_tuple is None:
        return {
            "values": {},
            "next": [],
            "metadata": {},
            "checkpoint": {},
            "checkpoint_id": None,
            "parent_checkpoint_id": None,
            "created_at": None,
            "tasks": [],
        }

    checkpoint = getattr(checkpoint_tuple, "checkpoint", {}) or {}
    metadata = getattr(checkpoint_tuple, "metadata", {}) or {}
    checkpoint_config = getattr(checkpoint_tuple, "config", {}) or {}
    parent_config = getattr(checkpoint_tuple, "parent_config", None)
    tasks_raw = getattr(checkpoint_tuple, "tasks", []) or []
    checkpoint_id = checkpoint_config.get("configurable", {}).get("checkpoint_id")
    parent_checkpoint_id = None
    if parent_config:
        parent_checkpoint_id = parent_config.get("configurable", {}).get("checkpoint_id")

    return {
        "values": serialize_channel_values(checkpoint.get("channel_values", {}) or {}),
        "next": [getattr(task, "name", "") for task in tasks_raw if getattr(task, "name", "")],
        "metadata": metadata,
        "checkpoint": {"id": checkpoint_id},
        "checkpoint_id": checkpoint_id,
        "parent_checkpoint_id": parent_checkpoint_id,
        "created_at": metadata.get("created_at"),
        "tasks": [{"id": getattr(task, "id", ""), "name": getattr(task, "name", "")} for task in tasks_raw],
    }


@router.post("/threads/{thread_id}/state")
async def update_thread_state(thread_id: str, body: ThreadStateUpdateRequest, request: Request) -> dict[str, Any]:
    await _check_thread_exists(request, thread_id)
    checkpointer = get_checkpointer(request)
    thread_store = get_thread_store(request)

    config = {"configurable": {"thread_id": thread_id, "checkpoint_ns": ""}}
    checkpoint_tuple = await checkpointer.aget_tuple(config)
    checkpoint = dict(getattr(checkpoint_tuple, "checkpoint", {}) or {}) if checkpoint_tuple is not None else {}
    metadata = dict(getattr(checkpoint_tuple, "metadata", {}) or {}) if checkpoint_tuple is not None else {}
    channel_values = dict(checkpoint.get("channel_values", {}) or {})

    if body.values:
        channel_values.update(body.values)
    checkpoint["channel_values"] = channel_values

    await checkpointer.aput(config, checkpoint, metadata, {})

    title = body.values.get("title") if body.values else None
    if isinstance(title, str) and title.strip():
        await thread_store.update_display_name(thread_id, title.strip(), user_id=None)

    return {
        "values": serialize_channel_values(channel_values),
        "next": [],
        "metadata": metadata,
        "checkpoint": {},
        "checkpoint_id": None,
        "parent_checkpoint_id": None,
        "created_at": metadata.get("created_at"),
        "tasks": [],
    }


@router.post("/threads/{thread_id}/history")
async def get_thread_history(thread_id: str, body: ThreadHistoryRequest, request: Request) -> list[dict[str, Any]]:
    await _check_thread_exists(request, thread_id)
    checkpointer = get_checkpointer(request)
    config: dict[str, Any] = {"configurable": {"thread_id": thread_id}}
    if body.before:
        config["configurable"]["checkpoint_id"] = body.before

    entries: list[dict[str, Any]] = []
    async for checkpoint_tuple in checkpointer.alist(config, limit=body.limit):
        checkpoint_config = getattr(checkpoint_tuple, "config", {}) or {}
        parent_config = getattr(checkpoint_tuple, "parent_config", None)
        metadata = getattr(checkpoint_tuple, "metadata", {}) or {}
        checkpoint = getattr(checkpoint_tuple, "checkpoint", {}) or {}
        checkpoint_id = checkpoint_config.get("configurable", {}).get("checkpoint_id")
        parent_checkpoint_id = None
        if parent_config:
            parent_checkpoint_id = parent_config.get("configurable", {}).get("checkpoint_id")
        entries.append(
            {
                "checkpoint_id": checkpoint_id,
                "parent_checkpoint_id": parent_checkpoint_id,
                "metadata": metadata,
                "values": serialize_channel_values(checkpoint.get("channel_values", {}) or {}),
                "created_at": metadata.get("created_at"),
                "next": [],
            }
        )
    return entries


@router.get("/threads/{thread_id}/runs")
async def list_thread_runs(thread_id: str, request: Request) -> list[dict[str, Any]]:
    await _check_thread_exists(request, thread_id)
    run_manager = get_run_manager(request)
    records = await run_manager.list_by_thread(thread_id)
    records = sorted(records, key=lambda item: item.created_at or "")
    return [_run_response(record) for record in records]


@router.get("/threads/{thread_id}/runs/{run_id}/messages")
async def list_run_messages(
    thread_id: str,
    run_id: str,
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    before_seq: int | None = Query(default=None, ge=1),
    after_seq: int | None = Query(default=None, ge=1),
) -> dict[str, Any]:
    if before_seq is not None and after_seq is not None:
        raise HTTPException(status_code=400, detail="before_seq and after_seq cannot be used together")

    await _check_thread_exists(request, thread_id)
    run_event_store = get_run_event_store(request)
    rows = await run_event_store.list_messages_by_run(
        thread_id,
        run_id,
        limit=limit + 1,
        before_seq=before_seq,
        after_seq=after_seq,
    )
    has_more = len(rows) > limit
    return {"data": rows[:limit] if has_more else rows, "has_more": has_more}


@router.get("/threads/{thread_id}/feedback")
async def list_thread_feedback(thread_id: str, request: Request) -> dict[str, dict[str, Any]]:
    await _check_thread_exists(request, thread_id)
    return await _list_feedback_by_thread(request, thread_id)


@router.put("/threads/{thread_id}/runs/{run_id}/feedback")
async def upsert_run_feedback(
    thread_id: str,
    run_id: str,
    body: RunFeedbackRequest,
    request: Request,
) -> dict[str, Any]:
    await _check_thread_exists(request, thread_id)
    return await _upsert_feedback(request, thread_id=thread_id, run_id=run_id, rating=body.rating, comment=body.comment)


@router.delete("/threads/{thread_id}/runs/{run_id}/feedback")
async def delete_run_feedback(thread_id: str, run_id: str, request: Request) -> dict[str, Any]:
    await _check_thread_exists(request, thread_id)
    deleted = await _delete_feedback(request, thread_id=thread_id, run_id=run_id)
    return {"success": deleted}


@router.get("/threads/{thread_id}/messages")
async def list_thread_messages(
    thread_id: str,
    request: Request,
    limit: int = Query(default=100, ge=1, le=500),
    before_seq: int | None = Query(default=None, ge=1),
    after_seq: int | None = Query(default=None, ge=1),
) -> dict[str, Any]:
    if before_seq is not None and after_seq is not None:
        raise HTTPException(status_code=400, detail="before_seq and after_seq cannot be used together")

    await _check_thread_exists(request, thread_id)
    run_event_store = get_run_event_store(request)
    data = await run_event_store.list_messages(
        thread_id,
        limit=limit,
        before_seq=before_seq,
        after_seq=after_seq,
    )

    has_more = False
    if data:
        probe_before = data[0]["seq"] if after_seq is None else None
        probe_after = data[-1]["seq"] if after_seq is not None else None
        probe = await run_event_store.list_messages(
            thread_id,
            limit=1,
            before_seq=probe_before,
            after_seq=probe_after,
        )
        has_more = len(probe) > 0

    return {"data": data, "has_more": has_more}
