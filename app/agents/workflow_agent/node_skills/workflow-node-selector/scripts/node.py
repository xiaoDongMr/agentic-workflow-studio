from __future__ import annotations

import json
import re
from typing import Any

from app.agents.workflow_agent.node_skill_scripts import (
    WORKFLOW_VALUE_TYPES,
    build_node as build_node_data,
    list_input_sources as list_input_sources_data,
    update_node as update_node_data,
)

_OPERATORS = {
    "equals",
    "not_equals",
    "length_gt",
    "length_gte",
    "length_lt",
    "length_lte",
    "contains",
    "not_contains",
}
_OPERATOR_LABELS = {
    "equals": "等于",
    "not_equals": "不等于",
    "length_gt": "长度大于",
    "length_gte": "长度大于等于",
    "length_lt": "长度小于",
    "length_lte": "长度小于等于",
    "contains": "包含",
    "not_contains": "不包含",
}
_RESERVED_BRANCH_LABEL = re.compile(
    r"^(?:else|否则|条件\s*\d+|selector-branch-\d+)$",
    re.IGNORECASE,
)


async def list_input_sources(
    runtime: dict[str, Any],
    node_id: str = "",
    upstream_node_ids: list[str] | None = None,
) -> dict[str, Any]:
    return list_input_sources_data(
        runtime,
        node_id=node_id,
        upstream_node_ids=upstream_node_ids,
    )


async def build_node(
    data: dict[str, Any],
    upstream_node_ids: list[str],
    runtime: dict[str, Any],
) -> dict[str, Any]:
    sources = list_input_sources_data(
        runtime,
        upstream_node_ids=upstream_node_ids,
    )["sources"]
    normalized = _normalize_selector_data(data, sources)
    return build_node_data("selector", normalized, runtime)


async def update_node(
    node_id: str,
    changes: dict[str, Any],
    runtime: dict[str, Any],
) -> dict[str, Any]:
    graph = runtime.get("graph")
    existing = next(
        (
            node
            for node in list(getattr(graph, "nodes", []) or [])
            if node.id == node_id
        ),
        None,
    )
    if existing is None:
        raise ValueError(f"Node {node_id!r} was not found in the current Graph")
    if existing.type != "selector":
        raise ValueError(
            f"Node {node_id!r} has type {existing.type!r}, expected 'selector'"
        )
    _reject_unknown_fields(changes)
    normalized_changes = {
        key: changes[key]
        for key in ("title", "description")
        if key in changes
    }
    if "rules" in changes:
        sources = list_input_sources_data(runtime, node_id=node_id)["sources"]
        normalized = _normalize_selector_data(
            {"rules": changes["rules"]},
            sources,
            existing_branches=existing.config.selectorBranches,
        )
        branches = normalized["config"]["selectorBranches"]
    else:
        branches = [
            branch.model_dump()
            for branch in existing.config.selectorBranches
        ]
        if not branches:
            raise ValueError(
                "rules is required because the selector has no branches"
            )
    normalized_changes["inputs"] = []
    normalized_changes["outputs"] = []
    normalized_changes["config"] = _selector_config(branches)
    return update_node_data("selector", node_id, normalized_changes, runtime)


def _normalize_selector_data(
    data: dict[str, Any],
    sources: list[dict[str, Any]],
    *,
    existing_branches: list[Any] | None = None,
) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError("data must be an object")
    _reject_unknown_fields(data)
    rules = data.get("rules")
    if not isinstance(rules, list) or not rules:
        raise ValueError("rules must contain at least one branch")

    source_by_value = {
        str(source.get("source") or ""): source
        for source in sources
        if str(source.get("source") or "")
    }
    branches: list[dict[str, Any]] = []
    label_keys: set[str] = set()
    previous_branches = list(existing_branches or [])
    previous_by_label = {
        str(getattr(branch, "label", "") or ""): branch
        for branch in previous_branches
        if str(getattr(branch, "label", "") or "")
    }
    for branch_index, rule in enumerate(rules):
        if not isinstance(rule, dict):
            raise ValueError(f"rules[{branch_index}] must be an object")
        unknown = set(rule) - {"label", "conditions"}
        if unknown:
            raise ValueError(
                f"rules[{branch_index}] contains unsupported fields: "
                f"{', '.join(sorted(unknown))}"
            )
        label = str(rule.get("label") or "").strip()
        if not label:
            raise ValueError(f"rules[{branch_index}].label is required")
        label_key = label.casefold()
        if _RESERVED_BRANCH_LABEL.fullmatch(label):
            raise ValueError(
                f"rules[{branch_index}].label is reserved: {label!r}"
            )
        if label_key in label_keys:
            raise ValueError(f"Duplicate selector branch label: {label}")
        label_keys.add(label_key)
        raw_conditions = rule.get("conditions")
        if not isinstance(raw_conditions, list) or not raw_conditions:
            raise ValueError(
                f"rules[{branch_index}].conditions must not be empty"
            )
        previous_branch = previous_by_label.get(label)
        if previous_branch is None and branch_index < len(previous_branches):
            previous_branch = previous_branches[branch_index]
        previous_conditions = list(
            getattr(previous_branch, "conditions", []) or []
        )
        conditions = [
            _normalize_condition(
                condition,
                source_by_value,
                branch_index=branch_index,
                condition_index=condition_index,
                existing=(
                    previous_conditions[condition_index]
                    if condition_index < len(previous_conditions)
                    else None
                ),
            )
            for condition_index, condition in enumerate(raw_conditions)
        ]
        branches.append(
            {
                "id": (
                    str(getattr(previous_branch, "id", "") or "")
                    or f"selector_branch_{branch_index + 1}"
                ),
                "label": label,
                "conditions": conditions,
            }
        )

    return {
        "title": str(data.get("title") or "选择器节点"),
        "description": str(
            data.get("description")
            or "按条件命中一个下游分支，未命中时进入否则分支。"
        ),
        "inputs": [],
        "outputs": [],
        "config": _selector_config(branches),
    }


def _normalize_condition(
    condition: Any,
    source_by_value: dict[str, dict[str, Any]],
    *,
    branch_index: int,
    condition_index: int,
    existing: Any = None,
) -> dict[str, Any]:
    path = f"rules[{branch_index}].conditions[{condition_index}]"
    if not isinstance(condition, dict):
        raise ValueError(f"{path} must be an object")
    unknown = set(condition) - {"left", "operator", "right"}
    if unknown:
        raise ValueError(
            f"{path} contains unsupported fields: {', '.join(sorted(unknown))}"
        )
    operator = str(condition.get("operator") or "").strip()
    if operator not in _OPERATORS:
        raise ValueError(f"{path}.operator is not supported: {operator!r}")
    return {
        "id": (
            str(getattr(existing, "id", "") or "")
            or f"selector_condition_{branch_index + 1}_{condition_index + 1}"
        ),
        "operator": operator,
        "left": _normalize_operand(
            condition.get("left"),
            source_by_value,
            path=f"{path}.left",
        ),
        "right": _normalize_operand(
            condition.get("right"),
            source_by_value,
            path=f"{path}.right",
        ),
    }


def _normalize_operand(
    operand: Any,
    source_by_value: dict[str, dict[str, Any]],
    *,
    path: str,
) -> dict[str, Any]:
    if not isinstance(operand, dict):
        raise ValueError(f"{path} must be an object")
    unknown = set(operand) - {"source", "value", "valueType"}
    if unknown:
        raise ValueError(
            f"{path} contains unsupported fields: {', '.join(sorted(unknown))}"
        )
    source = str(operand.get("source") or "").strip()
    has_value = "value" in operand
    if bool(source) == has_value:
        raise ValueError(
            f"{path} must contain exactly one of source or value"
        )
    if source:
        source_info = source_by_value.get(source)
        if source_info is None:
            raise ValueError(
                f"{path}.source is unavailable: {source!r}; "
                "use list_input_sources"
            )
        return {
            "sourceType": "node",
            "source": source,
            "nodeId": str(source_info.get("nodeId") or ""),
            "fieldPath": str(source_info.get("field") or ""),
            "displayLabel": (
                f"{source_info.get('nodeTitle')}.{source_info.get('field')}"
            ),
            "valueType": str(source_info.get("type") or "String"),
        }

    value = operand.get("value")
    if value is None or (isinstance(value, str) and not value.strip()):
        raise ValueError(f"{path}.value must not be empty")
    value_type = str(operand.get("valueType") or _infer_value_type(value))
    if value_type not in WORKFLOW_VALUE_TYPES:
        raise ValueError(f"{path}.valueType is unsupported: {value_type!r}")
    return {
        "sourceType": "literal",
        "source": value if isinstance(value, str) else str(value),
        "literalValue": value,
        "valueType": value_type,
    }


def _infer_value_type(value: Any) -> str:
    if isinstance(value, bool):
        return "Boolean"
    if isinstance(value, int):
        return "Integer"
    if isinstance(value, float):
        return "Number"
    if isinstance(value, dict):
        return "Object"
    if isinstance(value, list):
        return "Array"
    return "String"


def _serialize_prompt(branches: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for branch in branches:
        for condition in branch["conditions"]:
            lines.append(
                f"{_format_operand(condition['left'])} "
                f"{_OPERATOR_LABELS[condition['operator']]} "
                f"{_format_operand(condition['right'])}"
                f"=>{branch['label']}"
            )
    return "\n".join(lines)


def _format_operand(operand: dict[str, Any]) -> str:
    if operand["sourceType"] == "node":
        return f"{{{{{operand['displayLabel']}}}}}"
    value = operand["literalValue"]
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _selector_config(
    branches: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "prompt": _serialize_prompt(branches),
        "model": "Rule Engine",
        "temperature": 0,
        "maxTokens": 300,
        "enabled": True,
        "fallbackToHuman": False,
        "responseMode": "json",
        "outputKey": "branch",
        "inputMappings": [],
        "selectorBranches": branches,
        "selectorElseBranch": "else",
    }


def _reject_unknown_fields(data: dict[str, Any]) -> None:
    unknown = set(data) - {"title", "description", "rules"}
    if unknown:
        raise ValueError(
            "selector data contains unsupported fields: "
            f"{', '.join(sorted(unknown))}"
        )
