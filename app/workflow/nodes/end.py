from __future__ import annotations

from typing import Any

from app.schemas.workflow import WorkflowNode
from app.workflow.state import WorkflowState


class EndNodeExecutor:
    async def run(self, node: WorkflowNode, node_input: dict[str, Any], state: WorkflowState) -> dict[str, Any]:
        if node_input:
            value = next(iter(node_input.values()))
        else:
            value = state.get("output", {})
        return {node.config.outputKey or "final": value}
