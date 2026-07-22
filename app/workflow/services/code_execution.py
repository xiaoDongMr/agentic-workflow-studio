from __future__ import annotations

import json
import shlex
import textwrap
import uuid
from typing import Any

from app.workflow.services.code_sandbox_runtime import WorkflowCodeSandbox

SANDBOX_CODE_RESULT_PREFIX = "__WORKFLOW_CODE_RESULT__"
SANDBOX_CODE_RESULT_FILE_PREFIX = "__WORKFLOW_CODE_RESULT_FILE__"


def safe_exec(code: str, node_input: dict[str, Any]) -> Any:
    local_vars: dict[str, Any] = {"input": node_input, "variables": {}, "result": None}
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
) -> Any:
    payload = {
        "mode": "snippet",
        "code": code,
        "input": node_input,
        "variables": {},
    }
    return execute_sandbox_payload(sandbox, payload)


def execute_sandbox_file(
    *,
    sandbox: WorkflowCodeSandbox,
    file_path: str,
    entry_function: str,
    node_input: dict[str, Any],
) -> Any:
    payload = {
        "mode": "file",
        "file_path": file_path,
        "entry_function": entry_function,
        "input": node_input,
        "variables": {},
    }
    return execute_sandbox_payload(sandbox, payload)


def execute_sandbox_payload(sandbox: WorkflowCodeSandbox, payload: dict[str, Any]) -> Any:
    payload_path = f"/tmp/workflow-code-payload-{uuid.uuid4().hex}.json"
    result_path = f"/tmp/workflow-code-result-{uuid.uuid4().hex}.json"
    sandbox.write_file(payload_path, json.dumps(payload, ensure_ascii=False, default=str))
    output = sandbox.execute_command(sandbox_python_command(payload_path, result_path))
    return parse_sandbox_code_result(sandbox, output)


def sandbox_python_command(payload_path: str, result_path: str) -> str:
    quoted_payload_path = shlex.quote(payload_path)
    quoted_result_path = shlex.quote(result_path)
    wrapper = f"""
import asyncio
import inspect
import importlib.util
import json
import sys
import traceback

payload_path = sys.argv[1]
result_path = sys.argv[2]

try:
    with open(payload_path, "r", encoding="utf-8") as payload_file:
        payload = json.load(payload_file)

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

with open(result_path, "w", encoding="utf-8") as result_file:
    json.dump(response, result_file, ensure_ascii=False, default=str)

print("{SANDBOX_CODE_RESULT_FILE_PREFIX}" + result_path)
"""
    script = textwrap.dedent(wrapper).strip()
    return (
        f"(python3 - {quoted_payload_path} {quoted_result_path} <<'PY'\n{script}\nPY\n"
        "status=$?\n"
        f"rm -f {quoted_payload_path}\n"
        "if [ \"$status\" -ne 0 ]; then\n"
        f"  printf '{{\"ok\":false,\"error\":\"沙箱 Python 进程退出码 %s\",\"traceback\":\"\"}}' \"$status\" > {quoted_result_path}\n"
        f"  printf '%s%s\\n' '{SANDBOX_CODE_RESULT_FILE_PREFIX}' {quoted_result_path}\n"
        "fi\n"
        ") 2>&1"
    )


def parse_sandbox_code_result(sandbox: WorkflowCodeSandbox, output: str) -> Any:
    result_line = ""
    result_file_path = ""
    for line in output.splitlines():
        if line.startswith(SANDBOX_CODE_RESULT_FILE_PREFIX):
            result_file_path = line[len(SANDBOX_CODE_RESULT_FILE_PREFIX):].strip()
        if line.startswith(SANDBOX_CODE_RESULT_PREFIX):
            result_line = line[len(SANDBOX_CODE_RESULT_PREFIX):]
    if result_file_path:
        result_line = sandbox.read_file(result_file_path)
        sandbox.execute_command(f"rm -f {shlex.quote(result_file_path)}")
    if not result_line:
        if output.strip() == "(no output)":
            raise RuntimeError(
                "沙箱命令没有返回任何 stdout/stderr。"
                "这通常不是业务脚本抛出的具体异常，可能是沙箱 shell 会话被并发命令污染、"
                "命令被沙箱提前终止，或沙箱服务没有返回执行输出。"
            )
        raise RuntimeError(f"沙箱脚本未返回执行结果: {output[-500:]}")

    result = json.loads(result_line)
    if not result.get("ok"):
        error = result.get("error") or "沙箱脚本执行失败"
        traceback_text = result.get("traceback") or ""
        if not traceback_text:
            traceback_text = "\n".join(
                line
                for line in output.splitlines()
                if not line.startswith(SANDBOX_CODE_RESULT_PREFIX)
            ).strip()
        raise RuntimeError(f"{error}\n{traceback_text}".strip())
    return result.get("result")
