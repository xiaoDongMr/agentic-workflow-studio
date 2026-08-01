# Agent 平台化与 Workflow Agent 改造方案

## 目标

引入一套轻量 Agent 平台结构，让 `lead_agent`、`workflow-agent` 和未来平台创建的 Agent 复用同一套运行入口、模型、Skill、Tool、Middleware、MCP 与 LangGraph 流式协议。

核心要求：

- 统一入口：所有 Agent 通过 `/api/threads/{thread_id}/runs/stream` 执行。
- 统一流式结构：返回 LangGraph `values` / `messages` / `custom`。
- 统一注册：通过 `assistant_id` 解析 Agent 定义和运行工厂。
- 业务隔离：平台与 workflow-agent 代码放在业务层，不写入 `app/harness/deerflow`。
- 底座可替换：`app/harness/deerflow` 只作为开源运行时依赖。
- 工作流确定性：`workflow-agent` 保留业务状态机，不退化为普通聊天 Agent。

## 总体架构

```text
/api/threads/{thread_id}/runs/stream
  -> assistant_id
  -> AgentRegistry
  -> AgentDefinition
  -> AgentRuntimeFactory
  -> LangGraph runtime
  -> values / messages / custom
```

新增业务层模块：

```text
app/agent_platform/
  definition.py
  registry.py
  runtime_factory.py
  builtins.py

app/agents/workflow_agent/
  graph.py
  orchestrator.py
  llm.py
  events.py
  tools/
```

不在 `app/harness/deerflow` 新增业务 Agent，避免影响后续开源底座升级或替换。

## AgentDefinition

第一期不要设计过多 Agent 类型。平台只描述如何创建 LangGraph runtime。

```py
class AgentDefinition(BaseModel):
    id: str
    name: str
    description: str = ""
    builtin: bool = False
    enabled: bool = True

    runtime: AgentRuntimeDefinition
    model: AgentModelConfig = AgentModelConfig()
    prompt: AgentPromptConfig = AgentPromptConfig()
    skills: list[str] | None = None
    tools: AgentToolConfig = AgentToolConfig()
    middleware: AgentMiddlewareConfig = AgentMiddlewareConfig()
    metadata: dict[str, Any] = Field(default_factory=dict)


class AgentRuntimeDefinition(BaseModel):
    kind: Literal["react_agent", "workflow_graph"]
    factory: str
    stream_modes: list[str] = Field(default_factory=lambda: ["values", "messages", "custom"])
    max_turns: int | None = None
    timeout_seconds: int | None = None
```

`runtime.kind` 只保留两类：

- `react_agent`：通用工具调用 Agent，例如现有 `lead_agent`。
- `workflow_graph`：确定性业务编排 Graph，例如 `workflow-agent`。

## AgentRegistry

`AgentRegistry` 根据 `assistant_id` 返回 `AgentDefinition`。

第一期只需要支持内置定义：

```py
class AgentRegistry:
    def resolve(self, assistant_id: str | None) -> AgentDefinition:
        normalized = normalize_assistant_id(assistant_id or "lead_agent")
        definition = self._builtin.get(normalized)
        if definition:
            return definition
        raise ValueError(f"Unknown assistant_id: {assistant_id}")
```

后续再扩展数据库定义、租户定义和版本管理。

## AgentRuntimeFactory

`AgentRuntimeFactory` 根据 `AgentDefinition.runtime.factory` 创建运行工厂。

```py
class AgentRuntimeFactory:
    def create_factory(self, definition: AgentDefinition):
        factory = resolve_variable(definition.runtime.factory)
        return bind_definition(factory, definition)
```

`RunService` 从固定 `make_lead_agent` 改为：

```py
definition = agent_registry.resolve(body.assistant_id)
agent_factory = agent_runtime_factory.create_factory(definition)
```

## 内置 Agent

### lead_agent

`lead_agent` 注册为默认内置 Agent，保持现有行为。

```yaml
id: lead_agent
name: 通用助手
builtin: true
runtime:
  kind: react_agent
  factory: deerflow.agents.lead_agent.agent:make_lead_agent
  streamModes: [values, messages, custom]
```

注册它是为了消除默认 Agent 硬编码分支，不是改造现有 `lead_agent`。

### workflow-agent

`workflow-agent` 是工作流画布专属 Agent。

```yaml
id: workflow-agent
name: 工作流画布助手
builtin: true
runtime:
  kind: workflow_graph
  factory: app.agents.workflow_agent.graph:make_workflow_agent
  streamModes: [values, messages, custom]
  maxTurns: 30
  timeoutSeconds: 900
model:
  name: default
  thinkingEnabled: false
tools:
  allowed:
    - describe_workflow
    - build_workflow_patch
    - validate_workflow_patch
    - run_node_skill
    - validate_python_node_code
```

不单独设计 `sandbox` 配置段。沙箱和 MCP 能力复用现有 DeerFlow runtime，通过 tool groups、allowlist、denylist、MCP server 和 middleware 控制。

## Workflow Agent 实现

### 运行结构

```text
make_workflow_agent()
  -> StateGraph
    -> workflow_agent_node
      -> WorkflowAgentOrchestrator
        -> WorkflowGenerationModel
        -> WorkflowPatch builder / validator
        -> tools / MCP tools
      -> custom workflow.* events
```

### graph.py

`graph.py` 提供 LangGraph runtime factory。

```py
class WorkflowAgentState(TypedDict, total=False):
    workflowAssistant: dict[str, Any]


async def workflow_agent_node(state: WorkflowAgentState, config: RunnableConfig):
    writer = get_stream_writer()
    app_config = resolve_app_config(config)
    request = WorkflowAssistantStreamRequest.model_validate(state["workflowAssistant"])
    orchestrator = WorkflowAgentOrchestrator(app_config)

    async for event_name, payload in orchestrator.stream(request):
        writer({"type": f"workflow.{event_name}", **payload})

    return state
```

### orchestrator.py

`WorkflowAgentOrchestrator` 是 workflow-agent 的业务编排层。

职责：

- 根据 `clientEvent` 推进阶段。
- 管理 `threadId`、Mermaid plan、当前 stage 和修复次数。
- 调用 LLM 组件生成澄清、Mermaid、阶段 patch、修复 patch。
- 调用 patch builder 做 schema normalize。
- 输出 `workflow.*` custom event。

它不是 middleware。middleware 处理鉴权、错误处理、沙箱上下文、token 统计、审计等横切能力；workflow 生成流程是业务状态机。

### llm.py

`WorkflowGenerationModel` 是 workflow-agent 的领域 LLM 组件。

职责：

- `plan()`：生成澄清问题或 Mermaid plan。
- `generate_stage()`：生成当前阶段 patch 草稿。
- `repair()`：根据前端校验错误生成修复 patch 草稿。

### events.py

统一 workflow 业务事件名称：

```text
workflow.session
workflow.message
workflow.clarification
workflow.planPreview
workflow.patchStage
workflow.workflowPatch
workflow.fixing
workflow.complete
workflow.error
workflow.end
```

## 前端协议

前端改为调用：

```http
POST /api/threads/{thread_id}/runs/stream
```

请求体：

```json
{
  "assistant_id": "workflow-agent",
  "stream_mode": ["values", "messages", "custom"],
  "input": {
    "workflowAssistant": {
      "threadId": "xxx",
      "message": "帮我生成一个订单查询流程",
      "workflow": {},
      "selectedNodeId": null,
      "clientEvent": "user_message",
      "validation": null
    }
  }
}
```

前端只识别 `custom` 中的 `workflow.*`：

```ts
if (event === 'custom' && data.type?.startsWith('workflow.')) {
  handleWorkflowAgentEvent(data)
}
```

前端职责保持不变：

- 应用 `WorkflowPatch` 到预览态。
- 每阶段调用 `validateWorkflowGraph(nodes, edges)`。
- 有 Error 时自动发送 `clientEvent: "validation_failed"`。
- 无 Error 时发送 `clientEvent: "stage_validated"`。
- 最终由用户应用到正式画布。

## 工具、MCP 与 Sandbox

不为 `workflow-agent` 新设计沙箱体系，复用现有能力：

- `get_available_tools()` 加载配置工具、内置工具和 MCP 工具。
- `SandboxMiddleware` 注入沙箱上下文。
- `SandboxAuditMiddleware` 记录沙箱审计。
- `ToolErrorHandlingMiddleware` 处理工具异常。
- MCP 工具由 `deerflow.mcp` 加载和缓存。

`workflow-agent` 只控制工具边界：

```yaml
tools:
  allowed:
    - describe_workflow
    - build_workflow_patch
    - validate_workflow_patch
    - run_node_skill
    - validate_python_node_code
  disallowed:
    - bash
```

节点 Skill 工具返回必须收敛到结构化结果：

```ts
interface NodeSkillResult {
  node?: WorkflowNode
  edges?: WorkflowEdge[]
  patchOperations?: WorkflowPatchOperation[]
  warnings?: string[]
}
```

## 模块边界

- `app/agents/workflow_agent`：Graph、业务编排、领域 LLM、事件和工具。
- `app/workflow/patch`：`WorkflowPatch` schema、builder、validator。
- `app/workflow/nodes`：节点执行器、节点能力和节点 Skill 映射。

复用基础能力：

- `WorkflowPatch` 契约。
- 阶段 patch 生成与自动修复逻辑。
- 前端 `validateWorkflowGraph`。
- DeerFlow 模型、工具、MCP、middleware 和 sandbox 底座。

## 实施步骤

### 阶段 1：Agent 平台注册

- 新增 `app/agent_platform/definition.py`。
- 新增 `app/agent_platform/builtins.py`。
- 新增 `app/agent_platform/registry.py`。
- 新增 `app/agent_platform/runtime_factory.py`。
- 修改 `RunService`，根据 `assistant_id` 解析 agent factory。
- 默认不传 `assistant_id` 时仍走 `lead_agent`。

### 阶段 2：workflow-agent 外壳

- 新增 `app/agents/workflow_agent/graph.py`。
- 新增 `WorkflowAgentOrchestrator`。
- 由 orchestrator 管理完整阶段状态机。
- 通过 LangGraph `custom` 输出 workflow 业务事件。
- 前端 `use-workflow-assistant-stream.ts` 调用线程级 run stream，并固定传入 `assistant_id: workflow-agent`。

### 阶段 3：模块整理

- 将 patch schema / builder / validator 收敛到 `app/workflow/patch`。
- 将节点能力与节点 Skill 映射收敛到 `app/workflow/nodes`。
- 新增 `run_node_skill` 和 `validate_python_node_code` 工具。
- 通过 AgentDefinition 的 tool allowlist / denylist 控制 workflow-agent 工具能力。

### 阶段 4：平台管理，后续

- AgentDefinition 持久化到数据库。
- 平台 UI 支持模型、Skill、Tool、Middleware 绑定。
- 支持自定义 Agent、版本、发布状态和权限控制。

## 当前实现状态

已完成：

- AgentDefinition、AgentRegistry、AgentRuntimeFactory。
- 内置 lead_agent、workflow-agent 注册及自定义 Agent 兼容。
- WorkflowAgentOrchestrator、WorkflowGenerationModel 和 LangGraph Graph。
- workflow.* custom 事件和统一线程级 run stream 前端链路。
- workflow-agent 历史会话侧栏、会话管理和 Run 请求记录恢复。
- 当前浏览器按线程保存会话快照，刷新或切换历史会话时恢复澄清、Mermaid、阶段状态和预览画布。
- 澄清问题支持文本、单选、多选及“其他”自定义输入。
- WorkflowPatch 与节点能力的稳定业务模块入口。
- 节点 Skill 沙箱执行工具和 Python 入口签名校验工具。
- 已删除原专属接口和 `app/workflow/assistant` 旧模块。

待后续：

- 将 `run_node_skill` 接入 WorkflowGenerationModel 的自动工具选择。
- 服务端持久化 workflow-agent `custom` 事件，支持跨设备恢复完整历史卡片。
- AgentDefinition 数据库存储和平台管理 UI。
- Node.js 环境恢复后的前端构建与浏览器联调。

## 约束

- 不在 `app/harness/deerflow` 新增业务 Agent。
- 不新增独立沙箱体系。
- 不把 workflow-agent 做成普通聊天 Agent。
- 不让前端解析 LangGraph 内部执行细节来判断工作流阶段。
- 不把 `WorkflowPatch` 包在自然语言 tool result 中让前端解析。
- `workflow-agent` 的业务阶段必须由后端 orchestrator 管理。
- 前端校验仍以 `validateWorkflowGraph` 为权威入口。
