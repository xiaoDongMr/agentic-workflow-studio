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
    "fallbackOutput": "",
}

START_CONFIG_KEYS: tuple[str, ...] = (
    "prompt",
    "model",
    "temperature",
    "maxTokens",
    "enabled",
    "fallbackToHuman",
    "responseMode",
    "outputKey",
    "inputMappings",
)

CODE_CONFIG_KEYS: tuple[str, ...] = (
    "prompt",
    "model",
    "temperature",
    "maxTokens",
    "enabled",
    "fallbackToHuman",
    "responseMode",
    "outputKey",
    "inputMappings",
    "codeLanguage",
    "codeCapability",
    "codeSource",
    "codeFilePath",
    "codeEntryFunction",
    "codeSyncStatus",
    "codeLastSavedSignature",
    "timeoutSeconds",
    "retryCount",
    "errorStrategy",
    "fallbackOutput",
)

_START_CONFIG: dict[str, Any] = {
    "prompt": "用户输入会在这里进入工作流。",
    "model": "N/A",
    "temperature": 0,
    "maxTokens": 0,
    "enabled": True,
    "fallbackToHuman": False,
    "responseMode": "text",
    "outputKey": "input",
    "inputMappings": [],
}

DEFAULT_CODE_SNIPPET = """# 在这里，您可以通过 'args'  获取节点中的输入变量，并通过 'ret' 输出结果
# 'args' 已经被正确地注入到环境中
# 下面是一个示例，首先获取节点的全部输入参数params，其次获取其中参数名为'input'的值：
# params = args.params;
# input = params['input'];
# 下面是一个示例，输出一个包含多种数据类型的 'ret' 对象：
# ret: Output =  { "name": '小明', "hobbies": ["看书", "旅游"] };

async def main(args: Args) -> Output:
    params = args.params
    # 构建输出对象
    ret: Output = {
        "code_result": {
            "key0": params['input'] + params['input'], # 拼接两次入参 input 的值
            "key1": ["hello", "world"],  # 输出一个数组
            "key2": { # 输出一个Object
                "key21": "hi",
            },
        }
    }
    return ret"""


def _io(name: str, value_type: str, description: str) -> dict[str, str]:
    return {"name": name, "type": value_type, "description": description}


CAPABILITIES: dict[str, WorkflowNodeCapability] = {
    "start": WorkflowNodeCapability(
        "start",
        "开始",
        "声明工作流输入",
        (),
        (_io("input", "String", "用户输入"),),
        _START_CONFIG,
    ),
    "llm": WorkflowNodeCapability(
        "llm",
        "大模型",
        "调用大语言模型，基于输入变量和提示词生成回复。",
        (_io("input", "String", ""),),
        (_io("result", "String", ""),),
        {
            **_BASE_CONFIG,
            "userPrompt": "{{input}}",
            "temperature": 0.7,
            "maxTokens": 4096,
            "outputKey": "",
            "inputMappings": [
                {
                    "field": "input",
                    "sourceType": "node",
                    "source": "start.input",
                    "valueType": "String",
                }
            ],
            "visionInputAsBase64": False,
            "supportContinuation": False,
        },
    ),
    "selector": WorkflowNodeCapability(
        "selector",
        "选择器节点",
        "按条件命中一个下游分支，未命中时进入否则分支。",
        (),
        (),
        {
            **_BASE_CONFIG,
            "model": "Rule Engine",
            "responseMode": "json",
            "outputKey": "branch",
            "selectorBranches": [],
            "selectorElseBranch": "else",
        },
    ),
    "code": WorkflowNodeCapability(
        "code",
        "编码节点",
        "在调试沙箱中执行 Python 代码，转换并返回结构化结果。",
        (_io("input", "String", "传入代码的上下文对象"),),
        (_io("code_result", "Object", "代码执行结果"),),
        {
            **_BASE_CONFIG,
            "prompt": DEFAULT_CODE_SNIPPET,
            "model": "Python",
            "maxTokens": 600,
            "responseMode": "json",
            "outputKey": "code_result",
            "inputMappings": [
                {
                    "field": "input",
                    "sourceType": "node",
                    "source": "start.input",
                    "valueType": "String",
                }
            ],
            "codeLanguage": "python",
            "codeCapability": "python",
            "codeSource": "sandbox_snippet",
            "codeFilePath": "",
            "codeEntryFunction": "main",
            "codeSyncStatus": "saved",
            "codeLastSavedSignature": "",
            "errorStrategy": "interrupt",
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
        supported = ", ".join(CAPABILITIES)
        raise ValueError(
            f"unsupported workflow node type: {node_type}. "
            f"Supported node types: {supported}. Do not use default."
        )

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
