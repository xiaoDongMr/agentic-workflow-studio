from __future__ import annotations

from typing import Any

DEFAULT_PREVIEW_LIMIT = 1024


def preview_text(text: str | None, limit: int = DEFAULT_PREVIEW_LIMIT) -> str:
    """将文本截断为适合日志的预览，超出部分以总字数标注，避免日志过大。"""
    text = text or ""
    if len(text) <= limit:
        return repr(text)
    return f"{text[:limit]!r}...(共{len(text)}字)"


def summarize_content(content: Any, limit: int = DEFAULT_PREVIEW_LIMIT) -> str:
    """对消息内容做安全摘要。

    纯文本按 ``preview_text`` 截断；多模态内容块（如 ``image_url``/``video_url``）
    只记录类型、来源（url/base64）与长度，绝不把图片/视频 base64 原文写进日志。
    """
    if isinstance(content, str):
        return preview_text(content, limit)
    if not isinstance(content, list):
        return preview_text(str(content), limit)
    parts: list[str] = []
    for block in content:
        if not isinstance(block, dict):
            parts.append(type(block).__name__)
            continue
        block_type = block.get("type", "unknown")
        if block_type == "text":
            parts.append(f"text({len(block.get('text', ''))}字)")
        elif block_type in ("image_url", "video_url"):
            url = (block.get(block_type) or {}).get("url", "")
            kind = "base64" if url.startswith("data:") else "url"
            parts.append(f"{block_type}({kind},{len(url)}字)")
        else:
            parts.append(str(block_type))
    return f"[{', '.join(parts)}]"
