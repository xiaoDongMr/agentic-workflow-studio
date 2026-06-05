from __future__ import annotations

from typing import Any

from app.schemas.workflow import WorkflowNode
from app.services.selector_engine import selector_engine
from app.workflow.state import WorkflowState


class SelectorNodeExecutor:
    async def run(self, node: WorkflowNode, node_input: dict[str, Any], state: WorkflowState) -> dict[str, Any]:
        output_key = node.config.outputKey or "branch"
        result = selector_engine.evaluate(
            node,
            node_input,
            variables=state.get("variables", {}),
            run_input=state.get("input", {}),
        )
        return {output_key: result.branch, "matched": result.matched}
