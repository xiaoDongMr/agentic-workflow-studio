from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from deerflow.config.app_config import AppConfig

from app.schemas.workflow import WorkflowDocument
from app.workflow.engine.graph_compiler import WorkflowGraphCompiler
from app.workflow.nodes.registry import WorkflowNodeExecutorRegistry
from app.workflow.state import WorkflowRunEvent, WorkflowState


class WorkflowRunner:
    def __init__(self, app_config: AppConfig):
        self.app_config = app_config
        self.node_executors = WorkflowNodeExecutorRegistry(app_config)
        self.graph_compiler = WorkflowGraphCompiler(self.node_executors)
        self.node_executors.configure_loop_subgraph_runtime(
            compile_workflow=self.graph_compiler.compile,
            run_compiled_from_state=self.run_compiled_from_state,
        )

    async def run(self, workflow: WorkflowDocument, run_input: dict[str, Any]) -> dict[str, Any]:
        final_result: dict[str, Any] | None = None
        async for event in self.stream(workflow, run_input):
            if event["type"] == "final":
                final_result = event["data"]
            elif event["type"] == "error":
                raise RuntimeError(str(event["data"].get("message") or "工作流执行失败"))

        if final_result is None:
            raise RuntimeError("工作流未返回最终结果")
        return final_result

    async def stream(self, workflow: WorkflowDocument, run_input: dict[str, Any]) -> AsyncIterator[WorkflowRunEvent]:
        compiled = self.graph_compiler.compile(workflow)
        initial_state = initial_workflow_state(run_input)
        last_step_count = 0
        final_state: WorkflowState | None = None

        yield {
            "type": "metadata",
            "data": {
                "workflowId": workflow.id,
                "workflowName": workflow.name,
            },
        }

        try:
            async for item in compiled.astream(initial_state, stream_mode=["values", "custom"]):
                mode, chunk = item if isinstance(item, tuple) and len(item) == 2 else ("values", item)
                if mode == "custom":
                    yield {"type": "workflow_event", "data": chunk}
                    continue
                if mode != "values":
                    continue
                final_state = chunk
                steps = chunk.get("steps", [])
                for step in steps[last_step_count:]:
                    yield {"type": "step", "data": step}
                last_step_count = len(steps)
        except Exception as exc:
            yield {
                "type": "error",
                "data": {
                    "message": str(exc),
                },
            }
            return

        yield {
            "type": "final",
            "data": result_from_state(final_state or initial_state),
        }

    async def run_compiled_from_state(self, compiled_graph: Any, initial_state: WorkflowState) -> WorkflowState:
        return await compiled_graph.ainvoke(initial_state)


def initial_workflow_state(run_input: dict[str, Any]) -> WorkflowState:
    return {
        "input": run_input,
        "variables": {},
        "steps": [],
        "output": {},
    }


def result_from_state(final_state: WorkflowState) -> dict[str, Any]:
    return {
        "output": final_state.get("output", {}),
        "state": {
            "input": final_state.get("input", {}),
            "variables": final_state.get("variables", {}),
        },
        "steps": final_state.get("steps", []),
    }
