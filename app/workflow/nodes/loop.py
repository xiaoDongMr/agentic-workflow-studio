from __future__ import annotations

from typing import Any

from app.schemas.workflow import WorkflowNode
from app.workflow.state import WorkflowState


class LoopNodeExecutor:
    async def run(self, node: WorkflowNode, node_input: dict[str, Any], state: WorkflowState) -> dict[str, Any]:
        first_value = next(iter(node_input.values()), [])
        items = first_value if isinstance(first_value, list) else [first_value]
        return {
            node.config.outputKey or "items": items,
            "count": len(items),
            "results": [{"index": index, "item": item} for index, item in enumerate(items)],
        }
