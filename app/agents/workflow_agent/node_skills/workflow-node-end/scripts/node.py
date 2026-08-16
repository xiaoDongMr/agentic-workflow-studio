from __future__ import annotations

import uuid
from typing import Any

from app.agents.workflow_agent.node_skill_scripts import (
    update_node as update_node_data,
)


async def build_node() -> dict[str, object]:
    return {
        "node": {
            "id": f"end-{uuid.uuid4()}",
            "title": "结束节点",
            "type": "end",
            "description": "返回工作流最终输出。",
            "inputs": [],
            "outputs": [],
            "config": {
                "prompt": "输出最终结果。",
                "model": "System",
                "temperature": 0,
                "maxTokens": 1200,
                "enabled": True,
                "fallbackToHuman": False,
                "responseMode": "text",
                "outputKey": "final",
                "inputMappings": [],
            },
        }
    }


async def update_node(
    node_id: str,
    changes: dict[str, Any],
    runtime: dict[str, Any],
) -> dict[str, Any]:
    return update_node_data("end", node_id, changes, runtime)
