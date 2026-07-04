from __future__ import annotations

import base64
import json
import textwrap
from typing import Any

from app.workflow.services.code_sandbox_runtime import WorkflowCodeSandbox

SANDBOX_CODE_RESULT_PREFIX = "__WORKFLOW_CODE_RESULT__"


def safe_exec(code: str, node_input: dict[str, Any], variables: dict[str, Any]) -> Any:
    local_vars: dict[str, Any] = {"input": node_input, "variables": variables, "result": None}
    safe_builtins = {
        "all": all,
        "any": any,
        "bool": bool,
        "dict": dict,
        "enumerate": enumerate,
        "float": float,
        "int": int,
        "len": len,
        "list": list,
        "max": max,
        "min": min,
        "range": range,
        "str": str,
        "sum": sum,
    }
    exec(code, {"__builtins__": safe_builtins}, local_vars)
    return local_vars.get("result")


def execute_sandbox_snippet(
    *,
    sandbox: WorkflowCodeSandbox,
    code: str,
    node_input: dict[str, Any],
    variables: dict[str, Any],
) -> Any:
    payload = {
        "mode": "snippet",
        "code": code,
        "input": node_input,
        "variables": variables,
    }
    return parse_sandbox_code_result(sandbox.execute_command(sandbox_python_command(payload)))


def execute_sandbox_file(
    *,
    sandbox: WorkflowCodeSandbox,
    file_path: str,
    entry_function: str,
    node_input: dict[str, Any],
    variables: dict[str, Any],
) -> Any:
    payload = {
        "mode": "file",
        "file_path": file_path,
        "entry_function": entry_function,
        "input": node_input,
        "variables": variables,
    }
    return parse_sandbox_code_result(sandbox.execute_command(sandbox_python_command(payload)))


def sandbox_python_command(payload: dict[str, Any]) -> str:
    encoded_payload = base64.b64encode(json.dumps(payload, ensure_ascii=False).encode("utf-8")).decode("ascii")
    wrapper = f"""
import base64
import asyncio
import inspect
import importlib.util
import json
import traceback

payload = json.loads(base64.b64decode("{encoded_payload}").decode("utf-8"))

class Args:
    def __init__(self, params, variables):
        self.params = params
        self.variables = variables

Output = dict
args = Args(payload["input"], payload["variables"])

def expected_signature(entry_name):
    return "async def " + entry_name + "(args: Args) -> Output"

def invoke_entry(entry, entry_name):
    if not callable(entry):
        raise TypeError("编码节点缺少入口函数：" + entry_name)
    if not inspect.iscoroutinefunction(entry):
        raise TypeError("编码节点入口函数必须定义为 " + expected_signature(entry_name))
    try:
        parameters = list(inspect.signature(entry).parameters.values())
    except (TypeError, ValueError) as exc:
        raise TypeError("无法读取编码节点入口函数签名：" + str(exc)) from exc
    if len(parameters) != 1:
        raise TypeError("编码节点入口函数必须定义为 " + expected_signature(entry_name))
    parameter = parameters[0]
    annotation = parameter.annotation
    annotation_name = getattr(annotation, "__name__", str(annotation))
    if parameter.name != "args" or annotation_name != "Args":
        raise TypeError("编码节点入口函数必须定义为 " + expected_signature(entry_name))
    return asyncio.run(entry(args))

try:
    if payload["mode"] == "file":
        spec = importlib.util.spec_from_file_location("workflow_code_node", payload["file_path"])
        if spec is None or spec.loader is None:
            raise RuntimeError("Cannot load entry file: " + payload["file_path"])
        module = importlib.util.module_from_spec(spec)
        module.Args = Args
        module.Output = Output
        module.args = args
        module.input = payload["input"]
        module.params = payload["input"]
        module.variables = payload["variables"]
        spec.loader.exec_module(module)
        entry = getattr(module, payload["entry_function"])
        result = invoke_entry(entry, payload["entry_function"])
    else:
        local_vars = {{
            "Args": Args,
            "Output": Output,
            "args": args,
            "input": payload["input"],
            "params": payload["input"],
            "ret": None,
            "variables": payload["variables"],
            "result": None,
        }}
        sandbox_globals = {{
            "__builtins__": __builtins__,
            "Args": Args,
            "Output": Output,
            "args": args,
            "input": payload["input"],
            "params": payload["input"],
            "variables": payload["variables"],
        }}
        exec(payload["code"], sandbox_globals, local_vars)
        entry = local_vars.get("main")
        result = invoke_entry(entry, "main")
    response = {{"ok": True, "result": result}}
except Exception as exc:
    response = {{
        "ok": False,
        "error": str(exc),
        "traceback": traceback.format_exc(),
    }}

print("{SANDBOX_CODE_RESULT_PREFIX}" + json.dumps(response, ensure_ascii=False, default=str))
"""
    return f"python3 - <<'PY'\n{textwrap.dedent(wrapper).strip()}\nPY"


def parse_sandbox_code_result(output: str) -> Any:
    result_line = ""
    for line in output.splitlines():
        if line.startswith(SANDBOX_CODE_RESULT_PREFIX):
            result_line = line[len(SANDBOX_CODE_RESULT_PREFIX):]
    if not result_line:
        raise RuntimeError(f"沙箱脚本未返回执行结果: {output[-500:]}")

    result = json.loads(result_line)
    if not result.get("ok"):
        error = result.get("error") or "沙箱脚本执行失败"
        traceback_text = result.get("traceback") or ""
        raise RuntimeError(f"{error}\n{traceback_text}".strip())
    return result.get("result")
