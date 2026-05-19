# Agentic Workflow Studio

一个通过 Agent 自动生成、执行、调试并固化工作流的开源平台。

`Agentic Workflow Studio` 的目标不是只提供一个聊天式 Agent，而是让 Agent 参与整个工作流搭建过程：

- 根据目标自动生成工作流节点能力
- 在沙箱环境中执行、验证和调试节点逻辑
- 以流式方式返回运行过程和中间状态
- 在流程验证完成后，将动态生成过程沉淀为可复用的固化流程

未来仓库将包含后端运行时与前端工作台，分别负责工作流生成、执行编排、调试验证与可视化操作。

## Why

传统工作流系统通常依赖人工配置固定节点，存在几个问题：

- 节点能力固定，难以按任务动态生成
- 搭建和调试流程成本高
- 一次性的 Agent 执行过程难以沉淀为长期可复用资产
- 缺少“生成 -> 验证 -> 固化”这一整条闭环

这个项目希望把 Agent、Sandbox 和 Workflow Orchestration 结合起来，让工作流具备自生成和可固化的能力。

## Core Ideas

- `Agent-based Node Generation`
  - Agent 根据目标自动生成工作流节点逻辑，而不是只消费预置节点
- `Sandbox Execution`
  - 每个节点都可以在隔离环境中执行和验证，降低生成即上线的风险
- `Streaming Runtime`
  - 通过流式接口实时返回事件、消息、中间状态和错误信息
- `Workflow Debugging`
  - Agent 可以围绕节点执行进行调试、修正和迭代
- `Workflow Solidification`
  - 当动态生成的流程验证完成后，可以进一步沉淀为稳定、可重复执行的固定流程

## Current Status

当前仓库已经具备第一阶段的后端基础能力：

- 基于 `FastAPI` 提供服务入口
- 基于 `deerflow harness` 运行时承接 Agent 执行链路
- 提供与 `gateway` 风格对齐的 `/api/stream` 流式接口
- 支持通过 `config.yaml` 和 `.env` 配置模型与沙箱
- 已验证模型配置、SSE 输出链路和基础运行时初始化流程

当前重点仍然是后端运行时与接口复刻，前端工作台会作为后续阶段逐步加入。

## Architecture

当前实现可以概括为：

1. `FastAPI` 接收运行请求
2. `RunService` 负责组装 run、thread 和 stream 响应
3. `deerflow harness` 负责 Agent 执行、工具调用和沙箱运行
4. `StreamingResponse` 按 SSE 持续输出事件
5. 后续在此基础上扩展工作流节点生成、调试与固化能力

## Project Structure

```text
app/
  api/
    routes/
      stream.py
    router.py
  harness/
    deerflow/
  schemas/
    run.py
  services/
    runs.py
  deps.py
  main.py
  runtime.py
config.yaml
requirements.txt
README.md
```

主要目录说明：

- `app/main.py`
  - `FastAPI` 应用入口与生命周期管理
- `app/runtime.py`
  - 应用运行时初始化
- `app/api/routes/stream.py`
  - `/api/stream` 流式接口
- `app/services/runs.py`
  - 运行服务、SSE 事件转换与 run 生命周期处理
- `app/harness/deerflow`
  - 当前内置使用的 `deerflow harness` 代码
- `config.yaml`
  - 模型、沙箱和运行相关配置

## Quick Start

### 1. 安装依赖

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

`requirements.txt` 会通过 `-e ./app/harness` 安装本地的 `deerflow harness`。

### 2. 配置环境变量

在项目根目录创建 `.env`，例如：

```env
# AIDP models
AIDP_AK=your_api_key
AIDP_LOGID=your_log_id

# Volcengine models
VOLCENGINE_API_KEY=your_volcengine_api_key
```

### 3. 配置模型与沙箱

项目通过根目录的 `config.yaml` 读取配置，当前已经支持：

- 本地沙箱：`deerflow.sandbox.local:LocalSandboxProvider`
- AIDP Azure 兼容模型
- Volcengine / DeepSeek 风格模型

如果你有自己的模型网关，也可以直接替换 `config.yaml` 中的 provider 配置。

### 4. 启动服务

```bash
uvicorn app.main:app --reload
```

启动后可访问：

- Swagger UI: <http://127.0.0.1:8000/docs>

## Streaming API

当前已实现的核心接口：

```python
@router.post("/stream")
async def stream(body: RunCreateRequest, request: Request) -> StreamingResponse:
```

请求示例：

```bash
curl -N -X POST "http://127.0.0.1:8000/api/stream" \
  -H "Content-Type: application/json" \
  -d '{
    "assistant_id": "lead_agent",
    "input": {
      "messages": [
        {
          "role": "user",
          "content": "你好，请帮我规划一个工作流节点生成方案"
        }
      ]
    },
    "stream_mode": [
      "values",
      "messages-tuple",
      "custom"
    ],
    "multitask_strategy": "reject",
    "on_disconnect": "cancel"
  }'
```

接口返回 `text/event-stream`，当前支持的事件类型包括：

- `metadata`
- `values`
- `messages-tuple`
- `custom`
- `error`
- `end`

## Implemented Today

目前已经完成：

- `/api/stream` 的网关式 SSE 输出
- `RunCreateRequest` 的兼容请求结构
- `RunManager / StreamBridge / Checkpointer / Store / ThreadStore` 启动注入
- 自动生成 `thread_id` 并写入 `Content-Location`
- 通过 `config.yaml + .env` 驱动模型配置

## Roadmap

接下来计划逐步补齐：

- `/wait`
- `/cancel`
- `/threads/{thread_id}/runs`
- run messages / feedback / join 等接口
- 工作流节点生成与调试协议
- 工作流固化与复用能力
- 前端工作台与可视化编排界面

## Use Cases

- 自动生成业务审批流和任务编排流
- 自动搭建抓取、解析、清洗、总结类流程
- 让 Agent 为每个工作流节点生成执行逻辑
- 在沙箱中调试节点行为后沉淀为稳定流程模板

## Repository Info

- Repository name: `agentic-workflow-studio`
- Description: `An open-source agentic workflow builder that generates, executes, debugs, and solidifies workflows through sandbox-driven agents.`
- Slogan: `Build workflows with agents, verify them in sandboxes, and solidify them into reusable automation.`


## TODO
- 与前端建立sse对话
1. 把前端项目导入进来
2. 通过模型完善功能，能够打通对话
- 生成工作流，langgraph(澄清确认)
1. 几个基本的节点的创建（大模型节点、选择器节点、循环节点）
2. 可通过langgragh可进行编排运行
3. 定义系统级别的skill,让其找到目前有哪些已有的节点，补全待创建的用户节点
4. 可跟助手互动，调整这个编排流
- 沙箱环境绑定

- 节点功能生成
1. 插件功能编码生成，创建一个插件功能的skill
测试数据->功能编码->调用测试[沙箱中的项目、编码，功能能力清单]
- 持久化
