from __future__ import annotations

from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any

from deerflow.config.app_config import AppConfig, get_app_config
from deerflow.persistence.engine import close_engine, get_session_factory, init_engine_from_config
from deerflow.persistence.thread_meta import ThreadMetaStore, make_thread_store
from deerflow.runtime import RunContext, RunManager, make_checkpointer, make_store, make_stream_bridge
from deerflow.runtime.events.store import RunEventStore, make_run_event_store
from deerflow.runtime.stream_bridge import StreamBridge


@dataclass(slots=True)
class AppRuntime:
    app_config: AppConfig
    checkpointer: Any
    store: Any
    stream_bridge: StreamBridge
    run_manager: RunManager
    run_event_store: RunEventStore
    thread_store: ThreadMetaStore
    run_context: RunContext


@asynccontextmanager
async def create_app_runtime():
    app_config = get_app_config()
    await init_engine_from_config(app_config.database)
    try:
        async with make_checkpointer(app_config) as checkpointer:
            async with make_store(app_config) as store:
                async with make_stream_bridge(app_config) as stream_bridge:
                    run_manager = RunManager()
                    run_event_store = make_run_event_store(app_config.run_events)
                    thread_store = make_thread_store(get_session_factory(), store)
                    run_context = RunContext(
                        checkpointer=checkpointer,
                        store=store,
                        event_store=run_event_store,
                        run_events_config=app_config.run_events,
                        thread_store=thread_store,
                        app_config=app_config,
                    )
                    yield AppRuntime(
                        app_config=app_config,
                        checkpointer=checkpointer,
                        store=store,
                        stream_bridge=stream_bridge,
                        run_manager=run_manager,
                        run_event_store=run_event_store,
                        thread_store=thread_store,
                        run_context=run_context,
                    )
    finally:
        await close_engine()
