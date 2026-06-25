from __future__ import annotations

from collections.abc import Iterable

from app.sandbox_pool.kubernetes_api import KubernetesApiSandboxPool
from app.sandbox_pool.schemas import SandboxImageSummary


def with_preload_status(pool: KubernetesApiSandboxPool, images: Iterable[SandboxImageSummary]) -> list[SandboxImageSummary]:
    enriched: list[SandboxImageSummary] = []
    for image in images:
        if image.is_default:
            enriched.append(
                image.model_copy(
                    update={
                        "preload_status": "builtin",
                        "preload_message": "默认镜像由资源池配置提供，通常已在集群节点缓存",
                    }
                )
            )
            continue

        try:
            status = pool.get_image_preload_status(image.id)
        except Exception as exc:
            enriched.append(image.model_copy(update={"preload_status": "unknown", "preload_message": str(exc)}))
            continue

        enriched.append(
            image.model_copy(
                update={
                    "preload_status": status.status,
                    "preload_ready": status.ready,
                    "preload_desired": status.desired,
                    "preload_message": status.message,
                }
            )
        )
    return enriched
