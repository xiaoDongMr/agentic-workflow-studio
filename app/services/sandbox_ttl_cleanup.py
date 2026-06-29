from __future__ import annotations

import asyncio
import logging
from contextlib import suppress

from deerflow.config.app_config import AppConfig, get_app_config

from app.sandbox_pool import KubernetesApiSandboxPool
from app.sandbox_pool.kubernetes_api import (
    DEFAULT_TTL_CLEANUP_INTERVAL_SECONDS,
    KubernetesApiSandboxPoolSettings,
)

logger = logging.getLogger(__name__)


class SandboxTtlCleanupService:
    def __init__(self, app_config: AppConfig) -> None:
        self._initial_app_config = app_config
        self._task: asyncio.Task[None] | None = None
        self._stopping = asyncio.Event()

    def start(self) -> None:
        if self._task is not None:
            return
        self._stopping.clear()
        self._task = asyncio.create_task(self._run(), name="sandbox-ttl-cleanup")

    async def stop(self) -> None:
        self._stopping.set()
        if self._task is None:
            return
        self._task.cancel()
        with suppress(asyncio.CancelledError):
            await self._task
        self._task = None

    async def _run(self) -> None:
        while not self._stopping.is_set():
            interval_seconds = DEFAULT_TTL_CLEANUP_INTERVAL_SECONDS
            try:
                app_config = self._current_app_config()
                if not _is_kubernetes_sandbox_pool(app_config):
                    return
                settings = KubernetesApiSandboxPoolSettings.from_app_config(app_config)
                interval_seconds = settings.ttl_cleanup_interval_seconds
                deleted = await asyncio.to_thread(KubernetesApiSandboxPool(app_config).cleanup_expired)
                if deleted:
                    logger.info("Deleted expired sandbox(es): %s", ", ".join(deleted))
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Sandbox TTL cleanup failed")

            try:
                await asyncio.wait_for(self._stopping.wait(), timeout=interval_seconds)
            except TimeoutError:
                continue

    def _current_app_config(self) -> AppConfig:
        try:
            return get_app_config()
        except Exception:
            return self._initial_app_config


def _is_kubernetes_sandbox_pool(app_config: AppConfig) -> bool:
    raw_pool = getattr(app_config, "sandbox_pool", {}) or {}
    if hasattr(raw_pool, "model_dump"):
        raw_pool = raw_pool.model_dump()
    if not isinstance(raw_pool, dict):
        return False
    return str(raw_pool.get("provider", "kubernetes_api")) == "kubernetes_api"
