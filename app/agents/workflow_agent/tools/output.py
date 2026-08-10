from __future__ import annotations

import hashlib
import json
import re
from typing import Any

from deerflow.config.app_config import get_app_config


_BASE64_DATA_URI = re.compile(
    r"^data:[^;,]+;base64,",
    re.IGNORECASE,
)
_BASE64_PAYLOAD = re.compile(r"^[A-Za-z0-9+/]+={0,2}$")
_BASE64_MIN_LENGTH = 512


def bounded_tool_json(
    payload: Any,
    *,
    max_chars: int,
) -> str:
    """Serialize tool output without persisting large or base64 payloads."""
    safe_payload = _redact_base64(payload)
    serialized = json.dumps(safe_payload, ensure_ascii=False, default=str)
    if len(serialized) <= max_chars:
        return serialized

    digest = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
    preview_limit = max(0, max_chars - 300)
    return json.dumps(
        {
            "truncated": True,
            "originalChars": len(serialized),
            "sha256": digest,
            "preview": serialized[:preview_limit],
            "message": (
                "工具结果超过 workflow-agent 输出限制，"
                "仅保留预览；请使用更精确的查询缩小结果范围。"
            ),
        },
        ensure_ascii=False,
    )


def workflow_tool_output_limit(runtime: Any | None = None) -> int:
    context = getattr(runtime, "context", None) if runtime is not None else None
    app_config = context.get("app_config") if isinstance(context, dict) else None
    resolved_config = app_config or get_app_config()
    return resolved_config.workflow_agent.max_tool_output_chars


def _redact_base64(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            str(key): _redact_base64(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_redact_base64(item) for item in value]
    if isinstance(value, tuple):
        return [_redact_base64(item) for item in value]
    if not isinstance(value, str):
        return value

    candidate = value.strip()
    if _BASE64_DATA_URI.match(candidate) or (
        len(candidate) >= _BASE64_MIN_LENGTH
        and len(candidate) % 4 == 0
        and _BASE64_PAYLOAD.fullmatch(candidate) is not None
    ):
        return {
            "redacted": "base64",
            "originalChars": len(value),
        }
    return value
