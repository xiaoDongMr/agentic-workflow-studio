# 工作流编码节点与沙箱设计

## 目标

沙箱是工作流的临时调试环境，用于编码节点的代码调试、文件查看、终端操作和全局调试。沙箱不作为 workflow 的长期数据源，workflow 必须能从代码资产和运行镜像恢复。

当前阶段暂不接入 AI 助手触发，先完成编码节点、手动关联、单节点调试和全局调试链路。

## 核心原则

1. 编码节点代码编辑复用沙箱的 code 能力，用户在沙箱 code 中编辑、保存、运行。
2. 编码节点代码、入口文件、输出配置最终需要同步保存到服务端代码资产中。
3. 沙箱关联粒度是 `workflowId`，调试沙箱服务当前 workflow 编辑态，不绑定历史版本。
4. 只要 workflow 已经保存过并拥有稳定 `workflowId`，就允许关联 `SandboxSession`。
5. 未保存变更不阻塞沙箱关联；代码是否已保存到服务端由代码同步状态表达。
6. 普通打开 workflow 不强制创建真实沙箱，但用户可以手动创建或关联沙箱。
7. 创建编码节点后，应引导用户关联已有沙箱或创建新沙箱，因为代码需要写入沙箱。
8. 单节点调试和全局调试只检查沙箱是否已绑定、状态是否正常；异常时提醒替换或重建。
9. 镜像选择、沙箱创建、沙箱状态展示、沙箱 code 编辑入口应复用同一套组件。

## 核心对象

```text
Workflow
  工作流草稿、版本和运行快照。

WorkflowVersion
  workflow 的保存版本，用于历史回退、全局调试快照和正式运行快照。

CodeArtifact
  服务端保存的编码节点代码资产，包含代码文件、入口文件、输出配置、代码签名。

CodeVersion
  CodeArtifact 的历史版本，用于审计和回退。

SandboxSession
  workflow 的调试沙箱会话，只保存当前 workflow 关联的 sandbox id、镜像 id 和 code 保存锚点。

AioSandbox
  实际执行代码的沙箱实例。

RuntimeImage
  AioSandbox 镜像，包含镜像 id、地址、digest、能力清单和预热状态。
```

## 关联沙箱

关联的是某个 `workflowId` 下的 `SandboxSession`，不是立即创建真实 AioSandbox。

触发场景：

1. 打开调试沙箱入口时，按 `workflowId` 加载或创建 `SandboxSession` 记录。
2. 用户可在画布顶部手动关联已有沙箱，或创建新沙箱。
3. 创建编码节点后，如果当前 workflow 已保存过，则展示“关联已有沙箱 / 创建新沙箱”入口。
4. 用户在编码节点面板点击“打开代码”时，如果没有可用沙箱，则先引导关联或创建。

规则：

1. 新建 workflow 尚未保存、没有稳定 `workflowId` 时，提示先保存一次。
2. 已保存过的 workflow 即使有未保存变更，也可以关联或创建沙箱。
3. 关联 session 时记录 `workflowId`、`sandboxId`、`sandboxUrl`、`imageId` 和 `lastSavedCodeSignature`。
4. 沙箱运行状态、TTL、健康状态从真实 AioSandbox 实例读取，不复制到 `SandboxSession`。
5. 用户恢复历史版本时，不切换 session；当前 workflow 仍使用同一个调试沙箱。
6. 保存当前草稿生成新版本时，不迁移 session。

## 创建沙箱

进入工作流后不强制创建 AioSandbox，但用户可以主动创建。创建编码节点后也应提供创建入口，因为代码编辑依赖沙箱 code 能力。

触发场景：

1. 用户在画布顶部手动点击“创建沙箱”。
2. 用户创建编码节点后选择“创建新沙箱”。
3. 用户打开编码节点的沙箱 code 编辑器，但当前没有可用沙箱。
4. 用户打开沙箱终端或文件视图，但当前没有可用沙箱。

创建流程：

1. 确认 workflow 已有稳定 `workflowId`。
2. 获取或创建 `SandboxSession`。
3. 用户选择 `RuntimeImage` 和 TTL。
4. 后端创建 AioSandbox，并打上 workflow/session labels。
5. 后端更新 session 的 `sandboxId`、`sandboxUrl` 和 `imageId`。
6. 首次创建成功后，如果服务端已有 `CodeArtifact`，则初始化到沙箱 code 工作区。

建议 labels：

```text
purpose=workflow-debug
workflow_id=<workflowId>
sandbox_session_id=<sessionId>
```

## 编码节点代码编辑

编码节点的代码展示和编辑应复用沙箱 code 能力，不单独再实现一套代码编辑器。

交互流程：

1. 用户创建编码节点。
2. 节点面板展示“关联沙箱 / 创建沙箱 / 打开代码”状态区。
3. 如果已有可用沙箱，用户点击“打开代码”进入沙箱 code。
4. 如果没有可用沙箱，先引导用户关联已有沙箱或创建新沙箱。
5. 用户在沙箱 code 中编辑代码、入口文件和必要配置。
6. 用户点击保存后，前端或后端从沙箱 code 工作区读取最新代码。
7. 服务端更新 `CodeArtifact`，生成新的代码签名和 `CodeVersion`。
8. `SandboxSession.lastSavedCodeSignature` 更新为最新签名。

保存规则：

1. 沙箱 code 中的改动默认是临时改动，只有点击保存后才写回服务端。
2. 离开编码节点、关闭 code 视图或切换 workflow 时，如果有未保存代码改动，需要提示保存或丢弃。
3. 如果沙箱异常、过期或被释放，未保存代码需要提示风险；已保存代码以服务端 `CodeArtifact` 为准。
4. 恢复历史版本时，沙箱 code 工作区应从该版本的 `CodeArtifact` 初始化，但沙箱关联仍属于当前 workflow。
5. 保存当前 workflow 生成新版本后，当前沙箱关联不变。



## TTL 与回收

TTL 使用空闲回收模型，不使用创建时间固定倒计时。

建议字段：

```text
lastUsedAt
expiresAt
idleTtlSeconds
activeRunCount
status
```

规则：

1. `idleTtlSeconds` 默认 30-60 分钟，可配置，最长不超过 7 天。
2. 创建沙箱、打开 code、保存代码、打开终端、查看文件、单节点调试、全局调试都会刷新 `lastUsedAt` 和 `expiresAt`。
3. 调试或终端命令开始时增加 `activeRunCount`，结束时减少。
4. 回收任务只释放 `activeRunCount = 0` 且 `expiresAt < now` 的沙箱。
5. 沙箱释放后保留 `SandboxSession`，状态改为 `expired`。

计算方式：

```text
effectiveTtl = min(configuredIdleTtl, 7 days)
expiresAt = now + effectiveTtl
```

## 重建沙箱

重建场景：

1. 用户切换 RuntimeImage。
2. 用户选择自定义镜像。
3. 当前沙箱过期。
4. 当前沙箱异常或健康检查失败。
5. 用户手动点击“重建沙箱”。

重建流程：

1. 标记旧沙箱不可用。
2. 释放旧沙箱资源。
3. 使用当前 session 的 RuntimeImage 创建新沙箱。
4. 从服务端 `CodeArtifact` 初始化沙箱 code 工作区。
5. 更新 session 的 `sandboxId`、镜像 digest、代码签名和过期时间。

## 镜像与依赖

Python 依赖不建议在 workflow 正式运行时动态安装。额外依赖优先通过自定义 AioSandbox 镜像解决。

规则：

1. 页面展示当前 RuntimeImage 的名称、地址、digest、Python 版本和能力清单。
2. 创建或重建沙箱时必须选择镜像。
3. 用户可选择已有自定义镜像，或从沙箱资源池登记新镜像。
4. 切换镜像后当前沙箱标记为需要重建。
5. 调试和正式运行应使用同一个镜像 digest。
6. 用户在终端里临时 `pip install` 只视为调试行为，不写回正式运行环境。

## 前端交互

画布顶部增加“调试沙箱”入口。

展示信息：

1. session 状态：未启动、创建中、就绪、有未保存代码、已过期、失败。
2. sandbox id 和访问地址。
3. RuntimeImage 名称、digest、Python 版本和能力清单。
4. TTL 剩余时间、最近使用时间、最近保存时间。
5. 操作：创建、关联、打开 code、保存代码、重建、释放、打开终端、查看文件、切换镜像。

编码节点面板展示：

1. 当前沙箱绑定状态。
2. 当前沙箱健康状态和 TTL。
3. 当前 RuntimeImage。
4. “关联沙箱 / 创建沙箱 / 替换沙箱”操作。
5. “打开沙箱 code”入口。
6. 代码保存状态：未保存、保存中、已保存、保存失败。
7. 入口文件、输出变量和单节点调试按钮。

共用组件建议：

1. `WorkflowSandboxPanel`：画布顶部入口和状态详情。
2. `WorkflowSandboxDialog`：创建、关联、切换镜像、设置 TTL。
3. `SandboxImagePicker`：复用现有镜像选择能力。
4. `WorkflowSandboxStatusBadge`：轻量状态展示。
5. `SandboxCodeEntry`：复用沙箱 code 的打开、保存和状态展示能力。
6. `useWorkflowSandboxSession`：统一封装加载、关联、创建、保存代码、重建、释放。

## 调试和运行

单节点调试：

1. 检查编码节点是否已绑定可用 `SandboxSession`。
2. 检查真实沙箱是否存在且状态正常。
3. 如果未绑定、已过期、失败或健康检查异常，提醒用户关联、替换或重建沙箱。
4. 状态正常时，直接在绑定沙箱中执行编码节点。
5. 返回 stdout、stderr、exit code、输出 JSON 和错误信息。

全局调试：

1. 创建临时运行快照。
2. 固定 workflow version、CodeVersion 和 RuntimeImage digest。
3. 执行到编码节点时，检查该版本绑定的沙箱状态。
4. 如果沙箱未绑定或状态异常，提醒用户替换或重建。
5. 状态正常时，在绑定沙箱中运行代码。

正式运行：

1. 固定 workflow version。
2. 固定 CodeVersion。
3. 固定 RuntimeImage digest。
4. 创建运行沙箱并从快照同步代码。
5. 并行执行时，每个沙箱都从同一份快照初始化。

## 实现步骤

1. 后端新增 `SandboxSession` 模型和 API，支持按 `workflowId` 查询或创建 session。
2. 前端新增 `useWorkflowSandboxSession`，在打开调试沙箱入口时按 workflow 加载 session。
3. 画布顶部增加“调试沙箱”入口，支持手动关联已有沙箱或创建新沙箱。
4. 抽出可复用的镜像选择组件，供资源池页和 workflow 沙箱弹窗共用。
5. 接入手动创建沙箱：选择镜像和 TTL 后创建 AioSandbox，并更新 session。
6. 接入编码节点创建后的提示：已保存 workflow 可直接关联或创建沙箱；未保存的新 workflow 提示先保存一次。
7. 复用沙箱 code 能力，编码节点面板提供“打开沙箱 code”入口。
8. 实现沙箱 code 保存到服务端 `CodeArtifact`，生成代码签名和 `CodeVersion`。
9. 实现保存生成新 workflow 版本后的 session 迁移或继承逻辑，确保调试沙箱关系落到新版本。
10. 实现恢复历史版本时按版本切换 session，并用该版本 `CodeArtifact` 初始化沙箱 code。
11. 接入单节点调试：只校验绑定沙箱存在且状态正常，异常时提醒替换或重建。
12. 接入全局调试：执行编码节点前校验绑定沙箱状态。
13. 实现 TTL 刷新、`activeRunCount` 和空闲回收。
14. 接入镜像切换和沙箱重建。
15. 接入正式运行快照。
