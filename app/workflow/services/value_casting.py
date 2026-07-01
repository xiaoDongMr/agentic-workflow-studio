from __future__ import annotations

import json
from datetime import datetime
from typing import Any


class ValueTypeConversionError(ValueError):
    pass


def normalize_value_type(value_type: str) -> str:
    normalized = value_type.strip().lower()
    if normalized.startswith("array<") and normalized.endswith(">"):
        return "array"
    aliases = {
        "str": "string",
        "string": "string",
        "int": "integer",
        "integer": "integer",
        "float": "number",
        "number": "number",
        "bool": "boolean",
        "boolean": "boolean",
        "time": "time",
        "date": "time",
        "datetime": "time",
        "object": "object",
        "json": "object",
        "array": "array",
        "list": "array",
    }
    return aliases.get(normalized, normalized or "string")


def array_item_type(value_type: str) -> str | None:
    value_type = value_type.strip()
    if value_type.lower().startswith("array<") and value_type.endswith(">"):
        return value_type[6:-1].strip() or None
    return None


def parse_json_if_string(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    stripped = value.strip()
    if not stripped:
        return value
    if not ((stripped.startswith("{") and stripped.endswith("}")) or (stripped.startswith("[") and stripped.endswith("]"))):
        return value
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        return value


def convert_value(value: Any, value_type: str) -> Any:
    normalized_type = normalize_value_type(value_type)
    if value is None:
        return None
    if normalized_type == "string":
        return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    if normalized_type == "integer":
        if isinstance(value, dict):
            raise ValueTypeConversionError(f"期望 Integer，但收到 Object: {value!r}")
        if isinstance(value, list):
            raise ValueTypeConversionError(f"期望 Integer，但收到 Array: {value!r}")
        if isinstance(value, bool):
            return int(value)
        return int(float(value))
    if normalized_type == "number":
        if isinstance(value, dict):
            raise ValueTypeConversionError(f"期望 Number，但收到 Object: {value!r}")
        if isinstance(value, list):
            raise ValueTypeConversionError(f"期望 Number，但收到 Array: {value!r}")
        return float(value)
    if normalized_type == "boolean":
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return value != 0
        if isinstance(value, str):
            return value.strip().lower() in {"true", "1", "yes", "y", "on", "是"}
        return bool(value)
    if normalized_type == "time":
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, str):
            datetime.fromisoformat(value.replace("Z", "+00:00"))
            return value
        raise ValueError(f"无法将 {value!r} 转换为 Time")
    if normalized_type == "object":
        parsed = parse_json_if_string(value)
        if isinstance(parsed, dict):
            return parsed
        raise ValueError(f"无法将 {value!r} 转换为 Object")
    if normalized_type == "array":
        parsed = parse_json_if_string(value)
        items = parsed if isinstance(parsed, list) else [parsed]
        item_type = array_item_type(value_type)
        if item_type:
            return [convert_value(item, item_type) for item in items]
        return items
    return value


def coerce_by_io_definitions(
    values: dict[str, Any],
    io_definitions: list[Any],
    *,
    scope: str = "变量",
) -> dict[str, Any]:
    next_values = dict(values)
    for item in io_definitions:
        field_name = getattr(item, "name", "")
        if not field_name or field_name not in next_values:
            continue
        value_type = getattr(item, "type", "string")
        try:
            next_values[field_name] = convert_value(next_values[field_name], value_type)
        except ValueTypeConversionError as exc:
            raise ValueTypeConversionError(f"{scope} {field_name} 类型转换失败：{exc}") from exc
        except (TypeError, ValueError) as exc:
            raise ValueTypeConversionError(
                f"{scope} {field_name} 类型转换失败：无法将 {next_values[field_name]!r} 转换为 {value_type}"
            ) from exc
    return next_values
