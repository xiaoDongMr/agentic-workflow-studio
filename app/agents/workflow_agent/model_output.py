from __future__ import annotations

from typing import Any

from langchain_core.messages import AIMessage

from app.agents.workflow_agent.events import workflow_event_type


MAX_MODEL_OUTPUT_LENGTH = 4000


def model_output_id_from_result(response: Any) -> str:
    message = ai_message_from_result(response)
    return str(message.id or "") if message is not None else ""


def ai_message_from_result(response: Any) -> AIMessage | None:
    if isinstance(response, AIMessage):
        return response
    result = getattr(response, "result", None)
    if isinstance(result, list) and result:
        candidate = result[-1]
        if isinstance(candidate, AIMessage):
            return candidate
    return None


def model_output_delta_text(response: Any) -> str:
    message = ai_message_from_result(response)
    if message is None:
        return ""
    content = message.content
    if isinstance(content, str):
        return content[:MAX_MODEL_OUTPUT_LENGTH]
    if not isinstance(content, list):
        return ""

    parts: list[str] = []
    for block in content:
        if not isinstance(block, dict):
            continue
        block_type = str(block.get("type") or "")
        if block_type not in {"text", "output_text"}:
            continue
        text = block.get("text")
        if isinstance(text, str):
            parts.append(text)
    return "".join(parts)[:MAX_MODEL_OUTPUT_LENGTH]


def model_output_event(
    *,
    thread_id: str,
    actor: str,
    actor_label: str,
    output_id: str,
    content: str,
) -> dict[str, Any] | None:
    if not content:
        return None
    return {
        "type": workflow_event_type("modelOutput"),
        "threadId": thread_id,
        "actor": actor,
        "actorLabel": actor_label,
        "outputId": output_id,
        "content": content,
    }
