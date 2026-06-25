# Agentic Workflow Studio

`Agentic Workflow Studio` 是一个面向 Agent 工作流生成、编排、调试与运行的工作台。项目采用前后端分离架构，后端提供工作流运行与沙箱资源池 API，前端提供工作流画布、节点配置、历史会话和 AI 助手界面。

## 核心能力

- `FastAPI` 后端，提供工作流运行、流式输出、线程与历史消息接口。
- `React + TypeScript + Vite` 前端，提供可视化工作流编排与 AI 助手交互。
- 基于 Kubernetes API 管理 `aio-sandbox` 资源池，为代码执行节点提供隔离运行环境。
- 前端沙箱资源池页面可查看 Pod、Service、节点、运行状态和访问地址。

## 项目结构

```text
agentic-workflow-studio/
  app/
    api/routes/                 # 后端 API 路由
    harness/deerflow/           # DeerFlow Harness Runtime
    sandbox_pool/               # Kubernetes API 沙箱资源池
    services/                   # 运行服务
    main.py                     # FastAPI 入口
  frontend/
    src/api/                    # 前端 HTTP API
    src/features/               # 工作流与沙箱资源池页面
  docs/
    aio-sandbox-kubernetes.md   # aio-sandbox Kubernetes 接入说明
    ghcr-aio-sandbox-browser-python.md # GHCR 自定义沙箱镜像构建说明
  docker/
    aio-sandbox-browser-python.Dockerfile # aio-sandbox Python 浏览器自动化基础镜像
  config.example.yaml            # 后端配置示例
  kubeconfig.example.yaml        # kubeconfig 示例，不含真实凭证
  config.yaml                   # 后端配置
  requirements.txt              # 后端依赖
```

## 后端启动

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

默认地址：

- API 文档：`http://127.0.0.1:8000/docs`
- API 前缀：`http://127.0.0.1:8000/api`

## 前端启动

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

## 沙箱资源池

沙箱资源池用于通过 Kubernetes API 创建和管理 `aio-sandbox` 实例，为工作流中的代码执行节点提供隔离运行环境。

```text
Frontend
  -> Local Backend /api/sandboxes
  -> Kubernetes Python Client
  -> Kubernetes API Server
  -> aio-sandbox Pod + Service
  -> Sandbox URL
```

默认使用 `NodePort`，不需要网关，后端会自动生成 `http://<node-ip>:<node-port>` 形式的沙箱访问地址：

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

## 常用接口

### 工作流运行

```text
POST /api/stream
POST /api/runs/stream
POST /api/threads/{thread_id}/runs/stream
```

### 历史会话

```text
GET /api/threads
GET /api/threads/{thread_id}
GET /api/threads/{thread_id}/messages
```

### 沙箱资源池

```text
GET    /api/sandbox-pool/health
GET    /api/sandboxes
POST   /api/sandboxes
GET    /api/sandboxes/{sandbox_id}
DELETE /api/sandboxes/{sandbox_id}
```

## 质量检查

后端：

```bash
python -m compileall app/sandbox_pool app/api/routes/sandbox_pool.py
```

前端：

```bash
cd frontend
npm run lint
npm run build
```
