from __future__ import annotations

import re
import shlex
from dataclasses import dataclass
from typing import Protocol
from urllib.parse import urlencode

from app.sandbox_pool.schemas import SandboxSummary
from app.services.workflow_sandbox_session import WorkflowSandboxSessionRecord

DEFAULT_SANDBOX_HOME_DIR = "/home/gem"
WORKFLOW_CODE_ROOT_DIR = "workflows"
CODE_SERVER_PATH = "/code-server/"
DEFAULT_CODE_FILE_NAME = "main.py"
BROWSER_CODE_FILE_NAME = "browser_main.py"

_SAFE_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")
_ENTRY_FILE_EXISTS_MARKER = "__workflow_code_entry_exists__"
_ENTRY_FILE_MISSING_MARKER = "__workflow_code_entry_missing__"


@dataclass(frozen=True)
class WorkflowCodeWorkspacePaths:
    folder_path: str
    entry_file_path: str


@dataclass(frozen=True)
class WorkflowCodeWorkspaceResult:
    workflow_id: str
    node_id: str
    sandbox_id: str
    sandbox_url: str
    folder_path: str
    entry_file_path: str
    code_url: str
    created: bool


class WorkflowCodeSandbox(Protocol):
    @property
    def home_dir(self) -> str: ...

    def execute_command(self, command: str) -> str: ...

    def write_file(self, path: str, content: str, append: bool = False) -> None: ...


def build_workflow_code_workspace_paths(
    workflow_id: str,
    node_id: str,
    *,
    sandbox_home_dir: str = DEFAULT_SANDBOX_HOME_DIR,
    code_capability: str = "python",
) -> WorkflowCodeWorkspacePaths:
    safe_workflow_id = normalize_workflow_code_path_segment(workflow_id, "workflow_id")
    safe_node_id = normalize_workflow_code_path_segment(node_id, "node_id")
    code_root = f"{sandbox_home_dir.rstrip('/')}/{WORKFLOW_CODE_ROOT_DIR}"
    folder_path = f"{code_root}/{safe_workflow_id}/nodes/{safe_node_id}"
    return WorkflowCodeWorkspacePaths(
        folder_path=folder_path,
        entry_file_path=f"{folder_path}/{_entry_file_name_for_capability(code_capability)}",
    )


def build_workflow_code_url(sandbox_url: str, folder_path: str) -> str:
    base_url = sandbox_url.rstrip("/")
    return f"{base_url}{CODE_SERVER_PATH}?{urlencode({'folder': folder_path})}"


def ensure_workflow_code_workspace(
    *,
    session: WorkflowSandboxSessionRecord,
    sandbox: SandboxSummary,
    node_id: str,
    entry_function: str,
    code_capability: str = "python",
) -> WorkflowCodeWorkspaceResult:
    if not session.sandbox_id:
        raise ValueError("workflow sandbox is not bound")
    if sandbox.status != "Running":
        raise ValueError("sandbox must be Running before opening code workspace")
    if sandbox.expired:
        raise ValueError("sandbox is expired")
    if not sandbox.sandbox_url:
        raise ValueError("sandbox_url is empty")

    sandbox_client = _sandbox_client(session.sandbox_id, sandbox.sandbox_url)
    paths = build_workflow_code_workspace_paths(
        session.workflow_id,
        node_id,
        sandbox_home_dir=_sandbox_home_dir(sandbox_client),
        code_capability=code_capability,
    )
    created = _ensure_entry_file(
        sandbox=sandbox_client,
        folder_path=paths.folder_path,
        entry_file_path=paths.entry_file_path,
        entry_function=entry_function,
        code_capability=code_capability,
    )
    return WorkflowCodeWorkspaceResult(
        workflow_id=session.workflow_id,
        node_id=node_id,
        sandbox_id=session.sandbox_id,
        sandbox_url=sandbox.sandbox_url,
        folder_path=paths.folder_path,
        entry_file_path=paths.entry_file_path,
        code_url=build_workflow_code_url(sandbox.sandbox_url, paths.folder_path),
        created=created,
    )


def _ensure_entry_file(
    *,
    sandbox: WorkflowCodeSandbox,
    folder_path: str,
    entry_file_path: str,
    entry_function: str,
    code_capability: str,
) -> bool:
    quoted_folder = shlex.quote(folder_path)
    quoted_entry_file = shlex.quote(entry_file_path)
    output = sandbox.execute_command(
        f"mkdir -p {quoted_folder} && "
        f"if [ -f {quoted_entry_file} ]; "
        f"then printf '%s\\n' {_ENTRY_FILE_EXISTS_MARKER}; "
        f"else printf '%s\\n' {_ENTRY_FILE_MISSING_MARKER}; fi"
    )
    if _ENTRY_FILE_EXISTS_MARKER in output:
        return False

    sandbox.write_file(entry_file_path, _default_main_py(entry_function, code_capability=code_capability))
    return True


def _sandbox_client(sandbox_id: str, sandbox_url: str) -> WorkflowCodeSandbox:
    from deerflow.community.aio_sandbox import AioSandbox

    return AioSandbox(id=sandbox_id, base_url=sandbox_url)


def _sandbox_home_dir(sandbox: WorkflowCodeSandbox) -> str:
    home_dir = getattr(sandbox, "home_dir", "") or DEFAULT_SANDBOX_HOME_DIR
    return home_dir.rstrip("/") or DEFAULT_SANDBOX_HOME_DIR


def _default_main_py(entry_function: str, *, code_capability: str = "python") -> str:
    if code_capability == "browser":
        return _default_browser_main_py(entry_function)
    if code_capability != "python":
        raise ValueError(f"unsupported code capability: {code_capability}")
    return _default_python_main_py(entry_function)


def _entry_file_name_for_capability(code_capability: str) -> str:
    if code_capability == "browser":
        return BROWSER_CODE_FILE_NAME
    if code_capability == "python":
        return DEFAULT_CODE_FILE_NAME
    raise ValueError(f"unsupported code capability: {code_capability}")


def _default_python_main_py(entry_function: str) -> str:
    return (
        "# 在这里，您可以通过 'args' 获取节点中的输入变量，并通过返回对象输出结果\n"
        "# 'args' 会在编码节点运行时注入，args.params 是当前节点的输入参数\n"
        "# 返回对象的 key 需要与节点输出变量名称保持一致\n\n"
        f"async def {entry_function}(args: Args) -> Output:\n"
        "    params = args.params\n"
        "    ret: Output = {\n"
        "        \"key0\": params[\"input\"] + params[\"input\"],\n"
        "        \"key1\": [\"hello\", \"world\"],\n"
        "        \"key2\": {\n"
        "            \"key21\": \"hi\",\n"
        "        },\n"
        "    }\n"
        "    return ret\n"
    )


def _default_browser_main_py(entry_function: str) -> str:
    return (
        "import json\n"
        "from urllib.request import urlopen\n\n"
        "from playwright.async_api import async_playwright\n\n\n"
        "# 浏览器操作会直接调用 AioSandbox 本地 Browser API，并连接内置浏览器/CDP。\n"
        "# 当前沙箱镜像需要包含 Playwright、浏览器运行环境和 VNC/CDP 能力。\n"
        "# 返回对象的 key 需要与节点输出变量名称保持一致。\n"
        f"async def {entry_function}(args: Args) -> Output:\n"
        "    params = args.params\n"
        "    target_url = params[\"url\"]\n\n"
        "    with urlopen(\"http://127.0.0.1:8080/v1/browser/info\", timeout=10) as response:\n"
        "        browser_info = json.loads(response.read().decode(\"utf-8\"))\n\n"
        "    cdp_url = browser_info[\"data\"][\"cdp_url\"]\n\n"
        "    async with async_playwright() as p:\n"
        "        browser = await p.chromium.connect_over_cdp(cdp_url)\n"
        "        context = browser.contexts[0] if browser.contexts else await browser.new_context()\n"
        "        page = context.pages[0] if context.pages else await context.new_page()\n\n"
        "        await page.goto(target_url, wait_until=\"domcontentloaded\")\n"
        "        title = await page.title()\n"
        "        final_url = page.url\n"
        "        screenshot_path = \"/tmp/workflow-browser-screenshot.png\"\n"
        "        await page.screenshot(path=screenshot_path, full_page=True)\n\n"
        "    return {\n"
        "        \"title\": title,\n"
        "        \"url\": final_url,\n"
        "        \"screenshot_path\": screenshot_path,\n"
        "    }\n"
    )


def normalize_workflow_code_path_segment(value: str, field_name: str) -> str:
    normalized = value.strip()
    if not normalized or not _SAFE_ID_PATTERN.match(normalized):
        raise ValueError(f"invalid {field_name}")
    return normalized
