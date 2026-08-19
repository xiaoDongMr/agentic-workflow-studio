# Agentic Workflow Studio

面向 AI 应用的 Workflow / Agent 统一编排平台，支持通过自然语言生成、修改、调试和运行工作流，并探索 `workflow-to-workflow`、`workflow-to-agent`、`agent-to-workflow`、`agent-to-agent` 的跨范式协作。

> 当前项目仍在迭代中，重点建设可视化编排、Workflow Agent、节点 Skill 体系、流式会话和沙箱运行闭环。

## Product Preview

建议在 `docs/assets/` 下放置截图、GIF 或视频。下方展示区会直接引用这些素材，上传同名文件后即可在 GitHub README 中预览核心功能。

素材建议：复杂操作流程优先使用 `MP4`，静态页面使用 `PNG`。GIF 适合很短的局部动效，但复杂 UI 容易因为降色和压缩变模糊。

### Overview

<p align="center">
  <video src="docs/assets/overview.mp4" controls muted loop playsinline width="100%"></video>
</p>

[查看项目总览视频](docs/assets/overview.mp4)

### Workflow Building

#### 自动生成工作流

<p align="center">
  <video src="https://github.com/xiaoDongMr/agentic-workflow-studio/releases/download/v0.1.0/workflow-generation.mp4" controls muted loop playsinline width="100%"></video>
</p>

[查看自动生成工作流视频](https://github.com/xiaoDongMr/agentic-workflow-studio/releases/download/v0.1.0/workflow-generation.mp4)

#### 可视化编排画布

<p align="center">
  <img src="docs/assets/workflow-canvas.png" alt="Workflow canvas" width="100%" />
</p>

#### 节点配置与单节点调试

| 节点配置 | 单节点调试 |
| --- | --- |
| <img src="docs/assets/node-configs.png" alt="Node configs" width="100%" /> | <video src="docs/assets/node-debug.mp4" controls muted loop playsinline width="100%"></video> |

#### 工作流编排运行

<p align="center">
  <video src="docs/assets/workflow-run.mp4" controls muted loop playsinline width="100%"></video>
</p>

[查看工作流编排运行视频](docs/assets/workflow-run.mp4)

### Sandbox & Runtime

#### 沙箱绑定与进入沙箱

| 沙箱绑定 | 进入沙箱 |
| --- | --- |
| <img src="docs/assets/sandbox-binding.png" alt="Sandbox binding" width="100%" /> | <video src="docs/assets/sandbox-enter.mp4" controls muted loop playsinline width="100%"></video> |

#### 资源与历史管理

| 工作流列表 | 会话历史恢复 |
| --- | --- |
| <img src="docs/assets/workflow-list.png" alt="Workflow list" width="100%" /> | <img src="docs/assets/thread-history.png" alt="Thread history" width="100%" /> |

| 沙箱列表 | 上传沙箱镜像 |
| --- | --- |
| <img src="docs/assets/sandbox-list.png" alt="Sandbox list" width="100%" /> | <img src="docs/assets/sandbox-image-upload.png" alt="Sandbox image upload" width="100%" /> |

### Media Checklist

下表按一次完整使用流程编排，素材文件可先保留占位，后续替换为真实截图或录屏。

| 顺序 | 场景 | 素材路径 | 类型建议 | 展示重点 |
| --- | --- | --- | --- | --- |
| 1 | 工作流列表 | `docs/assets/workflow-list.png` | Screenshot | 展示工作流项目管理、搜索、创建、打开和版本入口。 |
| 2 | 自动生成工作流 | `https://github.com/xiaoDongMr/agentic-workflow-studio/releases/download/v0.1.0/workflow-generation.mp4` | Video | 展示用户输入自然语言需求后，Workflow Agent 自动生成工作流图。 |
| 3 | 可视化编排画布 | `docs/assets/workflow-canvas.png` | Screenshot | 展示节点拓扑、连线关系、节点库和整体编排视图。 |
| 4 | 节点配置 | `docs/assets/node-configs.png` | Screenshot | 展示 Start、LLM、Code、Selector、Loop、End 等节点的配置能力。 |
| 5 | 单节点调试 | `docs/assets/node-debug.mp4` | Video | 展示单独运行节点、查看输入输出、错误信息和调试结果。 |
| 6 | 沙箱绑定 | `docs/assets/sandbox-binding.png` | Screenshot | 展示工作流绑定沙箱实例，为代码节点提供隔离执行环境。 |
| 7 | 进入沙箱 | `docs/assets/sandbox-enter.mp4` | Video | 展示从工作台进入 aio-sandbox，查看文件环境、运行页面或调试页面。 |
| 8 | 工作流编排运行 | `docs/assets/workflow-run.mp4` | Video | 展示完整工作流运行过程、节点状态流转、流式反馈和最终输出。 |
| 9 | 会话历史恢复 | `docs/assets/thread-history.png` | Screenshot | 展示多轮 AI 助手会话、历史记录和工作流快照恢复。 |
| 10 | 沙箱列表 | `docs/assets/sandbox-list.png` | Screenshot | 展示沙箱实例状态、访问地址、Pod / Service 信息和生命周期管理。 |
| 11 | 上传沙箱镜像 | `docs/assets/sandbox-image-upload.png` | Screenshot | 展示自定义镜像上传、镜像能力识别和镜像列表管理。 |
| 12 | 项目总览视频 | `docs/assets/overview.mp4` | Video | 用 1 分钟以内串联工作流创建、AI 生成、调试、沙箱执行和运行结果。 |

## Highlights

- **统一运行时抽象**：通过 `AgentDefinition`、`Registry`、`Runtime Factory` 管理 ReAct Agent 与 Workflow Graph。
- **自然语言生成工作流**：Workflow Agent 支持多轮生成、增量修改、预览和历史恢复。
- **自描述节点 Skill**：将节点 Schema、输入输出契约、生成规则和脚本工具沉淀为可校验规范。
- **端到端流式体验**：统一 `/api/threads/{thread_id}/runs/stream` 协议，连接 AI 助手、会话历史和运行快照。
- **隔离执行环境**：基于 Kubernetes API 管理 `aio-sandbox` 资源池，为代码节点提供隔离运行能力。
- **可视化工作台**：提供工作流画布、节点配置、节点库、历史会话、沙箱管理和运行反馈。

## Architecture

```text
User
  -> React Workflow Studio
  -> FastAPI Stream API
  -> Agent Platform
       -> ReAct Agent Runtime
       -> Workflow Graph Runtime
       -> Workflow Agent
            -> Node Skills
            -> Graph Builder
            -> Workflow Validation
  -> Workflow Runner
  -> Kubernetes / aio-sandbox
```

核心设计：

- `app/agent_platform/`：Agent 定义、注册和运行时工厂。
- `app/agents/workflow_agent/`：Workflow Agent 的状态、编排、图生成、节点 Skill 和流式事件。
- `app/services/`：工作流运行、沙箱会话、代码工作区、持久化和事件服务。
- `app/api/routes/`：工作流、线程、流式运行、沙箱资源池等 API。
- `frontend/src/features/workflow/`：工作流画布、AI 助手、历史会话、节点配置和运行态 UI。
- `frontend/src/features/sandbox/`：沙箱资源池、镜像能力、健康状态和运行实例管理。

## Tech Stack

| Layer | Stack |
| --- | --- |
| Frontend | React, TypeScript, Vite, Zustand, FlowGram, Tailwind CSS |
| Backend | FastAPI, Pydantic, LangGraph / LangChain Runtime |
| Storage | PostgreSQL checkpoint / persistence |
| Sandbox | Kubernetes API, aio-sandbox, Python / Browser automation |
| Workflow | Workflow Graph, Node Skills, Stream Events |

## Project Structure

```text
agentic-workflow-studio/
  app/
    agent_platform/             # Agent definition, registry and runtime factory
    agents/workflow_agent/      # Workflow Agent and node Skill system
    api/routes/                 # FastAPI routes
    harness/deerflow/           # DeerFlow Harness Runtime
    sandbox_pool/               # Kubernetes sandbox pool
    services/                   # Workflow, sandbox and persistence services
    main.py                     # FastAPI entry
  frontend/
    src/api/                    # Frontend API clients
    src/features/workflow/      # Workflow editor and AI assistant
    src/features/sandbox/       # Sandbox pool UI
  docs/
    assets/                     # Screenshots, GIFs and videos for README
    aio-sandbox-kubernetes.md
    ghcr-aio-sandbox-browser-python.md
  docker/
    aio-sandbox-browser-python.Dockerfile
  config.example.yaml
  kubeconfig.example.yaml
  requirements.txt
```

## Quick Start

### Backend

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

默认地址：

- API docs: `http://127.0.0.1:8000/docs`
- API prefix: `http://127.0.0.1:8000/api`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

开发环境默认通过 `frontend/.env.development` 将 `/api` 代理到本地后端：

```env
VITE_API_BASE_URL=/api
VITE_DEV_API_PROXY_TARGET=http://127.0.0.1:8000
```

## Sandbox Pool

沙箱资源池用于通过 Kubernetes API 创建和管理 `aio-sandbox` 实例，为工作流中的代码执行节点提供隔离运行环境。

```text
Frontend
  -> Local Backend /api/sandboxes
  -> Kubernetes Python Client
  -> Kubernetes API Server
  -> aio-sandbox Pod + Service
  -> Sandbox URL
```

默认使用 `NodePort`，后端会生成 `http://<node-ip>:<node-port>` 形式的访问地址：

```yaml
sandbox_pool:
  provider: kubernetes_api
  kubernetes_api:
    namespace: aio-sandbox
    image: enterprise-public-cn-beijing.cr.volces.com/vefaas-public/all-in-one-sandbox:latest
    service_type: NodePort
    connection:
      kubeconfig: ./kubeconfig.yaml
      context: default
      verify_ssl: true
```

可参考 `kubeconfig.example.yaml` 创建本地运行用的 `kubeconfig.yaml`。真实 kubeconfig、token 和证书不要提交到仓库。

更多配置模式，包括 `NodePort`、`ClusterIP`、`ClusterIP + Gateway/Ingress`、RBAC 和排障说明，见 [aio-sandbox Kubernetes 接入文档](docs/aio-sandbox-kubernetes.md)。

如果需要 Python Playwright 依赖，可以使用公共镜像 `ghcr.io/xiaodongmr/aio-sandbox-browser-python:latest`，或参考 [GHCR aio-sandbox Playwright 镜像](docs/ghcr-aio-sandbox-browser-python.md) 发布新版本。

## API Overview

### Workflow Runs

```text
POST /api/stream
POST /api/runs/stream
POST /api/threads/{thread_id}/runs/stream
```

### Threads

```text
GET /api/threads
GET /api/threads/{thread_id}
GET /api/threads/{thread_id}/messages
```

### Sandbox Pool

```text
GET    /api/sandbox-pool/health
GET    /api/sandboxes
POST   /api/sandboxes
GET    /api/sandboxes/{sandbox_id}
DELETE /api/sandboxes/{sandbox_id}
```

## Quality Checks

Backend:

```bash
python -m compileall app
```

Frontend:

```bash
cd frontend
npm run lint
npm run build
```

## Roadmap

- [ ] 完善 Workflow 与 Agent 互相调用的运行时协议。
- [ ] 增强 Workflow Agent 的图结构校验和自动修复能力。
- [ ] 支持更多节点 Skill 和可复用模板。
- [ ] 增加运行观测、节点级日志和失败重试策略。
- [ ] 补充完整 Demo 视频、截图和在线文档。
