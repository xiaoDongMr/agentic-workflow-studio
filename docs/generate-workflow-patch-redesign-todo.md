# `generate_workflow_patch` 设计

## 输入

```python
goal: str
graph: {
    "nodes": list[WorkflowNode],
    "edges": list[WorkflowEdge],
}
confirmedMermaid: str | None
```

- `goal` 和完整 `graph` 必传。
- `graph` 只包含节点和边，不包含位置与运行状态。
- `confirmedMermaid` 可选；单节点调整通常不传。

## 子 Agent

子 Agent 与主 Agent 上下文隔离。以下动态数据只放入 `HumanMessage`，
不放入 System Prompt：

```json
{
  "goal": "最终目标",
  "graph": {"nodes": [], "edges": []},
  "confirmedMermaid": null
}
```

System Prompt 只包含稳定的 Graph 更新规则，以及 Node Skill 的名称、描述和
`SKILL.md` 路径。Skill 正文按需读取，不预先拼入提示词。

## 工具

子 Agent 装配四个基础工具。每个 `SKILL.md` 是节点 Schema 与脚本调用契约
的唯一来源，不使用额外 manifest，也不为每个脚本动态生成工具。

### `read_file`

按 Skill 目录提供的路径读取完整 `SKILL.md`。处理节点前必须先读取对应
Skill。Skill 内容包含节点字段名称、含义、类型、必填性、备注，以及脚本
名称、相对路径、描述、入口函数、入参和出参。

### `execute_node_skill_script`

按 Skill 声明执行脚本：

```python
path: str
function_name: str
arguments: dict
```

只允许执行已读取 Skill 的 `scripts/` 目录内的 Python 文件；入口必须是
合法异步函数。具体路径、函数名和参数由 `SKILL.md` 指导模型提供。

### `update_current_graph`

每次接收一个新增或修改节点及其相关边：

```python
node: dict | None
edges: list[dict] | None
```

- ID 与当前 Graph 中已有节点或边一致时更新，否则新增。
- 只接收 `execute_node_skill_script` 已经生成完成的节点。
- 不读取 Skill，不调用脚本，不推导或修改节点配置。
- 每次调用返回更新后的完整当前 Graph，作为后续操作的上下文。
- 下一次更新前必须调用 `return_workflow_graph` 发布本次快照。

### `return_workflow_graph`

接收 `summary` 和 `done`，从子 Agent 持有的当前 Graph 状态中取得完整节点
和边并立即发送前端。每次节点更新后调用一次；仅最后一个节点传
`done=true` 并记录最终结果。主 Agent 最后调用外层同名工具完成治理状态
收尾。

## 前端

```text
workflow.workflowGraph
  -> 按节点 ID 保留已有 position
  -> 为新增或缺失位置的节点补充 position
  -> 替换预览 Graph
  -> 渲染画布
```

后端不生成 position，不生成 Patch，不执行校验或自动修复。
