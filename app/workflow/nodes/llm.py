from __future__ import annotations

import json
import logging
from typing import Any

from deerflow.config.app_config import AppConfig

from app.schemas.workflow import WorkflowNode
from app.services.workflow_events import build_workflow_event, emit_workflow_event
from app.services.workflow_llm import (
    DeerFlowModelProvider,
    LlmInvokeRequest,
    LlmInvokeResult,
    VisionInput,
    build_llm_request,
)
from app.workflow.services.media_inputs import (
    collect_media_urls,
    is_vision_value_type,
    media_url_to_data_url,
    vision_kind,
)
from app.workflow.state import WorkflowState

logger = logging.getLogger(__name__)


class LlmNodeExecutor:
    def __init__(self, app_config: AppConfig | None):
        self.app_config = app_config
        self.model_provider = DeerFlowModelProvider(app_config)

    async def run(self, node: WorkflowNode, node_input: dict[str, Any], state: WorkflowState) -> dict[str, Any]:
        request = build_llm_request(
            node_id=node.id,
            node_title=node.title,
            model=model_name(node, self.app_config),
            system_prompt_template=node.config.systemPrompt or node.config.prompt or "",
            user_prompt_template=node.config.userPrompt or "{{input}}",
            node_input=node_input,
            variables=state.get("variables", {}),
            run_input=state.get("input", {}),
            temperature=node.config.temperature,
            max_tokens=node.config.maxTokens,
            timeout_seconds=node.config.timeoutSeconds,
            thinking_enabled=node.config.thinkingEnabled,
            reasoning_effort=node.config.reasoningEffort,
            vision_inputs=self._build_vision_inputs(node, node_input),
        )
        result = await self._invoke_with_policy(node, request)
        return self._format_output(node, result.content, result.reasoning_content)

    def _build_vision_inputs(
        self,
        node: WorkflowNode,
        node_input: dict[str, Any],
    ) -> list[VisionInput]:
        vision_inputs: list[VisionInput] = []
        for item in node.inputs:
            if not item.name or item.name not in node_input or not is_vision_value_type(item.type):
                continue
            urls = collect_media_urls(node_input[item.name])
            if not urls:
                continue
            if node.config.visionInputAsBase64:
                urls = [media_url_to_data_url(url, self.app_config) for url in urls]
            vision_inputs.append(
                VisionInput(
                    name=item.name,
                    kind=vision_kind(item.type),
                    urls=tuple(urls),
                )
            )
        return vision_inputs

    async def _invoke_with_policy(self, node: WorkflowNode, request: LlmInvokeRequest) -> LlmInvokeResult:
        retry_count = min(max(node.config.retryCount, 0), 10)
        attempts = retry_count + 1
        last_error: Exception | None = None
        for attempt in range(1, attempts + 1):
            try:
                return await self.model_provider.invoke(request)
            except Exception as exc:
                last_error = exc
                if attempt < attempts:
                    emit_workflow_event(build_workflow_event(
                        "llm_retry",
                        node_id=node.id,
                        node_title=node.title,
                        level="warning",
                        title="模型调用重试",
                        message=f"第 {attempt}/{attempts} 次调用失败，准备重试：{exc}",
                        error=str(exc),
                        data={"attempt": attempt, "maxAttempts": attempts},
                    ))
                else:
                    emit_workflow_event(build_workflow_event(
                        "node_log",
                        node_id=node.id,
                        node_title=node.title,
                        level="warning",
                        title="重试次数已用尽",
                        message=f"模型调用在 {attempts} 次尝试后仍然失败：{exc}",
                        error=str(exc),
                        data={"attempt": attempt, "maxAttempts": attempts},
                    ))
                logger.error(
                    "节点 %s(%s) 大模型调用失败（第 %d/%d 次）: %s: %s",
                    node.id,
                    node.type,
                    attempt,
                    attempts,
                    type(exc).__name__,
                    exc,
                )

        if node.config.errorStrategy == "fallback":
            logger.info("节点 %s 调用失败，使用兜底输出", node.id)
            emit_workflow_event(build_workflow_event(
                "node_log",
                node_id=node.id,
                node_title=node.title,
                level="warning",
                title="使用兜底输出",
                message="模型调用失败，已按策略使用兜底输出",
            ))
            return LlmInvokeResult(content=node.config.fallbackOutput or "", reasoning_content="")
        if node.config.errorStrategy == "ignore":
            logger.info("节点 %s 调用失败，按策略忽略", node.id)
            emit_workflow_event(build_workflow_event(
                "node_log",
                node_id=node.id,
                node_title=node.title,
                level="warning",
                title="忽略模型错误",
                message="模型调用失败，已按策略忽略并返回空输出",
            ))
            return LlmInvokeResult(content="", reasoning_content="")
        raise last_error or RuntimeError("大模型调用失败")

    def _format_output(self, node: WorkflowNode, content: str, reasoning_content: str) -> dict[str, Any]:
        output_key = node.config.outputKey or "output"
        reasoning_key = node.config.reasoningKey or "reasoning_content"
        output: dict[str, Any]
        if node.config.responseMode == "json":
            try:
                parsed = json.loads(content)
                output = parsed if isinstance(parsed, dict) else {output_key: parsed}
            except json.JSONDecodeError:
                output = {output_key: content}
        else:
            output = {output_key: content}
        output.setdefault(reasoning_key, reasoning_content)
        return output


def model_name(node: WorkflowNode, app_config: AppConfig | None) -> str | None:
    if app_config is None:
        return node.config.model or None
    configured_names = {model.name for model in app_config.models}
    return node.config.model if node.config.model in configured_names else None
