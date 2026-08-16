---
name: "workflow-node-end"
description: "Returns the fixed frontend end-node structure."
allowed-tools:
  - execute_node_skill_script
  - update_current_graph
---

# Workflow End Node

Use `type: end` for the unique terminal node.

## Default Node

The end node requires no business-data assembly. Do not infer or provide
`inputs`, `outputs`, output mappings, model settings, or other node fields.
Call `build_node` with no arguments and use its complete result unchanged.

```json
{
  "id": "end-<uuid>",
  "title": "结束节点",
  "type": "end",
  "description": "返回工作流最终输出。",
  "inputs": [],
  "outputs": [],
  "config": {
    "prompt": "输出最终结果。",
    "model": "System",
    "temperature": 0,
    "maxTokens": 1200,
    "enabled": true,
    "fallbackToHuman": false,
    "responseMode": "text",
    "outputKey": "final",
    "inputMappings": []
  }
}
```

## Rules

- A main workflow has exactly one terminal end node.
- An end node has no outgoing edge.
- Connect every terminal branch to the end node unless branches intentionally terminate elsewhere.
- Keep the script result unchanged; only add the node and its incoming edges to the Graph.
- End nodes do not support single-node execution.

## Scripts

### build_node

- Path: `workflow-node-end/scripts/node.py`
- Entry: `build_node`
- Description: return the complete fixed end node with a generated UUID.
- Arguments: `{}`
- Returns: `{"node": <complete node>}`

### update_node

- Path: `workflow-node-end/scripts/node.py`
- Entry: `update_node`
- Description: find the current end node by ID and apply changed fields.
- Arguments: `{"node_id": "existing-id", "changes": <changed fields>}`
- Returns: `{"node": <complete updated node>}`

Objects merge recursively; arrays replace the entire old array; scalars replace
directly; omitted fields stay unchanged. Submit complete arrays when changing
`inputs`, `outputs`, or `config.inputMappings`.
