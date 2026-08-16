---
name: "workflow-node-loop"
description: "Builds or updates frontend loop-node data and its nested workflow."
allowed-tools:
  - execute_node_skill_script
  - update_current_graph
---

# Workflow Loop Node

Use `type: loop` for array iteration or a bounded fixed number of iterations.

## Node Schema

`build_node.data` only contains business fields. Do not provide `id`, `type`,
`position`, or `status`.

| Field | Type | Required | Meaning | Notes |
| --- | --- | --- | --- | --- |
| `title` | string | no | Display title | Defaults to `循环` |
| `description` | string | no | Node description | |
| `inputs` | array | yes | Loop source and body inputs | Full ordered array |
| `outputs` | array | no | Collected loop outputs | Full ordered array |
| `config` | object | yes | Loop and nested Graph settings | |

| Config field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `loopMode` | string | yes | `array` or `count` |
| `loopCount` | integer | conditional | 1 to 100 for count mode |
| `loopBodyNodes` | array | yes | Complete nested workflow nodes |
| `loopBodyEdges` | array | yes | Complete nested workflow edges |
| `loopOutputs` | array | yes | Body-output mappings |
| `loopCanvasWidth` | number | no | Nested canvas width |
| `loopCanvasHeight` | number | no | Nested canvas height |

## Rules

- The loop body is a valid subgraph with start and end boundaries.
- Every `loopOutputs.fieldPath` exists in the referenced body node outputs.
- Do not reference nodes outside the loop body from body edges.
- Keep the body minimal and avoid unbounded iteration.

## Scripts

### build_node

- Path: `workflow-node-loop/scripts/node.py`
- Entry: `build_node`
- Description: build a complete new loop node and generate `id` and `type`.
- Arguments: `{"data": <Node Schema business fields>}`
- Returns: `{"node": <complete node>}`

### update_node

- Path: `workflow-node-loop/scripts/node.py`
- Entry: `update_node`
- Description: find the current loop node by ID and apply changed fields.
- Arguments: `{"node_id": "existing-id", "changes": <changed fields>}`
- Returns: `{"node": <complete updated node>}`

Objects merge recursively; arrays replace the entire old array; scalars replace
directly; omitted fields stay unchanged. Any nested Graph change must include
the complete new `loopBodyNodes` or `loopBodyEdges` array.
