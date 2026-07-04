from __future__ import annotations

from app.workflow.services.code_sandbox_runtime import WorkflowCodeSandbox

BROWSER_RUNTIME_OK_MARKER = "browser runtime ok"
BROWSER_RUNTIME_CHECK_COMMAND = f"""python3 - <<'PY'
import json
from urllib.request import urlopen

try:
    import playwright  # noqa: F401
except Exception as exc:
    raise RuntimeError("缺少 Playwright Python 依赖：" + str(exc)) from exc

try:
    with urlopen("http://127.0.0.1:8080/v1/browser/info", timeout=10) as response:
        browser_info = json.loads(response.read().decode("utf-8"))
except Exception as exc:
    raise RuntimeError("无法访问 AioSandbox 浏览器信息接口 /v1/browser/info：" + str(exc)) from exc

if not browser_info.get("data", {{}}).get("cdp_url"):
    raise RuntimeError("AioSandbox 浏览器信息中缺少 cdp_url")

print("{BROWSER_RUNTIME_OK_MARKER}")
PY"""


def validate_browser_runtime(sandbox: WorkflowCodeSandbox) -> None:
    output = sandbox.execute_command(BROWSER_RUNTIME_CHECK_COMMAND)
    if BROWSER_RUNTIME_OK_MARKER in output:
        return

    raise RuntimeError(
        "当前沙箱镜像不支持浏览器操作：缺少 Playwright、浏览器运行环境或 AioSandbox Browser/CDP 能力。"
        "请使用 AioSandbox Browser 镜像创建或替换调试沙箱。"
        f"\n{output[-500:]}"
    )
