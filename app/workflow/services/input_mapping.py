from __future__ import annotations

import json
from typing import Any

from app.schemas.workflow import WorkflowNode
from app.workflow.services.value_casting import coerce_by_io_definitions
from app.workflow.state import WorkflowState


def get_by_path(value: Any, path: str) -> Any:
    current = value
    if isinstance(current, dict) and path in current:
        return current.get(path)
    for part in path.split("."):
        if isinstance(current, dict):
            current = current.get(part)
        else:
            return None
    return current


def resolve_mapping(source: str, state: WorkflowState) -> Any:
    if "." not in source:
        return state.get("variables", {}).get(source)
    node_id, key = source.split(".", 1)
    node_value = state.get("variables", {}).get(node_id)
    if isinstance(node_value, dict):
        return get_by_path(node_value, key)
    return None


def build_mapped_values(mappings: list[Any], state: WorkflowState) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for mapping in mappings:
        if not mapping.field:
            continue
        if mapping.sourceType == "context":
            result[mapping.field] = get_by_path(state.get("input", {}), mapping.source)
        elif mapping.sourceType == "node":
            result[mapping.field] = resolve_mapping(mapping.source, state)
        else:
            result[mapping.field] = parse_literal_mapping_value(mapping.source, getattr(mapping, "valueType", ""))
    return result


def parse_literal_mapping_value(source: Any, value_type: str) -> Any:
    if not isinstance(source, str):
        return source
    text = source.strip()
    if value_type in {"Integer", "Number"}:
        try:
            return int(text) if value_type == "Integer" else float(text)
        except ValueError:
            return 0 if value_type == "Integer" else 0.0
    if value_type == "Boolean":
        return text.lower() in {"true", "1", "yes", "是"}
    if value_type == "Object":
        try:
            parsed = json.loads(text)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    if not value_type.startswith("Array"):
        return source
    if not text:
        return []
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return parsed
    except json.JSONDecodeError:
        pass
    return [item.strip() for item in text.split(",") if item.strip()]


def build_node_input(node: WorkflowNode, state: WorkflowState) -> dict[str, Any]:
    result = build_mapped_values(node.config.inputMappings, state)
    if not result:
        result["input"] = state.get("input", {})
    return coerce_by_io_definitions(result, node.inputs)
