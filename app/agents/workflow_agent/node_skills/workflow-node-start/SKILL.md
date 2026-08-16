---
name: "workflow-node-start"
description: "Builds or updates frontend start-node data for workflow inputs."
allowed-tools:
  - execute_node_skill_script
  - update_current_graph
---

# Workflow Start Node

Use `type: start` for the unique entry node of a workflow or loop subgraph.

## Node Schema

`build_node.data` only contains business fields. Do not provide `id`, `type`,
`position`, or `status`.

| Field | Type | Required | Meaning | Notes |
| --- | --- | --- | --- | --- |
| `title` | string | no | Display title | Defaults to `开始` |
| `description` | string | no | Node description | |
| `inputs` | array | no | Input variables | Must be empty |
| `outputs` | array | yes | Workflow input variables | Full ordered array |
| `config` | object | no | Start-node settings | Defaults are filled by the script |

Each `outputs` item contains `name: string`, `type: string`, and optional
`description: string`. `config.outputKey` names the primary output and
`config.enabled` must remain `true`.

Default start node structure:

```json
{
  "id": "start",
  "title": "开始节点",
  "type": "start",
  "description": "用户输入",
  "inputs": [],
  "outputs": [
    {
      "name": "input",
      "type": "String",
      "description": "用户输入"
    }
  ],
  "config": {
    "prompt": "用户输入会在这里进入工作流。",
    "model": "N/A",
    "temperature": 0,
    "maxTokens": 0,
    "enabled": true,
    "fallbackToHuman": false,
    "responseMode": "text",
    "outputKey": "input",
    "inputMappings": []
  }
}
```

## Rules

- A main workflow has exactly one start node.
- If the current Graph already contains a start node, reuse it. Do not call
  `build_node` for another start node.
- A start node has no incoming edge.
- Connect it to the first executable node with `add_edge`.
- Do not configure model, selector, code, or loop fields.
- Start nodes do not support single-node execution.

## Scripts

### build_node

- Path: `workflow-node-start/scripts/node.py`
- Entry: `build_node`
- Description: build a complete new start node and generate `id` and `type`.
- Arguments: `{"data": <Node Schema business fields>}`
- Returns: `{"node": <complete node>}`

### update_node

- Path: `workflow-node-start/scripts/node.py`
- Entry: `update_node`
- Description: find the current start node by ID and replace requested fields.
- Arguments: `{"node_id": "existing-id", "changes": <changed fields>}`
- Returns: `{"node": <complete updated node>}`

For updates, objects merge recursively, arrays replace the entire old array,
scalars replace directly, and omitted fields stay unchanged. To modify one
output, submit the complete new `outputs` array.
