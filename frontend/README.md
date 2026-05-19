# Auto Workflow Frontend

`frontend` 是 `Agentic Workflow Studio` 的前端工作台，负责工作流画布、节点配置、AI 助手对话、历史会话恢复和 LangGraph 流式消息展示。

## 功能概览

- 工作流画布与节点配置面板。
- AI 助手输入框，使用 `@langchain/langgraph-sdk` 对接后端流式接口。
- 历史会话侧栏，支持恢复历史线程与加载更早消息。
- 统一消息归一化链路，兼容历史消息与实时流式消息。
- 支持思考过程、工具调用、工具结果、澄清问题、子任务/子代理执行展示。
- 开发环境支持 Vite `/api` 代理，生产环境支持同域或跨域 API 配置。

## 技术栈

- `React 18`
- `TypeScript`
- `Vite`
- `Tailwind CSS v4`
- `Zustand`
- `Axios`
- `@langchain/langgraph-sdk`
- `FlowGram.AI`
- `lucide-react`

## 目录结构

```text
frontend/
  src/
    api/
      assistant.ts             # AI 助手流式请求
      assistant-history.ts     # 历史会话与历史消息请求
      http.ts                  # Axios 实例
    components/ui/             # 基础 UI 组件
    features/workflow/
      components/
        ai-assistant-panel.tsx # AI 助手面板状态编排与页面骨架
        assistant/             # AI 助手领域逻辑与 UI 拆分
        workflow-canvas.tsx    # 工作流画布
        node-config-panel.tsx  # 节点配置面板
        node-library.tsx       # 节点库
      editor/                  # FlowGram 编辑器相关封装
      mock-data.ts
    lib/
    store/
    types/
```

## AI 助手模块结构

```text
src/features/workflow/components/assistant/
  index.ts                    # 统一导出入口
  types.ts                    # 类型定义
  message-content.ts          # 文本、reasoning、结构化内容提取
  message-normalizer.ts       # 流式 chunk、历史消息、标题过滤归一化
  message-merge.ts            # 局部流式消息合并
  timeline.ts                 # Message[] -> AssistantTimelineItem[] 业务解释
  timeline-message-list.tsx   # timeline 渲染
  tool-cards.tsx              # 工具调用、工具结果、子任务卡片
  thread-sidebar.tsx          # 历史会话侧栏
  thread-utils.ts             # 线程标题、相对时间、本地 threadId 持久化
  ui-primitives.tsx           # 通用 UI 展示组件
```

保留兼容出口：

```text
src/features/workflow/components/assistant-message-utils.ts
```

该文件只做 re-export，用于兼容旧引用。

## 消息渲染链路

```text
后端 stream/history data
  -> createAssistantMessageNormalizer()
  -> Message[]
  -> getAssistantTimelineItems()
  -> TimelineMessageList
```

### 归一化层

`message-normalizer.ts` 负责：

- 判断普通 `Message` 与 `AIMessageChunk`
- 使用 `MessageTupleManager` 拼接 chunk
- 过滤标题生成消息：`TitleMiddleware.after_model` / `middleware:title`
- 统一处理 tuple 事件和消息列表

### Timeline 层

`timeline.ts` 负责把底层 `Message[]` 解释为 UI 可直接渲染的 `AssistantTimelineItem[]`：

- `human`
- `assistant`
- `assistant:processing`
- `assistant:clarification`
- `assistant:subagent`

每个 timeline item 会提前归一化好：

- `textContents`
- `reasoningContents`
- `clarificationText`
- `toolCalls`
- `subagentTasks`

### 渲染层

`timeline-message-list.tsx` 只消费 timeline item，不直接解释 LangGraph 原始消息结构。

## 环境变量

项目提供：

```text
.env.development
.env.production
.env.example
```

核心配置：

```env
# 前端请求后端 API 的基地址
VITE_API_BASE_URL=/api

# 本地开发代理目标，仅开发环境使用
VITE_DEV_API_PROXY_TARGET=http://127.0.0.1:8000
```

### 本地开发

推荐保持：

```env
VITE_API_BASE_URL=/api
VITE_DEV_API_PROXY_TARGET=http://127.0.0.1:8000
```

此时 Vite 会把 `/api` 请求代理到本地 FastAPI。

### 生产部署

同域部署：

```env
VITE_API_BASE_URL=/api
```

跨域部署：

```env
VITE_API_BASE_URL=https://api.example.com/api
```

跨域时需要后端同步配置：

```env
APP_CORS_ORIGINS=https://your-frontend-domain.com
```

## 安装与启动

```bash
npm install
npm run dev
```

本地联调前需要先启动后端：

```bash
cd ..
uvicorn app.main:app --reload
```

## 构建与检查

```bash
npm run lint
npm run build
```

当前重构后已验证：

- `npm run lint` 通过
- `npm run build` 通过

## API 对接

### 流式对话

前端通过 `src/api/assistant.ts` 使用 `@langchain/langgraph-sdk` 调用后端：

```text
POST /api/runs/stream
POST /api/threads/{thread_id}/runs/stream
```

请求会携带：

- `assistant_id: "lead_agent"`
- `input.messages`
- `stream_mode`
- 当前 `thread_id`，用于续聊

### 历史会话

前端通过 `src/api/assistant-history.ts` 调用：

```text
GET /api/threads
GET /api/threads/{thread_id}
GET /api/threads/{thread_id}/messages
```

历史消息恢复后仍会进入同一条消息归一化与 timeline 渲染链路。

## 常见问题

### `/api/runs/stream` 404

通常是前端请求打到了 Vite 自身，而不是 FastAPI。

检查：

- 后端是否已启动在 `http://127.0.0.1:8000`
- `.env.development` 中 `VITE_DEV_API_PROXY_TARGET` 是否正确
- 修改 env 后是否重启了 `npm run dev`

也可以临时使用完整后端地址：

```env
VITE_API_BASE_URL=http://127.0.0.1:8000/api
```

### 页面不显示流式增量

检查后端是否返回 `messages` 事件以及 `AIMessageChunk`。前端会通过 `MessageTupleManager` 自动拼接 chunk，并用 replace 模式更新当前消息，避免重复追加。

### 历史澄清问题不显示

前端已兼容两种形态：

- 后端返回 `ToolMessage(name="ask_clarification")`
- 历史消息中只有 AI message 的 `tool_calls: ask_clarification`

第二种情况会从 `tool_call.args.question` 兜底生成澄清卡片。

## 开发规范

- UI 组件与业务解释逻辑分离。
- 面板组件只负责状态编排、事件分发和页面骨架。
- LangGraph 消息协议细节集中在 `message-normalizer.ts` 与 `timeline.ts`。
- 新增消息类型时优先扩展 timeline 层，而不是直接在面板中写条件渲染。
- 新增展示卡片时优先放入 `assistant/` 目录中的独立组件文件。

## 推荐开发流程

```bash
npm run lint
npm run build
```

提交前确保：

- 无 TypeScript 诊断错误
- 无 ESLint 错误
- 生产构建通过
