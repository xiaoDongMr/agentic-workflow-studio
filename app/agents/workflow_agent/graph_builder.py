from __future__ import annotations

import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any, override

from langchain.agents import create_agent
from langchain.agents.middleware import AgentMiddleware
from langchain.agents.middleware.types import (
    ModelCallResult,
    ModelRequest,
    ModelResponse,
)
from langchain.tools import tool
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage

from app.agents.workflow_agent.events import workflow_event_type
from app.agents.workflow_agent.graph_payload import (
    graph_business_payload,
)
from app.agents.workflow_agent.model_output import (
    model_output_event,
    model_output_delta_text,
    model_output_id_from_result,
)
from app.agents.workflow_agent.node_skill_registry import (
    NODE_SKILL_NAMES,
    NodeSkillRegistry,
    render_node_skills_prompt,
)
from app.agents.workflow_agent.node_skill_runner import NodeSkillScriptRunner
from app.agents.workflow_agent.schemas import WorkflowGraphInput
from app.agents.workflow_agent.tools.execute_node_skill_script import (
    make_execute_node_skill_script_tool,
)
from app.agents.workflow_agent.tools.read_node_skill_file import (
    make_read_node_skill_file_tool,
)
from app.agents.workflow_agent.tools.update_current_graph import (
    make_update_current_graph_tool,
)
from deerflow.agents.middlewares.dangling_tool_call_middleware import (
    DanglingToolCallMiddleware,
)
from deerflow.agents.middlewares.token_usage_middleware import (
    TokenUsageMiddleware,
)
from deerflow.agents.middlewares.tool_error_handling_middleware import (
    ToolErrorHandlingMiddleware,
)
from deerflow.config.app_config import AppConfig

logger = logging.getLogger(__name__)


GRAPH_BUILDER_SYSTEM_PROMPT = """
你是 Workflow Graph Builder。

输入：
- goal：最终要实现的业务结果。
- graph：当前完整 Graph，是本次修改的初始状态。
- confirmedMermaid：可选的已确认拓扑；存在时保持其节点和连线语义。

现有 Graph 是权威状态：
- 已存在且无需修改的节点直接复用，不读取 Skill、不更新、不发布。
- graph 中已存在 start 节点时，confirmedMermaid 中的“开始”必须映射到该 start 节点，禁止调用 build_node 创建新的 start 节点。
- 生成完整流程时，从现有 start 后的第一个业务节点开始逐个 build，并连接到 start。

执行：
1. 每一轮只能调用一个工具，禁止在同一次响应中批量调用多个工具。
2. 禁止一次性生成多个节点；必须按节点逐个生成或修改。
3. 首次处理一种节点类型前，用 Skill 目录中的路径调用 read_file。
4. Skill 是节点字段和配置的唯一依据。
5. 每个节点必须按顺序执行：
   a. read_file：首次处理该节点类型时读取对应 SKILL.md。
   b. 按 SKILL.md 调用零个或多个辅助脚本，例如 list_input_sources、list_models、resolve_model_config；辅助脚本返回后继续，不要结束。
   c. 调用一次 build_node 或 update_node，取得一个完整 node。
   d. update_current_graph：只写入这个完整 node，以及与它直接相关的边。
   e. return_workflow_graph：立即发布当前完整 Graph。
6. 完成一个节点的 return_workflow_graph 后，才允许开始下一个节点。
7. 每次 update_current_graph 后，下一轮必须只调用 return_workflow_graph；发布完成前禁止继续调用 read_file、execute_node_skill_script 或 update_current_graph。
8. 禁止一次性提交多个未生成节点之间的边。
9. update_current_graph 返回的 graph 是新的权威状态，替代此前的 graph。
10. 非最后一个节点传 done=false；最后一个节点传 done=true。
11. 不自行输出最终文本，必须以 done=true 完成本次任务。

update_node 的 changes 语义：
- object 递归合并，array 整体替换，scalar 直接替换。
- 未出现的字段保持不变。
- 修改数组中任意元素时，changes 必须包含该数组的完整新值。
""".strip()


class GraphBuilderEmptyResponseRetryMiddleware(AgentMiddleware):
    def __init__(self, *, is_completed: Callable[[], bool]) -> None:
        super().__init__()
        self._is_completed = is_completed

    @override
    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelCallResult:
        response = handler(request)
        if self._is_completed() or not _is_empty_model_response(response):
            return response
        logger.warning("workflow graph builder received empty model response; retrying once")
        return handler(self._retry_request(request))

    @override
    async def awrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], Awaitable[ModelResponse]],
    ) -> ModelCallResult:
        response = await handler(request)
        if self._is_completed() or not _is_empty_model_response(response):
            return response
        logger.warning("workflow graph builder received empty model response; retrying once")
        return await handler(self._retry_request(request))

    @staticmethod
    def _retry_request(request: ModelRequest) -> ModelRequest:
        return request.override(
            messages=[
                *request.messages,
                HumanMessage(
                    content=(
                        "上一轮响应为空，Graph 尚未完成。请根据当前工具结果继续调用"
                        "下一步工具；完成最后一个节点后必须调用 "
                        "return_workflow_graph(done=true)。"
                    )
                ),
            ]
        )


class WorkflowGraphBuilder:
    def __init__(
        self,
        *,
        model: BaseChatModel,
        app_config: AppConfig,
        registry: NodeSkillRegistry | None = None,
    ) -> None:
        self._model = model
        self._app_config = app_config
        self._registry = registry or NodeSkillRegistry()

    async def build(
        self,
        *,
        goal: str,
        graph: WorkflowGraphInput,
        confirmed_mermaid: str | None,
        stream_writer: Callable[[dict[str, Any]], None] | None = None,
        thread_id: str = "",
    ) -> tuple[WorkflowGraphInput, str]:
        if not goal.strip():
            raise ValueError("goal is required")
        logger.info(
            "workflow graph builder start: goal_len=%d nodes=%d edges=%d mermaid=%s thread_id=%s",
            len(goal),
            len(graph.nodes),
            len(graph.edges),
            bool(confirmed_mermaid),
            thread_id,
        )
        current_graph = graph.model_copy(deep=True)
        allowed_types = set(NODE_SKILL_NAMES)
        loaded_skills = self._registry.load_many(allowed_types)
        latest_snapshot: dict[str, Any] = {}
        final_result: dict[str, Any] = {}
        read_node_types: set[str] = set()
        graph_revision = 0
        published_revision = 0
        completed = False
        last_summary = ""
        runner = NodeSkillScriptRunner(self._registry)
        skill_context = {
            "graph": current_graph,
            "models": [
                _model_payload(model)
                for model in getattr(self._app_config, "models", []) or []
            ]
        }

        async def record_skill_read(
            node_type: str,
            path: str,
        ) -> dict[str, Any] | None:
            if path != "SKILL.md":
                return None
            read_node_types.add(node_type)
            logger.info(
                "workflow graph builder skill read: node_type=%s path=%s read_types=%s",
                node_type,
                path,
                sorted(read_node_types),
            )
            return None

        read_file = make_read_node_skill_file_tool(
            self._registry,
            loaded_skills=loaded_skills,
            on_read=record_skill_read,
        )
        execute_node_skill_script = make_execute_node_skill_script_tool(
            runner,
            skills=loaded_skills,
            read_node_types=read_node_types,
            runtime_context=skill_context,
        )

        def require_previous_snapshot() -> None:
            if completed:
                raise ValueError("Graph generation is already complete")
            if graph_revision != published_revision:
                raise ValueError(
                    "Call return_workflow_graph before the next Graph update"
                )

        def record_graph_update() -> None:
            nonlocal graph_revision
            graph_revision += 1
            logger.info(
                "workflow graph builder graph updated: revision=%d nodes=%d edges=%d",
                graph_revision,
                len(current_graph.nodes),
                len(current_graph.edges),
            )

        update_current_graph = make_update_current_graph_tool(
            graph=current_graph,
            before_update=require_previous_snapshot,
            on_update=record_graph_update,
        )

        def publish_current_graph(summary: str, *, emit: bool = True) -> str:
            snapshot_summary = summary.strip() or "工作流已更新"
            payload = {
                "summary": snapshot_summary,
                "graph": graph_business_payload(current_graph),
            }
            if emit and stream_writer is not None:
                stream_writer(
                    {
                        "type": workflow_event_type("workflowGraph"),
                        "threadId": thread_id,
                        **payload,
                    }
                )
            latest_snapshot["graph"] = current_graph.model_copy(deep=True)
            latest_snapshot["summary"] = snapshot_summary
            logger.info(
                "workflow graph builder graph published: summary=%s emit=%s nodes=%d edges=%d",
                snapshot_summary,
                emit,
                len(current_graph.nodes),
                len(current_graph.edges),
            )
            return json.dumps(payload, ensure_ascii=False)

        def record_final_graph(summary: str) -> None:
            final_summary = summary.strip() or "工作流已生成"
            final_result["graph"] = current_graph.model_copy(deep=True)
            final_result["summary"] = final_summary
            logger.info(
                "workflow graph builder final graph recorded: summary=%s nodes=%d edges=%d",
                final_summary,
                len(current_graph.nodes),
                len(current_graph.edges),
            )

        @tool("return_workflow_graph", parse_docstring=True)
        def return_workflow_graph(
            summary: str,
            done: bool,
        ) -> str:
            """Publish the current complete Graph after one node update.

            Args:
                summary: Short description of this Graph update.
                done: True only after the final node update.
            """
            nonlocal completed, published_revision, last_summary
            logger.info(
                "workflow graph builder return_workflow_graph called: done=%s revision=%d published=%d summary=%s",
                done,
                graph_revision,
                published_revision,
                summary,
            )
            if completed:
                raise ValueError("Graph generation is already complete")
            if graph_revision == published_revision and not latest_snapshot:
                raise ValueError("No unpublished Graph update")
            last_summary = summary.strip() or last_summary
            if graph_revision == published_revision:
                if done:
                    completed = True
                    record_final_graph(last_summary)
                return publish_current_graph(last_summary, emit=False)
            published_revision = graph_revision
            payload = publish_current_graph(last_summary)
            if done:
                completed = True
                record_final_graph(last_summary)
            return payload

        prompt = GRAPH_BUILDER_SYSTEM_PROMPT
        skills_prompt = render_node_skills_prompt(loaded_skills)
        if skills_prompt:
            prompt = f"{prompt}\n\n{skills_prompt}"
        agent = create_agent(
            model=self._model,
            tools=[
                read_file,
                execute_node_skill_script,
                update_current_graph,
                return_workflow_graph,
            ],
            system_prompt=prompt,
            middleware=_build_graph_builder_middlewares(
                self._app_config,
                is_completed=lambda: completed,
            ),
            name="workflow-graph-builder",
        )
        agent_input = {
            "messages": [
                HumanMessage(
                    content=self._build_task_prompt(
                        goal=goal,
                        graph=graph,
                        confirmed_mermaid=confirmed_mermaid,
                    )
                )
            ]
        }
        agent_result: dict[str, Any] = {}
        async for mode, chunk in agent.astream(
            agent_input,
            config={
                "recursion_limit": 120,
                "tags": ["subagent:workflow-graph-builder"],
            },
            stream_mode=["values", "messages"],
        ):
            if mode == "values":
                if isinstance(chunk, dict):
                    agent_result = chunk
                continue
            if mode != "messages" or stream_writer is None:
                continue
            message_chunk = (
                chunk[0]
                if isinstance(chunk, tuple) and len(chunk) == 2
                else chunk
            )
            content = model_output_delta_text(message_chunk)
            if not content:
                continue
            event = model_output_event(
                thread_id=thread_id,
                actor="graph-builder",
                actor_label="画布生成器",
                output_id=model_output_id_from_result(message_chunk),
                content=content,
            )
            if event is not None:
                try:
                    stream_writer(event)
                except Exception:
                    logger.debug(
                        "workflow graph builder model delta event failed",
                        exc_info=True,
                    )
        logger.info(
            "workflow graph builder agent finished: completed=%s revision=%d published=%d has_result=%s last_message=%s",
            completed,
            graph_revision,
            published_revision,
            "graph" in final_result,
            _last_agent_message(agent_result),
        )
        if not completed and graph_revision != published_revision:
            logger.warning(
                "workflow graph builder auto-publishing unfinished snapshot: revision=%d published=%d",
                graph_revision,
                published_revision,
            )
            published_revision = graph_revision
            publish_current_graph(last_summary or "工作流已更新")
        if not completed:
            logger.error(
                "workflow graph builder stopped before final graph: revision=%d published=%d has_snapshot=%s last_message=%s",
                graph_revision,
                published_revision,
                "graph" in latest_snapshot,
                _last_agent_message(agent_result),
            )
            raise ValueError(
                "Graph Builder stopped before return_workflow_graph(done=true). "
                f"Last agent message: {_last_agent_message(agent_result)}"
            )
        result = final_result.get("graph")
        if not isinstance(result, WorkflowGraphInput):
            logger.error(
                "workflow graph builder produced no graph: nodes=%d edges=%d last_message=%s",
                len(current_graph.nodes),
                len(current_graph.edges),
                _last_agent_message(agent_result),
            )
            raise ValueError(
                "Graph Builder did not produce a workflow graph. "
                f"Last agent message: {_last_agent_message(agent_result)}"
            )
        return result, str(final_result["summary"])

    @staticmethod
    def _build_task_prompt(
        *,
        goal: str,
        graph: WorkflowGraphInput,
        confirmed_mermaid: str | None,
    ) -> str:
        payload = {
            "goal": goal,
            "graph": graph_business_payload(graph),
        }
        if confirmed_mermaid:
            payload["confirmedMermaid"] = confirmed_mermaid
        return (
            "本次任务输入：\n"
            + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        )


def _model_payload(model: Any) -> dict[str, Any]:
    if hasattr(model, "model_dump"):
        raw = model.model_dump()
    elif isinstance(model, dict):
        raw = dict(model)
    else:
        raw = {
            key: getattr(model, key)
            for key in dir(model)
            if not key.startswith("_") and not callable(getattr(model, key))
        }
    return {
        "name": str(raw.get("name") or raw.get("model") or ""),
        "display_name": str(raw.get("display_name") or ""),
        "supports_vision": bool(
            raw.get("supports_vision", raw.get("supportsVision"))
        ),
        "supports_thinking": bool(
            raw.get("supports_thinking", raw.get("supportsThinking"))
        ),
        "supports_reasoning_effort": bool(
            raw.get(
                "supports_reasoning_effort",
                raw.get("supportsReasoningEffort"),
            )
        ),
    }


def _build_graph_builder_middlewares(
    app_config: AppConfig,
    *,
    is_completed: Callable[[], bool],
) -> list[Any]:
    middlewares: list[Any] = [
        DanglingToolCallMiddleware(),
        ToolErrorHandlingMiddleware(),
        GraphBuilderEmptyResponseRetryMiddleware(
            is_completed=is_completed,
        ),
    ]
    if app_config.token_usage.enabled:
        middlewares.insert(1, TokenUsageMiddleware())
    return middlewares


def _is_empty_model_response(response: ModelCallResult) -> bool:
    message: AIMessage | None = None
    if isinstance(response, AIMessage):
        message = response
    else:
        result = getattr(response, "result", None)
        if isinstance(result, list) and result:
            candidate = result[-1]
            if isinstance(candidate, AIMessage):
                message = candidate
    if message is None or message.tool_calls:
        return False
    content = message.content
    if isinstance(content, str):
        return not content.strip()
    return not content


def _last_agent_message(agent_result: Any) -> str:
    if not isinstance(agent_result, dict):
        return ""
    messages = agent_result.get("messages")
    if not isinstance(messages, list) or not messages:
        return ""
    message = messages[-1]
    content = getattr(message, "content", "")
    if isinstance(content, str):
        return content[:1000]
    return str(content)[:1000]
