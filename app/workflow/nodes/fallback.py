from __future__ import annotations

from typing import Any

from app.schemas.workflow import WorkflowNode
from app.workflow.state import WorkflowState


class FallbackNodeExecutor:
    async def run(self, node: WorkflowNode, node_input: dict[str, Any], state: WorkflowState) -> dict[str, Any]:
        return {"output": node_input}
