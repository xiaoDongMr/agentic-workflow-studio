from __future__ import annotations

import logging
import re
import time
import uuid
from copy import deepcopy
from typing import Any

from app.schemas.workflow import WorkflowNode
from app.workflow.nodes.capabilities import CODE_CONFIG_KEYS
from app.workflow.nodes.capabilities import normalize_node_payload
from app.workflow.nodes.capabilities import START_CONFIG_KEYS

Args = dict[str, Any]
Output = dict[str, Any]
logger = logging.getLogger(__name__)

WORKFLOW_VALUE_TYPES = frozenset({
    "String",
    "Integer",
    "Number",
    "Boolean",
    "Time",
    "Object",
    "Image",
    "Video",
    "Array",
    "Array<String>",
    "Array<Integer>",
    "Array<Number>",
    "Array<Boolean>",
    "Array<Time>",
    "Array<Object>",
    "Array<Image>",
    "Array<Video>",
})
_FIELD_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_DANGEROUS_FIELD_NAMES = frozenset({"__proto__", "constructor", "prototype"})


def build_node(
    node_type: str,
    data: dict[str, Any],
    runtime: dict[str, Any],
) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError("data must be an object")
    graph = runtime.get("graph")
    nodes = list(getattr(graph, "nodes", []) or [])
    sequence = len(nodes) + 1
    node = deepcopy(data)
    node.pop("id", None)
    node["type"] = node_type
    if node_type == "start" and any(item.type == "start" for item in nodes):
        raise ValueError(
            "Start node already exists in the current Graph; reuse it or call update_node"
        )
    if not str(node.get("id") or "").strip():
        existing_ids = {str(item.id) for item in nodes}
        node_id = (
            "start"
            if node_type == "start"
            else _create_unique_node_id(node_type, existing_ids)
        )
        while node_id in existing_ids:
            node_id = _create_unique_node_id(node_type, existing_ids)
        node["id"] = node_id
    logger.info(
        "node skill build_node: type=%s id=%s title=%s inputs=%d outputs=%d",
        node_type,
        node.get("id"),
        node.get("title"),
        len(node.get("inputs") or []),
        len(node.get("outputs") or []),
    )
    normalized = normalize_node_payload(node, sequence)
    return {"node": _frontend_node(normalized)}


def update_node(
    node_type: str,
    node_id: str,
    changes: dict[str, Any],
    runtime: dict[str, Any],
) -> dict[str, Any]:
    graph = runtime.get("graph")
    nodes = list(getattr(graph, "nodes", []) or [])
    existing = next((item for item in nodes if item.id == node_id), None)
    if existing is None:
        raise ValueError(f"Node {node_id!r} was not found in the current Graph")
    if existing.type != node_type:
        raise ValueError(
            f"Node {node_id!r} has type {existing.type!r}, expected {node_type!r}"
        )
    if not isinstance(changes, dict):
        raise ValueError("changes must be an object")
    logger.info(
        "node skill update_node: type=%s id=%s change_keys=%s",
        node_type,
        node_id,
        sorted(changes.keys()),
    )
    merged = _merge_changes(existing.model_dump(), changes)
    merged["id"] = existing.id
    merged["type"] = node_type
    sequence = nodes.index(existing) + 1
    normalized = normalize_node_payload(merged, sequence)
    return {"node": _frontend_node(normalized)}


def list_input_sources(
    runtime: dict[str, Any],
    *,
    node_id: str = "",
    upstream_node_ids: list[str] | None = None,
) -> dict[str, Any]:
    graph = runtime.get("graph")
    nodes = list(getattr(graph, "nodes", []) or [])
    edges = list(getattr(graph, "edges", []) or [])
    nodes_by_id = {str(node.id): node for node in nodes}

    if node_id:
        if node_id not in nodes_by_id:
            raise ValueError(f"Node {node_id!r} was not found in the current Graph")
        roots = [
            str(edge.source)
            for edge in edges
            if str(edge.target) == node_id
        ]
    else:
        roots = [str(item) for item in upstream_node_ids or [] if str(item)]
        if not roots:
            raise ValueError(
                "upstream_node_ids is required when listing sources for a new node"
            )

    missing = [item for item in roots if item not in nodes_by_id]
    if missing:
        raise ValueError(
            f"Upstream nodes were not found in the current Graph: {', '.join(missing)}"
        )

    incoming: dict[str, list[str]] = {}
    for edge in edges:
        target = str(edge.target)
        incoming.setdefault(target, []).append(str(edge.source))

    available_node_ids: list[str] = []
    visited: set[str] = set()
    queue = list(roots)
    while queue:
        current = queue.pop(0)
        if current in visited:
            continue
        visited.add(current)
        available_node_ids.append(current)
        queue.extend(incoming.get(current, []))

    sources: list[dict[str, Any]] = []
    for source_node_id in available_node_ids:
        source_node = nodes_by_id[source_node_id]
        for output in source_node.outputs:
            output_name = str(output.name).strip()
            if not output_name:
                continue
            sources.append({
                "source": f"{source_node_id}.{output_name}",
                "sourceType": "node",
                "nodeId": source_node_id,
                "nodeTitle": source_node.title,
                "field": output_name,
                "type": output.type,
                "description": output.description,
            })
    return {
        "sources": sources,
        "allowed_source_values": [item["source"] for item in sources],
    }


def validate_node_io(
    node: dict[str, Any],
    runtime: dict[str, Any],
    *,
    node_id: str = "",
    upstream_node_ids: list[str] | None = None,
) -> None:
    inputs = list(node.get("inputs") or [])
    outputs = list(node.get("outputs") or [])
    config = node.get("config") or {}
    mappings = list(config.get("inputMappings") or [])

    _validate_io_definitions(inputs, "input")
    _validate_io_definitions(outputs, "output")
    if not outputs:
        raise ValueError("At least one output variable is required")

    input_names = {
        str(item.get("name") or "").strip()
        for item in inputs
        if isinstance(item, dict)
    }
    mapping_fields = [
        str(mapping.get("field") or "").strip()
        for mapping in mappings
        if isinstance(mapping, dict)
    ]
    if len(mapping_fields) != len(set(mapping_fields)):
        raise ValueError("inputMappings contains duplicate fields")
    if set(mapping_fields) != input_names:
        raise ValueError(
            "inputs and config.inputMappings must contain the same fields"
        )
    mappings_by_field = {
        str(mapping.get("field") or "").strip(): mapping
        for mapping in mappings
        if isinstance(mapping, dict) and str(mapping.get("field") or "").strip()
    }
    node_mappings = [
        mapping
        for mapping in mappings_by_field.values()
        if mapping.get("sourceType") == "node"
    ]
    allowed_sources: dict[str, dict[str, Any]] = {}
    if node_mappings:
        source_result = list_input_sources(
            runtime,
            node_id=node_id,
            upstream_node_ids=upstream_node_ids,
        )
        allowed_sources = {
            item["source"]: item for item in source_result["sources"]
        }

    for input_item in inputs:
        field = str(input_item.get("name") or "").strip()
        mapping = mappings_by_field.get(field)
        if mapping is None:
            raise ValueError(f"Input {field!r} has no input mapping")
        source_type = str(mapping.get("sourceType") or "")
        if source_type not in {"literal", "node"}:
            raise ValueError(
                f"Input {field!r} sourceType must be 'literal' or 'node'"
            )
        if source_type == "literal":
            if str(input_item.get("type") or "") != "String":
                raise ValueError(
                    f"Custom input {field!r} must use String type"
                )
            if not str(mapping.get("source") or "").strip():
                raise ValueError(f"Custom input {field!r} cannot be empty")
            mapping["valueType"] = "String"
            continue

        source = str(mapping.get("source") or "").strip()
        source_info = allowed_sources.get(source)
        if source_info is None:
            raise ValueError(
                f"Input {field!r} references unavailable source {source!r}"
            )
        expected_type = str(input_item.get("type") or "")
        actual_type = str(source_info.get("type") or "")
        if not _types_compatible(expected_type, actual_type):
            raise ValueError(
                f"Input {field!r} expects {expected_type}, "
                f"but source {source!r} provides {actual_type}"
            )
        mapping["valueType"] = actual_type

    output_names = {
        str(item.get("name") or "").strip()
        for item in outputs
        if isinstance(item, dict)
    }
    output_key = str(config.get("outputKey") or "").strip()
    if output_key and output_key not in output_names:
        raise ValueError(
            f"outputKey {output_key!r} is not declared in outputs"
        )
    if node.get("type") == "llm" and config.get("responseMode") == "text":
        reasoning_key = str(config.get("reasoningKey") or "").strip()
        primary_outputs = [
            name for name in output_names if not reasoning_key or name != reasoning_key
        ]
        if len(primary_outputs) != 1:
            raise ValueError(
                "LLM text responseMode requires exactly one primary output"
            )


def _validate_io_definitions(items: list[Any], scope: str) -> None:
    names: set[str] = set()
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            raise ValueError(f"{scope}[{index}] must be an object")
        name = str(item.get("name") or "").strip()
        value_type = str(item.get("type") or "").strip()
        if not _FIELD_NAME.fullmatch(name):
            raise ValueError(
                f"{scope}[{index}] name must use letters, numbers, and underscores"
            )
        if name in _DANGEROUS_FIELD_NAMES:
            raise ValueError(f"{scope} variable name {name!r} is reserved")
        if name in names:
            raise ValueError(f"Duplicate {scope} variable name: {name}")
        names.add(name)
        if value_type not in WORKFLOW_VALUE_TYPES:
            raise ValueError(
                f"{scope} variable {name!r} has unsupported type {value_type!r}"
            )


def _types_compatible(expected: str, actual: str) -> bool:
    if expected == actual:
        return True
    if expected == "Number" and actual == "Integer":
        return True
    return expected == "Array" and actual.startswith("Array")


def _merge_changes(current: Any, changes: Any) -> Any:
    if not isinstance(current, dict) or not isinstance(changes, dict):
        return deepcopy(changes)
    merged = deepcopy(current)
    for key, value in changes.items():
        if key in {"id", "type"}:
            continue
        existing = merged.get(key)
        merged[key] = (
            _merge_changes(existing, value)
            if isinstance(existing, dict) and isinstance(value, dict)
            else deepcopy(value)
        )
    return merged


def _create_unique_node_id(node_type: str, existing_ids: set[str]) -> str:
    suffix = str(uuid.uuid4())
    base_id = f"{node_type}-{suffix}"
    if base_id not in existing_ids:
        return base_id

    fallback_base_id = (
        f"{node_type}-{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}"
    )
    if fallback_base_id not in existing_ids:
        return fallback_base_id

    index = 2
    while f"{fallback_base_id}-{index}" in existing_ids:
        index += 1
    return f"{fallback_base_id}-{index}"


def list_models(payload: dict[str, Any]) -> dict[str, Any]:
    models = [
        item for item in payload.get("models") or [] if isinstance(item, dict)
    ]
    requires_vision = bool(payload.get("requires_vision"))
    requires_thinking = bool(payload.get("requires_thinking"))
    eligible = [
        model
        for model in models
        if (not requires_vision or bool(model.get("supports_vision")))
        and (not requires_thinking or bool(model.get("supports_thinking")))
    ]
    return {
        "models": eligible,
        "recommended_model": str(eligible[0].get("name") or "") if eligible else "",
    }


def resolve_model_config(payload: dict[str, Any]) -> dict[str, Any]:
    result = list_models(payload)
    models = result["models"]
    if not models:
        raise ValueError("no configured model satisfies the required capabilities")
    requested_name = str(payload.get("model") or "")
    selected = next(
        (item for item in models if item.get("name") == requested_name),
        models[0],
    )
    thinking_enabled = bool(
        payload.get("enable_thinking") and selected.get("supports_thinking")
    )
    supports_effort = bool(selected.get("supports_reasoning_effort"))
    reasoning_effort = (
        str(payload.get("reasoning_effort") or "medium")
        if thinking_enabled and supports_effort
        else "medium"
    )
    return {
        "model": str(selected.get("name") or ""),
        "thinkingEnabled": thinking_enabled,
        "reasoningEffort": reasoning_effort,
        "includeReasoningOutput": thinking_enabled,
        "reasoningKey": "reasoning_content" if thinking_enabled else "",
    }


def _frontend_node(payload: dict[str, Any]) -> dict[str, Any]:
    node = WorkflowNode.model_validate(payload)
    result = node.model_dump(exclude={"position", "status"})
    if result.get("type") == "start":
        config = result.get("config") or {}
        result["config"] = {
            key: config[key]
            for key in START_CONFIG_KEYS
            if key in config
        }
    if result.get("type") == "code":
        config = result.get("config") or {}
        result["config"] = {
            key: config[key]
            for key in CODE_CONFIG_KEYS
            if key in config
        }
    _strip_nested_presentation(result)
    return result


def _strip_nested_presentation(node: dict[str, Any]) -> None:
    for body_node in node.get("config", {}).get("loopBodyNodes") or []:
        body_node.pop("position", None)
        body_node.pop("status", None)
        _strip_nested_presentation(body_node)
