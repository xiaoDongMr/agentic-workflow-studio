from __future__ import annotations

import json
from typing import Any

from app.schemas.workflow import WorkflowNode, WorkflowSelectorOperand
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


def build_selector_reference_values(node: WorkflowNode, state: WorkflowState) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for branch in node.config.selectorBranches:
        for condition in branch.conditions:
            for operand in (condition.left, condition.right):
                if operand.sourceType == "literal":
                    continue
                field = get_selector_operand_field(operand)
                if not field or field in result:
                    continue
                if operand.sourceType == "context":
                    result[field] = get_by_path(state.get("input", {}), operand.contextPath or operand.source)
                else:
                    result[field] = resolve_selector_node_operand(operand, state)
    return result


def get_selector_operand_field(operand: WorkflowSelectorOperand) -> str:
    if operand.sourceType == "context":
        return operand.contextPath or operand.source
    return operand.source or ".".join(item for item in [operand.nodeId, operand.fieldPath] if item)


def resolve_selector_node_operand(operand: WorkflowSelectorOperand, state: WorkflowState) -> Any:
    source = operand.source or ".".join(item for item in [operand.nodeId, operand.fieldPath] if item)
    if source:
        resolved = resolve_mapping(source, state)
        if resolved is not None:
            return resolved
        input_value = state.get("input", {})
        if isinstance(input_value, dict) and source in input_value:
            return input_value.get(source)

    node_value = state.get("variables", {}).get(operand.nodeId)
    if isinstance(node_value, dict):
        return get_by_path(node_value, operand.fieldPath)
    return None


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
    if not result and node.type == "selector" and node.config.selectorBranches:
        result = build_selector_reference_values(node, state)
    if not result:
        result["input"] = state.get("input", {})
    return coerce_by_io_definitions(result, node.inputs)
