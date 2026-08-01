from __future__ import annotations

import ast
import json

from langchain.tools import tool


@tool("validate_python_node_code", parse_docstring=True)
def validate_python_node_code_tool(code: str) -> str:
    """Validate a workflow Python node's required async entry signature.

    Args:
        code: Python source that must define ``async def main(args: Args) -> Output``.
    """
    issues: list[dict[str, str]] = []
    try:
        module = ast.parse(code)
    except SyntaxError as exc:
        issues.append(
            {
                "code": "python_syntax_error",
                "message": f"第 {exc.lineno or 0} 行：{exc.msg}",
            }
        )
        return _result(issues)

    entry = next(
        (
            node
            for node in module.body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
            and node.name == "main"
        ),
        None,
    )
    if entry is None:
        issues.append(
            {
                "code": "missing_main",
                "message": "缺少入口函数 async def main(args: Args) -> Output",
            }
        )
        return _result(issues)
    if not isinstance(entry, ast.AsyncFunctionDef):
        issues.append(
            {
                "code": "main_not_async",
                "message": "main 必须使用 async def 定义",
            }
        )
    if (
        len(entry.args.args) != 1
        or entry.args.args[0].arg != "args"
        or entry.args.vararg is not None
        or entry.args.kwarg is not None
    ):
        issues.append(
            {
                "code": "invalid_main_parameters",
                "message": "main 必须且只能接收参数 args",
            }
        )
    else:
        annotation = entry.args.args[0].annotation
        if not isinstance(annotation, ast.Name) or annotation.id != "Args":
            issues.append(
                {
                    "code": "invalid_args_annotation",
                    "message": "args 参数必须标注为 Args",
                }
            )
    if not isinstance(entry.returns, ast.Name) or entry.returns.id != "Output":
        issues.append(
            {
                "code": "invalid_return_annotation",
                "message": "main 返回值必须标注为 Output",
            }
        )
    return _result(issues)


def _result(issues: list[dict[str, str]]) -> str:
    return json.dumps(
        {
            "valid": not issues,
            "issues": issues,
        },
        ensure_ascii=False,
    )
