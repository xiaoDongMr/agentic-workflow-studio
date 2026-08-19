from __future__ import annotations

from typing import Any

from langchain_core.messages import AIMessage

from app.agents.workflow_agent.events import workflow_event_type


MAX_MODEL_OUTPUT_LENGTH = 4000

_SCRIPT_DECISION_TEXT = {
    "list_input_sources": "正在确认节点可用的上游变量",
    "list_models": "正在筛选可用模型",
    "resolve_model_config": "正在确定模型配置",
    "build_node": "正在生成节点配置",
    "update_node": "正在更新节点配置",
}


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


def model_tool_decision_text(response: Any) -> str:
    message = ai_message_from_result(response)
    if message is None:
        return ""
    decisions: list[str] = []
    for call in message.tool_calls:
        name = str(call.get("name") or "")
        args = call.get("args")
        tool_args = args if isinstance(args, dict) else {}
        if name == "read_file":
            decisions.append("正在读取节点配置规则")
        elif name == "execute_node_skill_script":
            function_name = str(tool_args.get("function_name") or "")
            decisions.append(
                _SCRIPT_DECISION_TEXT.get(
                    function_name,
                    "正在执行节点配置脚本",
                )
            )
        elif name == "update_current_graph":
            decisions.append(
                "正在写入并发布最终工作流"
                if tool_args.get("done") is True
                else "正在将节点和连线同步到画布"
            )
    return "；".join(dict.fromkeys(decisions))[:MAX_MODEL_OUTPUT_LENGTH]


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
