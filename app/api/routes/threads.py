from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request

from app.deps import get_run_event_store, get_thread_store

router = APIRouter()


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
    return {"data": threads}


@router.get("/threads/{thread_id}")
async def get_thread(thread_id: str, request: Request) -> dict[str, Any]:
    thread = await _check_thread_exists(request, thread_id)
    return {"data": thread}


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
