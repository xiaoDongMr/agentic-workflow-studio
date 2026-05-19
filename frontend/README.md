# Auto Workflow

智能客服工作流设计器基础框架，目标是承载以下能力：

- 左侧导航与场景切换
- 中间流程画布与节点编排
- 右侧节点配置面板
- 底部节点库与 AI 助手
- 后续接入 `FlowGram.AI` 作为正式流程编辑器

## 当前技术栈

- `React 18 + TypeScript`
- `Vite`
- `Tailwind CSS v4`
- `Zustand`
- `Axios`
- `class-variance-authority / clsx / tailwind-merge`
- `lucide-react`

## 技术栈建议

- `React 18`：适合，兼容性比默认的 React 19 更稳，尤其适合流程编辑器和新生态库混用场景。
- `Vite`：适合，启动快、构建简单，适合作为后台设计器项目的基础构建工具。
- `FlowGram.AI`：适合，但建议在业务骨架稳定后接入。首版先确定节点 schema、属性面板和执行 DSL，再正式替换当前 mock 画布。
- `shadcn/ui`：适合，但它不是传统 npm 组件库，本质是“组件代码生成 + Tailwind 体系”，所以必须配合 Tailwind 使用。
- `Axios`：可用，但更建议后续搭配 `TanStack Query` 管理服务端状态、缓存和重试。
- `Zustand`：适合，推荐只管理客户端交互态，例如当前选中节点、画布缩放、右侧面板状态等。

## 目录结构

```text
src/
  api/                    # Axios 实例与请求层
  components/ui/          # 基础 UI 组件
  features/workflow/      # 工作流相关页面模块
  lib/                    # 工具函数
  store/                  # Zustand 状态管理
  types/                  # 类型定义
```

## 启动项目

```bash
npm install
npm run dev
```

## 环境配置

- `VITE_API_BASE_URL`：前端通过 `langgraph-sdk` 请求后端时使用的 API 基地址。
- `VITE_DEV_API_PROXY_TARGET`：仅本地开发时使用，Vite 会把 `/api` 代理到这个后端地址。

推荐配置：

```bash
# .env.development
VITE_API_BASE_URL=/api
VITE_DEV_API_PROXY_TARGET=http://127.0.0.1:8000

# .env.production
VITE_API_BASE_URL=/api
```

如果线上前后端不是同域，也可以把 `VITE_API_BASE_URL` 改成完整地址，例如：

```bash
VITE_API_BASE_URL=https://api.example.com/api
```

## 下一步建议

1. 接入 `FlowGram.AI` 编辑器实例，替换当前 mock canvas。
2. 接入路由与页面分层，例如 `工作流列表 / 工作流详情 / 运行记录`。
3. 引入 `TanStack Query` 处理工作流详情、运行记录、节点模板等服务端数据。
4. 抽离节点 schema，统一节点定义、面板配置和执行参数结构。
