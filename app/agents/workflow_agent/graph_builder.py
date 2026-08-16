from __future__ import annotations

import json
import logging
import re
from collections.abc import Awaitable, Callable
from copy import deepcopy
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
    model_tool_decision_text,
)
from app.agents.workflow_agent.node_skill_registry import (
    NODE_SKILL_NAMES,
    NodeSkillRegistry,
    render_node_skills_prompt,
)
from app.agents.workflow_agent.node_skill_runner import NodeSkillScriptRunner
from app.agents.workflow_agent.schemas import (
    WorkflowGraphInput,
    WorkflowNodeCapability,
)
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
from deerflow.agents.middlewares.loop_detection_middleware import (
    LoopDetectionMiddleware,
)
from deerflow.agents.middlewares.token_usage_middleware import (
    TokenUsageMiddleware,
)
from deerflow.agents.middlewares.tool_error_handling_middleware import (
    ToolErrorHandlingMiddleware,
)
from deerflow.config.app_config import AppConfig

logger = logging.getLogger(__name__)

_MERMAID_NODE_DECLARATION = re.compile(
    r"(?:^|[\s;>])([A-Za-z_][A-Za-z0-9_-]*)\s*[\[\(\{]",
    re.MULTILINE,
)
_MIN_RECURSION_LIMIT = 120
_MAX_RECURSION_LIMIT = 800
_RECURSION_BASE_STEPS = 64
_RECURSION_STEPS_PER_NODE = 32
_SCRIPT_TOOL_FREQ_WARN = 80
_SCRIPT_TOOL_FREQ_HARD_LIMIT = 120


GRAPH_BUILDER_SYSTEM_PROMPT = """
你是 Workflow Graph Builder。

输入：
- goal：最终要实现的业务结果。
- workflowId：当前工作流的权威 ID。
- graph：当前完整 Graph，是本次修改的初始状态。
- confirmedMermaid：可选的已确认拓扑；存在时保持其节点和连线语义。

现有 Graph 是权威状态：
- 已存在且无需修改的节点直接复用，不读取 Skill、不更新、不发布。
- graph 中已存在 start 节点时，confirmedMermaid 中的“开始”必须映射到该 start 节点，禁止调用 build_node 创建新的 start 节点。
- confirmedMermaid 中的 A、B、C 等标识只用于描述拓扑，不是真实 Graph 节点 ID；禁止把这些标识写入 edge。
- 生成完整流程时，从现有 start 后的第一个业务节点开始逐个 build，并连接到 start。

执行：
可见输出：每次调用工具时，用一句简短中文说明当前动作；不要输出工具参数或 JSON。
1. 第一轮必须调用 plan_node_capabilities，一次性确定所有待创建或修改节点的 title、nodeType 和简短理由；后续节点类型必须遵守该规划。
2. 能力选择规则：
   - llm：语义理解、方案设计、内容生成、总结分析等需要模型推理的任务。
   - code：仅用于有明确代码逻辑的数据转换、计算，或已有 API/浏览器执行能力的确定性任务；不得因为标题含“执行、搭建、投放”等动词就选择 code。
   - selector：仅用于互斥条件分支；并行执行或策略规划不得使用 selector。
   - loop：同一子流程需要重复执行时使用。
   - end：汇总并输出最终结果。
3. 每一轮只能调用一个工具，禁止在同一次响应中批量调用多个工具。
4. 禁止一次性生成多个节点；必须按节点逐个生成或修改。
5. 首次处理一种节点类型前，用 Skill 目录中的路径调用一次 read_file；同一 Skill 在本次任务中禁止重复读取。
6. Skill 是节点字段和配置的唯一依据。
7. 每个节点必须按顺序执行：
   a. read_file：首次处理该节点类型时读取对应 SKILL.md。
   b. 按 SKILL.md 调用零个或多个辅助脚本，例如 list_input_sources、list_models、resolve_model_config；辅助脚本返回后继续，不要结束。
   c. 调用一次 build_node 或 update_node；脚本返回的完整 node 会由运行时缓存。
   d. update_current_graph：只传与该节点直接相关的完整边；工具会写入节点并立即发布 Graph。
8. edge 端口字段只能使用 sourcePortID 和 targetPortID，禁止使用 sourcePortId、targetPortId 或其他未知字段。
9. 禁止一次性提交多个未生成节点之间的边。
10. 禁止将脚本返回的 node 复制到 update_current_graph 参数。
11. 非最后一个节点调用 update_current_graph 时传 done=false；最后一个节点传 done=true。
12. 不自行输出最终文本，必须以 update_current_graph(done=true) 完成本次任务。
13. 相同模型能力条件下，list_models 和 resolve_model_config 各调用一次并复用结果，禁止为后续同类节点重复查询。
14. edge 的 source 和 target 必须是当前 Graph 已存在节点或本轮刚构建节点的真实 ID；不得提前连接尚未构建的节点。

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
                        "下一步工具；完成最后一个节点时必须调用 "
                        "update_current_graph(done=true)。"
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
        workflow_id: str,
        graph: WorkflowGraphInput,
        confirmed_mermaid: str | None,
        stream_writer: Callable[[dict[str, Any]], None] | None = None,
        thread_id: str = "",
    ) -> tuple[WorkflowGraphInput, str]:
        if not goal.strip():
            raise ValueError("goal is required")
        if not workflow_id.strip():
            raise ValueError("workflow_id is required")
        logger.info(
            "workflow graph builder start: workflow_id=%s goal_len=%d nodes=%d edges=%d mermaid=%s thread_id=%s",
            workflow_id,
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
        pending_node: dict[str, Any] | None = None
        capability_plan: dict[str, str] = {}
        capabilities_planned = False
        runner = NodeSkillScriptRunner(self._registry)
        skill_context = {
            "workflowId": workflow_id,
            "graph": current_graph,
            "models": [
                _model_payload(model)
                for model in getattr(self._app_config, "models", []) or []
            ]
        }

        @tool("plan_node_capabilities", parse_docstring=True)
        def plan_node_capabilities(
            nodes: list[WorkflowNodeCapability],
        ) -> str:
            """Set node capability types before reading or executing Node Skills.

            Args:
                nodes: All nodes that will be created or modified in this run.
            """
            nonlocal capabilities_planned
            if capabilities_planned:
                raise ValueError("Node capabilities have already been planned")
            if not nodes:
                raise ValueError("At least one node capability is required")
            next_plan: dict[str, str] = {}
            for item in nodes:
                title = item.title.strip()
                if title in next_plan:
                    raise ValueError(f"Duplicate node capability title: {title}")
                next_plan[title] = item.nodeType
            capability_plan.update(next_plan)
            capabilities_planned = True
            return json.dumps(
                {
                    "ok": True,
                    "plannedNodeCount": len(capability_plan),
                },
                ensure_ascii=False,
            )

        def require_capability_plan() -> None:
            if not capabilities_planned:
                raise ValueError(
                    "Call plan_node_capabilities before executing Node Skills"
                )

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

        def record_node_result(node: dict[str, Any]) -> None:
            nonlocal pending_node
            require_capability_plan()
            if completed:
                raise ValueError("Graph generation is already complete")
            if graph_revision != published_revision:
                raise ValueError(
                    "The previous Graph update was not published"
                )
            if pending_node is not None:
                raise ValueError(
                    "Call update_current_graph before generating another node"
                )
            title = str(node.get("title") or "").strip()
            planned_type = capability_plan.get(title)
            if planned_type is None:
                raise ValueError(
                    f"Node {title!r} was not declared in plan_node_capabilities"
                )
            actual_type = str(node.get("type") or "")
            if actual_type != planned_type:
                raise ValueError(
                    f"Node {title!r} must use planned type {planned_type!r}, "
                    f"got {actual_type!r}"
                )
            pending_node = deepcopy(node)
            logger.info(
                "workflow graph builder cached node: id=%s type=%s",
                pending_node.get("id"),
                pending_node.get("type"),
            )

        def get_pending_node() -> dict[str, Any] | None:
            return pending_node

        def clear_pending_node() -> None:
            nonlocal pending_node
            pending_node = None

        execute_node_skill_script = make_execute_node_skill_script_tool(
            runner,
            skills=loaded_skills,
            read_node_types=read_node_types,
            runtime_context=skill_context,
            on_node_result=record_node_result,
            before_execute=require_capability_plan,
        )

        def require_previous_snapshot() -> None:
            if completed:
                raise ValueError("Graph generation is already complete")
            if graph_revision != published_revision:
                raise ValueError(
                    "The previous Graph update was not published"
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

        def publish_current_graph(summary: str, *, emit: bool = True) -> None:
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

        def publish_updated_graph(done: bool) -> str:
            nonlocal completed, published_revision
            summary = "工作流已生成" if done else "工作流已更新"
            logger.info(
                "workflow graph builder publishing update: done=%s revision=%d published=%d",
                done,
                graph_revision,
                published_revision,
            )
            if completed:
                raise ValueError("Graph generation is already complete")
            if graph_revision == published_revision:
                raise ValueError("No unpublished Graph update")
            published_revision = graph_revision
            publish_current_graph(summary)
            if done:
                completed = True
                record_final_graph(summary)
            return json.dumps(
                {
                    "ok": True,
                    "revision": published_revision,
                    "done": done,
                    "nodeCount": len(current_graph.nodes),
                    "edgeCount": len(current_graph.edges),
                },
                ensure_ascii=False,
            )

        update_current_graph = make_update_current_graph_tool(
            graph=current_graph,
            get_pending_node=get_pending_node,
            before_update=require_previous_snapshot,
            on_update=record_graph_update,
            on_node_applied=clear_pending_node,
            after_update=publish_updated_graph,
        )

        prompt = GRAPH_BUILDER_SYSTEM_PROMPT
        skills_prompt = render_node_skills_prompt(loaded_skills)
        if skills_prompt:
            prompt = f"{prompt}\n\n{skills_prompt}"
        agent = create_agent(
            model=self._model,
            tools=[
                plan_node_capabilities,
                read_file,
                execute_node_skill_script,
                update_current_graph,
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
                        workflow_id=workflow_id,
                        graph=graph,
                        confirmed_mermaid=confirmed_mermaid,
                    )
                )
            ]
        }
        recursion_limit = _graph_builder_recursion_limit(
            graph,
            confirmed_mermaid,
        )
        logger.info(
            "workflow graph builder recursion budget: limit=%d estimated_nodes=%d",
            recursion_limit,
            _estimated_target_node_count(graph, confirmed_mermaid),
        )
        agent_result: dict[str, Any] = {}
        emitted_decision_ids: set[str] = set()
        async for mode, chunk in agent.astream(
            agent_input,
            config={
                "recursion_limit": recursion_limit,
                "tags": ["subagent:workflow-graph-builder"],
            },
            stream_mode=["values", "messages"],
        ):
            if mode == "values":
                if isinstance(chunk, dict):
                    agent_result = chunk
                    _emit_graph_builder_tool_decision(
                        chunk,
                        stream_writer=stream_writer,
                        thread_id=thread_id,
                        emitted_ids=emitted_decision_ids,
                    )
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
            publish_current_graph("工作流已更新")
        if not completed:
            last_message = _last_agent_message(agent_result)
            logger.error(
                "workflow graph builder stopped before final graph: revision=%d published=%d has_snapshot=%s last_message=%s",
                graph_revision,
                published_revision,
                "graph" in latest_snapshot,
                last_message,
            )
            if "[FORCED STOP]" in last_message:
                raise ValueError(
                    "Graph Builder detected repeated tool calls and stopped "
                    "before completing the workflow"
                )
            raise ValueError(
                "Graph Builder stopped before update_current_graph(done=true). "
                f"Last agent message: {last_message}"
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
        workflow_id: str,
        graph: WorkflowGraphInput,
        confirmed_mermaid: str | None,
    ) -> str:
        payload = {
            "goal": goal,
            "workflowId": workflow_id,
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
    if app_config.loop_detection.enabled:
        middlewares.append(_make_graph_builder_loop_detection(app_config.loop_detection))
    return middlewares


def _make_graph_builder_loop_detection(config: Any) -> LoopDetectionMiddleware:
    tool_freq_overrides = {
        name: (override.warn, override.hard_limit)
        for name, override in config.tool_freq_overrides.items()
    }
    configured_script_limits = tool_freq_overrides.get(
        "execute_node_skill_script",
        (0, 0),
    )
    tool_freq_overrides["execute_node_skill_script"] = (
        max(configured_script_limits[0], _SCRIPT_TOOL_FREQ_WARN),
        max(configured_script_limits[1], _SCRIPT_TOOL_FREQ_HARD_LIMIT),
    )
    return LoopDetectionMiddleware(
        # The generic identical-call fingerprint collapses script calls by path.
        # Graph Builder scripts share a path across distinct functions, so rely
        # on per-tool frequency and the builder recursion budget for this agent.
        warn_threshold=_MAX_RECURSION_LIMIT + 1,
        hard_limit=_MAX_RECURSION_LIMIT + 1,
        window_size=config.window_size,
        max_tracked_threads=config.max_tracked_threads,
        tool_freq_warn=config.tool_freq_warn,
        tool_freq_hard_limit=config.tool_freq_hard_limit,
        tool_freq_overrides=tool_freq_overrides,
    )


def _estimated_target_node_count(
    graph: WorkflowGraphInput,
    confirmed_mermaid: str | None,
) -> int:
    mermaid_node_ids = (
        set(_MERMAID_NODE_DECLARATION.findall(confirmed_mermaid))
        if confirmed_mermaid
        else set()
    )
    return max(len(graph.nodes), len(mermaid_node_ids), 1)


def _graph_builder_recursion_limit(
    graph: WorkflowGraphInput,
    confirmed_mermaid: str | None,
) -> int:
    estimated_nodes = _estimated_target_node_count(graph, confirmed_mermaid)
    return min(
        _MAX_RECURSION_LIMIT,
        max(
            _MIN_RECURSION_LIMIT,
            _RECURSION_BASE_STEPS
            + estimated_nodes * _RECURSION_STEPS_PER_NODE,
        ),
    )


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


def _emit_graph_builder_tool_decision(
    state: dict[str, Any],
    *,
    stream_writer: Callable[[dict[str, Any]], None] | None,
    thread_id: str,
    emitted_ids: set[str],
) -> None:
    if stream_writer is None:
        return
    messages = state.get("messages")
    if not isinstance(messages, list) or not messages:
        return
    message = messages[-1]
    if not isinstance(message, AIMessage):
        return
    if model_output_delta_text(message):
        return
    content = model_tool_decision_text(message)
    if not content:
        return
    tool_call_ids = [
        str(call.get("id") or "")
        for call in message.tool_calls
        if str(call.get("id") or "")
    ]
    output_id = (
        f"decision-{'|'.join(tool_call_ids)}"
        if tool_call_ids
        else model_output_id_from_result(message)
    )
    if not output_id or output_id in emitted_ids:
        return
    emitted_ids.add(output_id)
    event = model_output_event(
        thread_id=thread_id,
        actor="graph-builder",
        actor_label="画布生成器",
        output_id=output_id,
        content=content,
    )
    if event is None:
        return
    try:
        stream_writer(event)
    except Exception:
        logger.debug(
            "workflow graph builder tool decision event failed",
            exc_info=True,
        )
