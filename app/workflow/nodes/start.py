from __future__ import annotations

import json
from typing import Any

from app.schemas.workflow import WorkflowNode
from app.workflow.state import WorkflowState


class StartNodeExecutor:
    async def run(self, node: WorkflowNode, node_input: dict[str, Any], state: WorkflowState) -> dict[str, Any]:
        run_input = state.get("input", {})
        outputs = [output for output in node.outputs if output.name]
        if outputs:
            if len(outputs) == 1 and outputs[0].name not in run_input:
                return {outputs[0].name: extract_message_content(run_input)}
            return {output.name: run_input.get(output.name) for output in outputs}
        return {node.config.outputKey or "query": extract_message_content(state.get("input", {}))}


def extract_message_content(payload: dict[str, Any]) -> str:
    if isinstance(payload.get("userInput"), str):
        return payload["userInput"]
    message = payload.get("message")
    if isinstance(message, dict) and isinstance(message.get("content"), str):
        return message["content"]
    if isinstance(payload.get("content"), str):
        return payload["content"]
    return json.dumps(payload, ensure_ascii=False)
