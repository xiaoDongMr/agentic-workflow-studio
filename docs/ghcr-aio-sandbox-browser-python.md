# GHCR aio-sandbox Playwright 镜像

本文档说明如何使用和发布一个基于 `aio-sandbox` 的 Python Playwright 镜像。

该镜像只额外安装 Python 侧的 `playwright` 包，不下载 Playwright 自带浏览器。运行时应优先连接 `aio-sandbox` 已提供的浏览器/CDP 能力。

## 公共镜像

当前已发布公共镜像：

```text
ghcr.io/xiaodongmr/aio-sandbox-browser-python:latest
```

该镜像是 public，可以直接在沙箱资源池中配置，不需要 Kubernetes `imagePullSecret`。

## 使用方式

可以直接在沙箱资源池的镜像管理中添加自定义镜像：

- 名称：`AioSandbox Python Browser`
- 镜像地址：`ghcr.io/xiaodongmr/aio-sandbox-browser-python:latest`
- 描述：`aio-sandbox with Python Playwright`
- 能力标签：`Python`、`Playwright`、`Browser CDP`

也可以把它作为基础镜像继续扩展：

```dockerfile
FROM ghcr.io/xiaodongmr/aio-sandbox-browser-python:latest

RUN python -m pip install --no-cache-dir <your-python-package>
```

## 发布新版本

镜像 Dockerfile 位于：

```text
docker/aio-sandbox-browser-python.Dockerfile
```

基础镜像：

```text
enterprise-public-cn-beijing.cr.volces.com/vefaas-public/all-in-one-sandbox:latest
```

登录 GHCR：

```bash
export GHCR_OWNER=<github-owner-or-org>
export IMAGE_NAME=aio-sandbox-browser-python

echo "${GITHUB_TOKEN}" | docker login ghcr.io -u "${GHCR_OWNER}" --password-stdin
```

构建并发布 `latest`：

```bash
docker buildx build \
  --platform linux/amd64 \
  -f docker/aio-sandbox-browser-python.Dockerfile \
  -t ghcr.io/${GHCR_OWNER}/${IMAGE_NAME}:latest \
  --push \
  .
```

发布后确认镜像：

```bash
docker buildx imagetools inspect ghcr.io/${GHCR_OWNER}/${IMAGE_NAME}:latest
```

如果集群节点是 ARM64，把 `--platform` 改为 `linux/arm64`；需要多架构时使用 `linux/amd64,linux/arm64`。

## 验证

在运行中的沙箱里验证 Python 依赖：

```bash
python - <<'PY'
import playwright
print("playwright dependency ok")
PY
```

连接已有 Chromium CDP：

```python
import json
from urllib.request import urlopen

from playwright.sync_api import sync_playwright

with urlopen("http://127.0.0.1:8080/v1/browser/info", timeout=10) as response:
    browser_info = json.loads(response.read().decode("utf-8"))

cdp_url = browser_info["data"]["cdp_url"]

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp(cdp_url)
    context = browser.contexts[0] if browser.contexts else browser.new_context()
    page = context.pages[0] if context.pages else context.new_page()
    page.goto("https://example.com", wait_until="domcontentloaded")
    print(page.title())
```

编码节点浏览器操作默认模板建议使用同样方式：直接访问 AioSandbox 本地 API 获取 CDP 地址，不依赖 `agent_sandbox` SDK。

```python
import json
from urllib.request import urlopen

from playwright.async_api import async_playwright


async def main(args: Args) -> Output:
    params = args.params
    target_url = params["url"]

    with urlopen("http://127.0.0.1:8080/v1/browser/info", timeout=10) as response:
        browser_info = json.loads(response.read().decode("utf-8"))

    cdp_url = browser_info["data"]["cdp_url"]

    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(cdp_url)
        context = browser.contexts[0] if browser.contexts else await browser.new_context()
        page = context.pages[0] if context.pages else await context.new_page()

        await page.goto(target_url, wait_until="domcontentloaded")
        title = await page.title()
        final_url = page.url
        screenshot_path = "/tmp/workflow-browser-screenshot.png"
        await page.screenshot(path=screenshot_path, full_page=True)

    return {
        "title": title,
        "url": final_url,
        "screenshot_path": screenshot_path,
    }
```

## 排查

- `pull access denied`：确认镜像是 public，或为私有镜像配置 Kubernetes `imagePullSecret`。
- `exec format error`：镜像平台和 Kubernetes 节点架构不一致，重新按节点架构构建。
- `playwright` 无法直接启动浏览器：该镜像没有下载 Playwright 自带浏览器，请连接 `aio-sandbox` 中已有的浏览器/CDP。
