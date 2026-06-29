from __future__ import annotations

import json
from typing import Any

from app.schemas.workflow import WorkflowNode
from app.services.workflow_events import build_workflow_event, emit_workflow_event


def retry_attempts(node: WorkflowNode) -> int:
    return min(max(node.config.retryCount, 0), 10) + 1


def emit_retry_event(
    node: WorkflowNode,
    *,
    attempt: int,
    attempts: int,
    error: Exception,
    title: str = "节点调用重试",
) -> None:
    emit_workflow_event(build_workflow_event(
        "node_log",
        node_id=node.id,
        node_title=node.title,
        level="warning",
        title=title,
        message=f"第 {attempt}/{attempts} 次调用失败，准备重试：{error}",
        error=str(error),
        data={"attempt": attempt, "maxAttempts": attempts},
    ))


def fallback_output(node: WorkflowNode) -> dict[str, Any]:
    raw_output = (node.config.fallbackOutput or "").strip()
    if not raw_output:
        return {output_key(node): None}

    try:
        parsed_output = json.loads(raw_output)
    except json.JSONDecodeError:
        return {output_key(node): raw_output}

    if isinstance(parsed_output, dict):
        return parsed_output
    return {output_key(node): parsed_output}


def ignored_output(node: WorkflowNode) -> dict[str, Any]:
    return {output_key(node): None}


def emit_error_strategy_event(node: WorkflowNode, *, strategy: str, error: Exception) -> None:
    if strategy == "fallback":
        title = "使用兜底输出"
        message = "节点执行失败，已按策略使用兜底输出"
    elif strategy == "ignore":
        title = "忽略节点错误"
        message = "节点执行失败，已按策略忽略并继续"
    else:
        title = "中断工作流"
        message = "节点执行失败，已按策略中断工作流"

    emit_workflow_event(build_workflow_event(
        "node_log",
        node_id=node.id,
        node_title=node.title,
        level="warning",
        title=title,
        message=message,
        error=str(error),
    ))


def output_key(node: WorkflowNode) -> str:
    configured_key = (node.config.outputKey or "").strip()
    if configured_key:
        return configured_key
    for output in node.outputs:
        name = output.name.strip()
        if name:
            return name
    return "output"
