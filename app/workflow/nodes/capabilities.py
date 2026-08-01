from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class WorkflowNodeCapability:
    type: str
    label: str
    purpose: str
    default_inputs: tuple[dict[str, str], ...]
    default_outputs: tuple[dict[str, str], ...]
    default_config: dict[str, Any]


_BASE_CONFIG: dict[str, Any] = {
    "prompt": "",
    "systemPrompt": "",
    "userPrompt": "",
    "model": "",
    "modelProvider": "deerflow",
    "temperature": 0,
    "maxTokens": 0,
    "enabled": True,
    "fallbackToHuman": False,
    "responseMode": "text",
    "outputKey": "output",
    "reasoningKey": "reasoning_content",
    "inputMappings": [],
    "thinkingEnabled": False,
    "reasoningEffort": "medium",
    "timeoutSeconds": 180,
    "retryCount": 1,
    "errorStrategy": "ignore",
}


def _io(name: str, value_type: str, description: str) -> dict[str, str]:
    return {"name": name, "type": value_type, "description": description}


CAPABILITIES: dict[str, WorkflowNodeCapability] = {
    "start": WorkflowNodeCapability(
        "start",
        "开始",
        "声明工作流输入",
        (),
        (_io("input", "String", "用户输入"),),
        {**_BASE_CONFIG, "outputKey": "input"},
    ),
    "llm": WorkflowNodeCapability(
        "llm",
        "大模型",
        "语义理解、分类和内容生成",
        (_io("input", "String", "模型输入"),),
        (_io("output", "String", "模型输出"),),
        {**_BASE_CONFIG, "temperature": 0.3, "maxTokens": 1024},
    ),
    "selector": WorkflowNodeCapability(
        "selector",
        "选择器",
        "确定性条件分支",
        (_io("input", "String", "判断输入"),),
        (),
        {
            **_BASE_CONFIG,
            "model": "Rule Engine",
            "responseMode": "json",
            "outputKey": "branch",
            "selectorBranches": [],
            "selectorElseBranch": "default",
        },
    ),
    "code": WorkflowNodeCapability(
        "code",
        "编码",
        "确定性数据处理",
        (_io("input", "String", "处理输入"),),
        (_io("output", "String", "处理结果"),),
        {
            **_BASE_CONFIG,
            "codeLanguage": "python",
            "codeCapability": "python",
            "codeSource": "sandbox_snippet",
            "codeEntryFunction": "main",
        },
    ),
    "loop": WorkflowNodeCapability(
        "loop",
        "循环",
        "数组或固定次数迭代",
        (_io("items", "Array", "循环输入"),),
        (),
        {
            **_BASE_CONFIG,
            "responseMode": "json",
            "loopMode": "array",
            "loopCount": 3,
            "loopBodyNodes": [],
            "loopBodyEdges": [],
            "loopOutputs": [],
            "loopCanvasWidth": 640,
            "loopCanvasHeight": 440,
        },
    ),
    "end": WorkflowNodeCapability(
        "end",
        "结束",
        "汇总工作流输出",
        (),
        (),
        {**_BASE_CONFIG, "outputKey": "output"},
    ),
}


def normalize_node_payload(payload: dict[str, Any], sequence: int) -> dict[str, Any]:
    node_type = str(payload.get("type") or "code")
    capability = CAPABILITIES.get(node_type)
    if capability is None:
        raise ValueError(f"unsupported workflow node type: {node_type}")

    normalized = deepcopy(payload)
    normalized["type"] = node_type
    normalized.setdefault("id", f"{node_type}-{sequence}")
    normalized.setdefault("title", capability.label)
    normalized.setdefault("description", capability.purpose)
    normalized.setdefault("position", {"x": 80 + (sequence - 1) * 260, "y": 120})
    normalized.setdefault("status", "idle")
    normalized.setdefault("inputs", [dict(item) for item in capability.default_inputs])
    normalized.setdefault("outputs", [dict(item) for item in capability.default_outputs])

    config = {**deepcopy(capability.default_config), **(normalized.get("config") or {})}
    config["inputMappings"] = list(config.get("inputMappings") or [])
    if node_type == "start" and "config" not in payload and normalized["outputs"]:
        config["outputKey"] = normalized["outputs"][0]["name"]
    normalized["config"] = config
    _ensure_output_key(normalized)
    return normalized


def _ensure_output_key(node: dict[str, Any]) -> None:
    if node["type"] in {"selector", "end", "loop"}:
        return
    output_key = str(node["config"].get("outputKey") or "").strip()
    if not output_key:
        return
    outputs = node.get("outputs") or []
    if any(str(item.get("name") or "").strip() == output_key for item in outputs):
        return
    outputs.append(_io(output_key, "String", "节点输出"))
    node["outputs"] = outputs
