# Agentic Workflow Studio

`Agentic Workflow Studio` 是一个面向工作流生成、编排、调试与固化的 Agent 工作台。项目采用前后端独立架构：

- 后端位于 `app/`，基于 `FastAPI` 和 DeerFlow Harness Runtime 提供 LangGraph 兼容的运行、流式输出、线程与历史消息能力。
- 前端位于 `frontend/`，基于 `React + TypeScript + Vite` 提供工作流画布、节点配置、历史会话和 AI 助手交互界面。

## 核心能力

- `LangGraph` 兼容流式对话接口，支持 `messages`、`values`、`metadata`、`error` 等事件。
- AI 助手支持流式输出、思考过程、工具调用、工具结果、澄清问题、子任务/子代理执行展示。
- 支持线程会话与历史消息，前端可恢复历史会话并加载更早消息。
- 前端已抽象统一的消息归一化与 timeline 渲染链路，历史消息与实时流式消息共用同一套展示逻辑。
- 支持环境化配置，开发环境可通过 Vite 代理访问后端，生产环境可通过同域反向代理或完整 API 地址访问。

## 技术栈

### 后端

- `Python`
- `FastAPI`
- `StreamingResponse`
- `DeerFlow Harness Runtime`
- `LangGraph` 消息与运行时协议兼容

### 前端

- `React 18`
- `TypeScript`
- `Vite`
- `Tailwind CSS v4`
- `Zustand`
- `Axios`
- `@langchain/langgraph-sdk`
- `FlowGram.AI`
- `lucide-react`

## 项目结构

```text
agentic-workflow-studio/
  app/                         # 后端 FastAPI 应用
    api/
      routes/
        stream.py              # 流式运行接口
        threads.py             # 历史线程与历史消息接口
      router.py                # API 路由聚合
    harness/deerflow/          # DeerFlow Harness Runtime
    schemas/                   # 请求/响应模型
    services/                  # RunService 等业务服务
    main.py                    # FastAPI 应用入口
    runtime.py                 # 应用运行时初始化
  frontend/                    # 前端工作台
    src/
      api/                     # HTTP 与 AI 助手 API
      features/workflow/       # 工作流页面、画布、AI 助手
      store/                   # Zustand 状态
      types/                   # 类型定义
  config.yaml                  # 后端模型、沙箱、运行时配置
  requirements.txt             # 后端 Python 依赖
```

## 后端启动

### 1. 安装依赖

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

`requirements.txt` 会通过本地路径安装 `app/harness` 中的 DeerFlow Harness。

### 2. 配置环境变量

在项目根目录创建 `.env`，按实际模型网关配置填写：

```env
# CORS，开发环境可保持 *，生产建议指定前端域名
APP_CORS_ORIGINS=*

# 模型或网关凭证，按 config.yaml 中启用的 provider 填写
AIDP_AK=your_api_key
AIDP_LOGID=your_log_id
VOLCENGINE_API_KEY=your_volcengine_api_key
```

模型、沙箱、持久化与运行时配置主要由根目录 `config.yaml` 管理。

### 3. 启动服务

```bash
uvicorn app.main:app --reload
```

默认访问地址：

- API 文档：`http://127.0.0.1:8000/docs`
- API 前缀：`http://127.0.0.1:8000/api`

## 前端启动

```bash
cd frontend
npm install
npm run dev
```

开发环境默认通过 `.env.development` 使用：

```env
VITE_API_BASE_URL=/api
VITE_DEV_API_PROXY_TARGET=http://127.0.0.1:8000
```

Vite 会把 `/api` 请求代理到本地后端。

## 生产构建

```bash
cd frontend
npm run lint
npm run build
```

生产环境推荐：

- 前后端同域部署：`VITE_API_BASE_URL=/api`
- 前后端不同域部署：`VITE_API_BASE_URL=https://api.example.com/api`
- 后端通过 `APP_CORS_ORIGINS` 配置允许访问的前端域名

## 核心接口

### 流式运行

```text
POST /api/stream
POST /api/runs/stream
POST /api/threads/{thread_id}/runs/stream
```

前端通过 `@langchain/langgraph-sdk` 发起流式请求，后端返回 `text/event-stream`。

请求体兼容 LangGraph runs stream 风格：

```json
{
  "assistant_id": "lead_agent",
  "input": {
    "messages": [
      {
        "role": "user",
        "content": "帮我生成一个订单查询工作流"
      }
    ]
  },
  "stream_mode": ["messages", "values"]
}
```

### 历史会话

```text
GET /api/threads
GET /api/threads/{thread_id}
GET /api/threads/{thread_id}/messages
```

历史消息接口支持：

- `limit`
- `before_seq`
- `after_seq`

前端会使用这些接口展示历史会话侧栏、恢复会话消息，并加载更早消息。

## 前端 AI 助手结构

AI 助手相关代码位于：

```text
frontend/src/features/workflow/components/
  ai-assistant-panel.tsx       # 面板状态编排与页面骨架
  assistant-message-utils.ts   # 兼容旧引用的统一导出
  assistant/
    index.ts                   # 统一导出入口
    types.ts                   # 类型定义
    message-content.ts         # 文本、reasoning、结构化内容提取
    message-normalizer.ts      # 历史/流式消息归一化与 chunk 拼接
    message-merge.ts           # 局部流式消息合并
    timeline.ts                # Message[] -> TimelineItem[] 业务解释
    timeline-message-list.tsx  # timeline 渲染
    tool-cards.tsx             # 工具调用与子任务卡片
    thread-sidebar.tsx         # 历史会话侧栏
    thread-utils.ts            # 线程标题、时间、本地存储工具
    ui-primitives.tsx          # 通用 UI 原语
```

当前链路：

```text
LangGraph stream/history data
  -> AssistantMessageNormalizer
  -> Message[]
  -> getAssistantTimelineItems()
  -> TimelineMessageList
```

这样可以避免历史消息和实时流式消息因数据形态不同而走不同渲染逻辑。

## 调试建议

### PyCharm 后端 Debug

推荐使用 Python Module 启动：

```text
Module name: uvicorn
Parameters: app.main:app --reload
Working directory: 项目根目录
```

如果希望断点更稳定，也可以先去掉 `--reload`。

### 前端联调

1. 启动后端：`uvicorn app.main:app --reload`
2. 启动前端：`cd frontend && npm run dev`
3. 确认 `frontend/.env.development` 中 `VITE_DEV_API_PROXY_TARGET` 指向后端地址
4. 浏览器访问 Vite 输出的本地地址

## 质量检查

前端投产前建议执行：

```bash
cd frontend
npm run lint
npm run build
```

后端建议至少执行启动检查：

```bash
uvicorn app.main:app --reload
```

## 后续方向

- 完善工作流节点生成、调试、固化闭环。
- 将 AI 助手生成结果进一步映射到 FlowGram 工作流画布。
- 增强历史消息持久化一致性，尤其是工具结果、澄清消息和中断恢复。
- 增加运行记录、反馈、取消、等待等运行时接口。
