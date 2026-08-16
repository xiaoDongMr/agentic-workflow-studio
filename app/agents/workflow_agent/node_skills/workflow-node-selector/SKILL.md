---
name: "workflow-node-selector"
description: "Builds or updates frontend selector-node data for deterministic branching."
allowed-tools:
  - execute_node_skill_script
  - update_current_graph
---

# Workflow Selector Node

Use `type: selector` for deterministic conditional routing. Structured `rules`
are authoritative. The script generates the frontend `selectorBranches`,
operand metadata, IDs, readable prompt, fixed engine config, and empty
`inputs`/`outputs`/`inputMappings`.

## Business Input

`build_node.data` accepts only:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `title` | string | no | Defaults to `选择器节点` |
| `description` | string | no | Node description |
| `rules` | array | yes | Ordered condition branches |

Each rule is:

```json
{
  "label": "命中",
  "conditions": [
    {
      "left": {"source": "start.input"},
      "operator": "equals",
      "right": {"value": "input", "valueType": "String"}
    }
  ]
}
```

An operand contains exactly one of:

- Upstream variable: `{"source": "node-id.output-name"}`.
- Literal value: `{"value": <JSON value>, "valueType": "String"}`.

`valueType` is optional for literals and is inferred from the JSON value.
Source values must come from `list_input_sources`. Do not generate frontend
operand fields such as `sourceType`, `nodeId`, `fieldPath`, or `displayLabel`.

Supported operators:

- `equals`, `not_equals`
- `contains`, `not_contains`
- `length_gt`, `length_gte`, `length_lt`, `length_lte`

Rules are evaluated from top to bottom. Conditions in one rule use AND
semantics. The first matching rule is selected; otherwise the fixed `else`
branch is selected. Rule labels must be non-empty and case-insensitively unique.
Do not use reserved routing labels such as `else`, `否则`, `条件 1`, or
`selector-branch-0`.

## Edge Contract

- Rule at zero-based index `n`: `sourcePortID: selector-branch-{n}`.
- Fallback: `sourcePortID: selector-else`.
- A selector has one normal incoming edge.
- Add each outgoing edge when its downstream node exists.
- Do not connect a rule and the else branch through the generic output port.

## Scripts

### list_input_sources

- Path: `workflow-node-selector/scripts/node.py`
- Entry: `list_input_sources`
- Description: list validated upstream variables for condition operands.
- New-node arguments:
  `{"upstream_node_ids": ["intended-direct-predecessor-id"]}`
- Existing-node arguments: `{"node_id": "existing-id"}`
- Returns:
  `{"sources": [...], "allowed_source_values": ["node-id.output-name"]}`

### build_node

- Path: `workflow-node-selector/scripts/node.py`
- Entry: `build_node`
- Description: validate business rules and build the complete frontend node.
- Arguments:
  `{"data": {"title": "...", "description": "...", "rules": [...]}, "upstream_node_ids": ["direct-predecessor-id"]}`
- Returns: `{"node": <complete node>}`

### update_node

- Path: `workflow-node-selector/scripts/node.py`
- Entry: `update_node`
- Description: update title, description, or the complete ordered rules array.
- Arguments:
  `{"node_id": "existing-id", "changes": {"title": "...", "description": "...", "rules": [...]}}`
- Returns: `{"node": <complete updated node>}`

For updates, omitted fields stay unchanged. When any rule or condition changes,
submit the complete `rules` array. Do not submit `config`, `selectorBranches`,
`inputs`, `outputs`, `inputMappings`, `prompt`, IDs, `type`, `position`, or
runtime status.
