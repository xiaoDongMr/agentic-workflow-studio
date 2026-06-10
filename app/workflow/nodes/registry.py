from __future__ import annotations

import logging
import time

from deerflow.config.app_config import AppConfig

from app.schemas.workflow import WorkflowNode
from app.services.workflow_events import build_workflow_event, emit_workflow_event
from app.workflow.nodes.code import CodeNodeExecutor
from app.workflow.nodes.end import EndNodeExecutor
from app.workflow.nodes.fallback import FallbackNodeExecutor
from app.workflow.nodes.llm import LlmNodeExecutor
from app.workflow.nodes.loop import LoopNodeExecutor
from app.workflow.nodes.selector import SelectorNodeExecutor
from app.workflow.nodes.start import StartNodeExecutor
from app.workflow.services.input_mapping import build_node_input
from app.workflow.services.output_store import append_step, store_node_output
from app.workflow.services.value_casting import coerce_by_io_definitions
from app.workflow.state import WorkflowNodeExecutor, WorkflowState

logger = logging.getLogger(__name__)


class WorkflowNodeExecutorRegistry:
    def __init__(self, app_config: AppConfig | None):
        self._fallback = FallbackNodeExecutor()
        self._executors: dict[str, WorkflowNodeExecutor] = {
            "start": StartNodeExecutor(),
            "llm": LlmNodeExecutor(app_config),
            "selector": SelectorNodeExecutor(),
            "loop": LoopNodeExecutor(app_config),
            "code": CodeNodeExecutor(),
            "end": EndNodeExecutor(),
        }

    def get(self, node_type: str) -> WorkflowNodeExecutor:
        return self._executors.get(node_type, self._fallback)

    def make_node_callable(self, node: WorkflowNode):
        async def execute(state: WorkflowState) -> WorkflowState:
            started_at = time.perf_counter()
            node_input = build_node_input(node, state)
            emit_workflow_event(build_workflow_event(
                "node_started",
                node_id=node.id,
                node_title=node.title,
                title="节点开始执行",
                message=f"{node.title} 执行中",
                data={"inputKeys": list(node_input.keys()), "nodeType": node.type},
            ))
            try:
                executor = self.get(node.type)
                node_output = {"skipped": True} if not node.config.enabled else await executor.run(node, node_input, state)
                node_output = coerce_by_io_definitions(node_output, node.outputs)
                duration_ms = round((time.perf_counter() - started_at) * 1000)
                output_update = store_node_output(node, node_output)
                emit_workflow_event(build_workflow_event(
                    "node_completed",
                    node_id=node.id,
                    node_title=node.title,
                    title="节点执行完成",
                    message=f"{node.title} 执行完成",
                    duration_ms=duration_ms,
                    data={"outputKeys": list(node_output.keys()), "nodeType": node.type},
                ))
                step_update = append_step(node, node_input, node_output, duration_ms)
                return {**output_update, **step_update}
            except Exception as exc:
                duration_ms = round((time.perf_counter() - started_at) * 1000)
                logger.exception("节点执行失败: id=%s type=%s", node.id, node.type)
                error_output = {"error": str(exc)}
                output_update = store_node_output(node, error_output)
                emit_workflow_event(build_workflow_event(
                    "node_failed",
                    node_id=node.id,
                    node_title=node.title,
                    level="error",
                    title="节点执行失败",
                    message=str(exc),
                    duration_ms=duration_ms,
                    error=str(exc),
                    data={"nodeType": node.type},
                ))
                step_update = append_step(node, node_input, error_output, duration_ms, error=str(exc))
                return {**output_update, **step_update}

        return execute
