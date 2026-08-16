import json
import logging

from langchain.tools import ToolRuntime, tool

from app.agents.workflow_agent.graph_builder import WorkflowGraphBuilder
from app.agents.workflow_agent.graph_payload import graph_business_payload
from app.agents.workflow_agent.schemas import (
    WorkflowAgentContext,
    WorkflowAssistantStreamRequest,
    WorkflowGraphInput,
)

logger = logging.getLogger(__name__)


def make_generate_workflow_patch_tool(builder: WorkflowGraphBuilder):
    @tool("generate_workflow_patch", parse_docstring=True)
    async def generate_workflow_patch(
        runtime: ToolRuntime,
        goal: str,
    ) -> str:
        """Delegate workflow Graph generation to the isolated Graph Builder.

        Args:
            goal: Final workflow result to generate.
        """
        parsed_graph, confirmed_mermaid = _generation_inputs(runtime)
        thread_id = _thread_id(runtime)
        logger.info(
            "generate_workflow_patch start: goal_len=%d nodes=%d edges=%d mermaid=%s thread_id=%s",
            len(goal),
            len(parsed_graph.nodes),
            len(parsed_graph.edges),
            bool(confirmed_mermaid),
            thread_id,
        )
        try:
            generated, summary = await builder.build(
                goal=goal,
                graph=parsed_graph,
                confirmed_mermaid=confirmed_mermaid,
                stream_writer=runtime.stream_writer,
                thread_id=thread_id,
            )
        except Exception:
            logger.exception(
                "generate_workflow_patch failed: nodes=%d edges=%d thread_id=%s",
                len(parsed_graph.nodes),
                len(parsed_graph.edges),
                thread_id,
            )
            raise
        logger.info(
            "generate_workflow_patch done: summary=%s nodes=%d edges=%d thread_id=%s",
            summary,
            len(generated.nodes),
            len(generated.edges),
            thread_id,
        )
        payload = {
            "summary": summary,
            "graph": graph_business_payload(generated),
        }
        return json.dumps(payload, ensure_ascii=False)

    return generate_workflow_patch


def _generation_inputs(
    runtime: ToolRuntime,
) -> tuple[WorkflowGraphInput, str | None]:
    state = runtime.state
    if not isinstance(state, dict):
        raise ValueError("Workflow runtime state is unavailable")

    raw_request = state.get("workflowAssistant")
    if raw_request is None:
        raise ValueError("Workflow request is unavailable")
    request = WorkflowAssistantStreamRequest.model_validate(raw_request)
    graph = WorkflowGraphInput(
        nodes=request.workflow.nodes,
        edges=request.workflow.edges,
    )

    raw_context = state.get("workflowContext")
    if raw_context is None:
        raise ValueError("Workflow context is unavailable")
    context = WorkflowAgentContext.model_validate(raw_context)

    task = state.get("workflowTask")
    mode = task.get("mode") if isinstance(task, dict) else None
    if mode == "generate":
        if context.plan is None:
            raise ValueError("已确认的流程草图不存在或已过期")
        if context.pendingConfirmation:
            raise ValueError("流程草图尚未确认")

    confirmed_mermaid = (
        context.plan.mermaid
        if context.plan is not None and not context.pendingConfirmation
        else None
    )
    return graph, confirmed_mermaid


def _thread_id(runtime: ToolRuntime) -> str:
    state = runtime.state
    if not isinstance(state, dict):
        return ""
    request = state.get("workflowAssistant")
    return str(request.get("threadId") or "") if isinstance(request, dict) else ""
