# 工作流模块表结构设计

本文档维护工作流模块的数据库表结构设计。当前代码中的核心数据模型来自：

- 前端 `WorkflowDocument` / `WorkflowNode` / `WorkflowEdge`
- 后端 `app.schemas.workflow.WorkflowDocument`
- 后端运行态 `WorkflowRunResponse` / `WorkflowRunStep` / `WorkflowRunEvent`

## 落地文件

| 文件 | 说明 |
| --- | --- |
| `sql/workflow_schema.sql` | PostgreSQL 建表 SQL，部署或开发机初始化数据库时执行。 |
| `app/persistence/workflow_models.py` | 工作流相关 SQLAlchemy ORM 模型，用于应用启动时自动建表和本地 SQLite 开发。 |
| `app/services/workflow_store.py` | 工作流持久层仓储，负责保存草稿、读取草稿、列出项目。 |
| `app/api/routes/workflows.py` | 工作流 API，包含草稿持久化接口和运行接口。 |
| `config.example.yaml` | 开源安全的配置示例，只引用 `$DATABASE_URL`，不包含真实密码。 |
| `.env.example` | 本地环境变量示例，真实 `.env` 已被 `.gitignore` 排除。 |

## 配置方式

本项目通过 `config.yaml` 的 `database` 段控制持久化。开源仓库只提交示例配置，真实连接串放在本地 `.env` 或部署 Secret。

本地 SQLite 开发：

```yaml
database:
  backend: sqlite
  sqlite_dir: .deer-flow/data
```

PostgreSQL 开发或部署：

```yaml
database:
  backend: postgres
  postgres_url: $DATABASE_URL
  echo_sql: false
  pool_size: 5
```

`.env` 示例：

```bash
DATABASE_URL=postgresql://agentic_workflow:change-me@127.0.0.1:5432/agentic_workflow_studio
```

初始化 PostgreSQL 表：

```bash
psql "$DATABASE_URL" -f sql/workflow_schema.sql
```

当前开发机 `liuxiaodong.hzjx@10.37.195.31` 已安装 PostgreSQL，并已创建：

- 数据库：`agentic_workflow_studio`
- 用户：`agentic_workflow`
- 表结构：执行自 `sql/workflow_schema.sql`
- 私有连接配置：`~/.agentic-workflow-studio/postgres.env`

该私有 env 文件只保存在开发机用户目录，不写入仓库。

在开发机运行后端时，可先加载该文件：

```bash
source ~/.agentic-workflow-studio/postgres.env
```

然后在 `config.yaml` 中使用：

```yaml
database:
  backend: postgres
  postgres_url: $DATABASE_URL
```

当前开发机 PostgreSQL 已开放内网直连监听，项目本机 `.env` 可以直接配置：

```bash
DATABASE_URL=postgresql://agentic_workflow:<password>@10.37.195.31:5432/agentic_workflow_studio
```

开发机 PostgreSQL 相关配置：

- `listen_addresses = '*'`
- `pg_hba.conf` 允许 `agentic_workflow` 访问 `agentic_workflow_studio`
- 配置文件修改前已在 `/etc/postgresql/15/main/` 下生成 `.bak.<timestamp>` 备份

如果需要回到不暴露数据库端口的方式，也可以使用 SSH 隧道：

```bash
ssh -f -N -L 55432:127.0.0.1:5432 liuxiaodong.hzjx@10.37.195.31
```

隧道模式下本机 `.env` 使用：

```bash
DATABASE_URL=postgresql://agentic_workflow:<password>@127.0.0.1:55432/agentic_workflow_studio
```

## 已接入的持久化 API

```text
GET  /api/workflows
POST /api/workflows/draft
GET  /api/workflows/{workflow_id}/draft
```

说明：

- `POST /api/workflows/draft` 保存 `WorkflowDocument` 草稿。
- 如果前端传入的 `workflow.id` 不是 UUID，服务端会生成 UUID 作为持久化项目 ID，并写回返回的 `workflow.id`。
- 当前运行接口仍支持直接传入完整 `WorkflowDocument`，后续可扩展为按 `workflow_version_id` 运行。

## 设计目标

- 支持工作流项目列表、草稿编辑、发布版本、模板中心和运行记录。
- 画布节点和边可独立查询，便于项目缩略图、节点统计、运行追踪和权限控制。
- 节点配置、选择器条件、循环子图等变化频繁的结构使用 `JSONB` 保留扩展性。
- 发布版本不可变，运行记录绑定发布版本或临时草稿快照，避免历史运行被后续编辑污染。

## 数据库约定

以下 DDL 以 PostgreSQL 为目标数据库。SQLite 开发环境可将 `JSONB` 降级为 `JSON` 或 `TEXT`。

- 主键使用 `UUID`。
- 所有时间字段使用 `TIMESTAMPTZ`。
- 软删除使用 `deleted_at`。
- 乐观锁使用 `revision`。
- 多租户预留 `workspace_id`，单用户部署可固定为默认工作区。

建议枚举值：

```sql
workflow_status        = draft | published | archived
workflow_version_state = draft | published | deprecated
node_type              = start | llm | selector | loop | loop-start | loop-end | code | end
run_status             = pending | running | success | error | canceled
step_status            = pending | running | success | error | skipped
template_status        = draft | published | archived
```

## 关系概览

```text
workflow_projects 1 ── N workflow_versions 1 ── N workflow_nodes
                                      │          └── N workflow_edges
                                      │
                                      └── N workflow_runs 1 ── N workflow_run_steps
                                                           └── N workflow_run_events

workflow_templates 1 ── N workflow_template_versions
```

## 核心表

### workflow_projects

工作流项目主表，用于列表页、权限、归档和当前草稿定位。

```sql
CREATE TABLE workflow_projects (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  name VARCHAR(128) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  current_draft_version_id UUID NULL,
  latest_published_version_id UUID NULL,
  created_by UUID NULL,
  updated_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  revision BIGINT NOT NULL DEFAULT 1
);

CREATE INDEX idx_workflow_projects_workspace_status
  ON workflow_projects (workspace_id, status, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_workflow_projects_name
  ON workflow_projects (workspace_id, name)
  WHERE deleted_at IS NULL;
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `current_draft_version_id` | 当前可编辑草稿版本。 |
| `latest_published_version_id` | 最近一次发布成功的版本。 |
| `revision` | 项目元信息乐观锁，不等同于版本号。 |

### workflow_versions

工作流版本表。草稿可修改，发布后不可变。运行时应优先绑定发布版本；调试运行可绑定草稿版本。

```sql
CREATE TABLE workflow_versions (
  id UUID PRIMARY KEY,
  workflow_id UUID NOT NULL REFERENCES workflow_projects(id),
  version VARCHAR(32) NOT NULL,
  state VARCHAR(32) NOT NULL DEFAULT 'draft',
  name VARCHAR(128) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  graph_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  node_count INTEGER NOT NULL DEFAULT 0,
  edge_count INTEGER NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ NULL,
  published_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 1,
  UNIQUE (workflow_id, version)
);

CREATE INDEX idx_workflow_versions_workflow_state
  ON workflow_versions (workflow_id, state, updated_at DESC);

CREATE INDEX idx_workflow_versions_published
  ON workflow_versions (workflow_id, published_at DESC)
  WHERE state = 'published';

ALTER TABLE workflow_projects
  ADD CONSTRAINT fk_workflow_projects_current_draft
  FOREIGN KEY (current_draft_version_id) REFERENCES workflow_versions(id);

ALTER TABLE workflow_projects
  ADD CONSTRAINT fk_workflow_projects_latest_published
  FOREIGN KEY (latest_published_version_id) REFERENCES workflow_versions(id);
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `graph_snapshot` | 完整 `WorkflowDocument` 快照，用于快速恢复画布和运行兜底。 |
| `config` | 工作流级配置，例如默认运行参数、超时、标签、入口参数定义。 |
| `node_count` / `edge_count` | 列表页和缩略图快速展示，保存时同步维护。 |

### workflow_nodes

工作流节点表。节点复杂配置保留在 `config`，常用展示字段拆列。

```sql
CREATE TABLE workflow_nodes (
  id UUID PRIMARY KEY,
  workflow_version_id UUID NOT NULL REFERENCES workflow_versions(id) ON DELETE CASCADE,
  node_key VARCHAR(128) NOT NULL,
  parent_node_key VARCHAR(128) NULL,
  type VARCHAR(32) NOT NULL,
  title VARCHAR(128) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  position_x DOUBLE PRECISION NOT NULL DEFAULT 0,
  position_y DOUBLE PRECISION NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'idle',
  inputs JSONB NOT NULL DEFAULT '[]'::jsonb,
  outputs JSONB NOT NULL DEFAULT '[]'::jsonb,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workflow_version_id, node_key)
);

CREATE INDEX idx_workflow_nodes_version_type
  ON workflow_nodes (workflow_version_id, type);

CREATE INDEX idx_workflow_nodes_parent
  ON workflow_nodes (workflow_version_id, parent_node_key);

CREATE INDEX idx_workflow_nodes_config_gin
  ON workflow_nodes USING GIN (config);
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `node_key` | 前端画布内的稳定节点 ID，例如 `start`、`llm`。 |
| `parent_node_key` | 循环子图节点所属的父循环节点，顶层节点为空。 |
| `inputs` / `outputs` | 保存 `WorkflowNodeIO[]`，便于变量选择器读取。 |
| `config` | 保存 `WorkflowNodeConfig`，包含 prompt、模型参数、选择器条件、循环子图配置等。 |

### workflow_edges

工作流边表。支持顶层图和循环子图。

```sql
CREATE TABLE workflow_edges (
  id UUID PRIMARY KEY,
  workflow_version_id UUID NOT NULL REFERENCES workflow_versions(id) ON DELETE CASCADE,
  edge_key VARCHAR(128) NOT NULL,
  parent_node_key VARCHAR(128) NULL,
  source_node_key VARCHAR(128) NOT NULL,
  target_node_key VARCHAR(128) NOT NULL,
  source_port_id VARCHAR(128) NULL,
  target_port_id VARCHAR(128) NULL,
  condition_key VARCHAR(128) NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workflow_version_id, edge_key)
);

CREATE INDEX idx_workflow_edges_version_source
  ON workflow_edges (workflow_version_id, source_node_key);

CREATE INDEX idx_workflow_edges_version_target
  ON workflow_edges (workflow_version_id, target_node_key);

CREATE INDEX idx_workflow_edges_parent
  ON workflow_edges (workflow_version_id, parent_node_key);
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `edge_key` | 前端画布内的稳定边 ID。 |
| `parent_node_key` | 循环子图边所属的父循环节点，顶层边为空。 |
| `condition_key` | 选择器分支边或条件边的关联标识。 |

## 运行态表

### workflow_runs

工作流运行主表。

```sql
CREATE TABLE workflow_runs (
  id UUID PRIMARY KEY,
  workflow_id UUID NOT NULL REFERENCES workflow_projects(id),
  workflow_version_id UUID NULL REFERENCES workflow_versions(id),
  run_no BIGSERIAL NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  trigger_type VARCHAR(32) NOT NULL DEFAULT 'manual',
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT NULL,
  started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL,
  duration_ms INTEGER NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflow_runs_workflow_created
  ON workflow_runs (workflow_id, created_at DESC);

CREATE INDEX idx_workflow_runs_version_created
  ON workflow_runs (workflow_version_id, created_at DESC);

CREATE INDEX idx_workflow_runs_status
  ON workflow_runs (status, created_at DESC);
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `workflow_version_id` | 正式运行绑定发布版本；草稿试运行也可绑定草稿版本。 |
| `state` | 保存运行后的 `WorkflowState`，包含变量、步骤、最终输出。 |
| `run_no` | 自增序号，用于排查和展示，不作为业务主键。 |

### workflow_run_steps

节点运行步骤表，对应当前后端 `WorkflowRunStep`。

```sql
CREATE TABLE workflow_run_steps (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  parent_step_id UUID NULL REFERENCES workflow_run_steps(id) ON DELETE CASCADE,
  node_key VARCHAR(128) NOT NULL,
  node_title VARCHAR(128) NOT NULL,
  node_type VARCHAR(32) NOT NULL,
  loop_node_key VARCHAR(128) NULL,
  iteration_index INTEGER NULL,
  step_index INTEGER NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  log TEXT NOT NULL DEFAULT '',
  error_message TEXT NULL,
  started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL,
  duration_ms INTEGER NULL,
  token_usage JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, step_index)
);

CREATE INDEX idx_workflow_run_steps_run_node
  ON workflow_run_steps (run_id, node_key);

CREATE INDEX idx_workflow_run_steps_loop
  ON workflow_run_steps (run_id, loop_node_key, iteration_index);

CREATE INDEX idx_workflow_run_steps_status
  ON workflow_run_steps (status, created_at DESC);
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `parent_step_id` | 循环或子图场景下的父步骤。 |
| `loop_node_key` / `iteration_index` | 标识某个循环节点的第几次迭代，便于调试循环内部节点。 |

### workflow_run_loop_iterations

循环节点迭代表。用于记录循环节点每次迭代的输入、输出和状态。

```sql
CREATE TABLE workflow_run_loop_iterations (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  loop_node_key VARCHAR(128) NOT NULL,
  iteration_index INTEGER NOT NULL,
  item_input JSONB NOT NULL DEFAULT '{}'::jsonb,
  item_output JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  error_message TEXT NULL,
  started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL,
  duration_ms INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, loop_node_key, iteration_index)
);
```

### workflow_run_events

运行事件表，用于 SSE 回放、调试面板和审计。

```sql
CREATE TABLE workflow_run_events (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  event_index BIGINT NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  level VARCHAR(16) NOT NULL DEFAULT 'info',
  node_key VARCHAR(128) NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  trace_id VARCHAR(128) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, event_index)
);

CREATE INDEX idx_workflow_run_events_run_created
  ON workflow_run_events (run_id, created_at);

CREATE INDEX idx_workflow_run_events_type
  ON workflow_run_events (event_type, created_at DESC);
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `event_index` | 单次运行内递增，用于按原始顺序回放。 |
| `event_type` | 建议复用 `metadata`、`workflow_event`、`step`、`final`、`error`。 |
| `payload` | 原始事件内容，避免事件字段频繁变更导致迁移。 |

## 模板表

### workflow_templates

模板主表，用于模板中心和新建工作流入口。

```sql
CREATE TABLE workflow_templates (
  id UUID PRIMARY KEY,
  workspace_id UUID NULL,
  name VARCHAR(128) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category VARCHAR(64) NOT NULL DEFAULT 'general',
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  cover JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NULL,
  updated_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX idx_workflow_templates_category
  ON workflow_templates (category, updated_at DESC)
  WHERE deleted_at IS NULL;
```

### workflow_template_versions

模板版本表，保存可实例化的完整工作流快照。

```sql
CREATE TABLE workflow_template_versions (
  id UUID PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
  version VARCHAR(32) NOT NULL,
  state VARCHAR(32) NOT NULL DEFAULT 'draft',
  graph_snapshot JSONB NOT NULL,
  node_count INTEGER NOT NULL DEFAULT 0,
  edge_count INTEGER NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);
```

## 可选表

### workflow_favorites

```sql
CREATE TABLE workflow_favorites (
  workflow_id UUID NOT NULL REFERENCES workflow_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workflow_id, user_id)
);
```

### workflow_audit_logs

用于记录发布、回滚、删除、权限变更等操作。

```sql
CREATE TABLE workflow_audit_logs (
  id UUID PRIMARY KEY,
  workflow_id UUID NOT NULL REFERENCES workflow_projects(id),
  workflow_version_id UUID NULL REFERENCES workflow_versions(id),
  action VARCHAR(64) NOT NULL,
  actor_id UUID NULL,
  before_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflow_audit_logs_workflow_created
  ON workflow_audit_logs (workflow_id, created_at DESC);
```

## 保存与发布流程

### 保存草稿

1. 如果项目不存在，创建 `workflow_projects`。
2. 创建或更新 `workflow_versions(state = 'draft')`。
3. 删除该草稿版本下旧的 `workflow_nodes`、`workflow_edges`。
4. 按当前画布写入新的 `workflow_nodes`、`workflow_edges`。
5. 同步更新 `workflow_versions.graph_snapshot`、`node_count`、`edge_count`。
6. 更新 `workflow_projects.current_draft_version_id`。

### 发布版本

1. 校验草稿图结构：必须有开始节点，节点 ID 不重复，边引用节点存在。
2. 将当前草稿复制为新的 `workflow_versions(state = 'published')`。
3. 发布版本写入不可变 `graph_snapshot`。
4. 更新 `workflow_projects.latest_published_version_id`。
5. 写入 `workflow_audit_logs(action = 'publish')`。

### 运行工作流

1. 创建 `workflow_runs(status = 'pending')`。
2. 运行开始后更新 `status = 'running'`、`started_at`。
3. 每个节点完成后写入 `workflow_run_steps`。
4. SSE 或内部事件写入 `workflow_run_events`。
5. 运行结束后更新 `workflow_runs.output`、`state`、`status`、`finished_at`、`duration_ms`。

## 为什么不把所有节点配置完全拆表

当前节点配置包含大模型参数、选择器规则、循环子图、输入映射、视觉输入开关、错误策略等，变化频率高。完全拆表会带来大量迁移和 JOIN 成本。

推荐策略：

- 列表、检索、权限、运行追踪所需字段拆列。
- 画布恢复和节点执行所需复杂结构放入 `JSONB`。
- 当某类配置需要频繁查询时，再局部增加派生列或专用表。

## 后续迁移建议

1. 先落地 `workflow_projects`、`workflow_versions`、`workflow_nodes`、`workflow_edges`，替换前端本地草稿。
2. 再落地 `workflow_runs`、`workflow_run_steps`、`workflow_run_events`，支撑运行记录和调试回放。
3. 最后补 `workflow_templates` 和审计表，完善模板中心与治理能力。
