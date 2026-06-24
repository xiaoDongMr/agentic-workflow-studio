from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Request

from deerflow.config.app_config import get_app_config as get_latest_app_config

from app.deps import get_app_config as get_runtime_app_config
from app.sandbox_pool import KubernetesApiSandboxPool
from app.sandbox_pool.schemas import (
    SandboxCreateRequest,
    SandboxListResponse,
    SandboxPoolHealth,
    SandboxPythonPackage,
    SandboxPythonProbeResult,
    SandboxSummary,
)

router = APIRouter()


def _pool(request: Request) -> KubernetesApiSandboxPool:
    # Load the latest config from disk so sandbox-pool provider switches do not
    # require a full backend restart while iterating on cluster connectivity.
    try:
        app_config = get_latest_app_config()
    except Exception:
        app_config = get_runtime_app_config(request)
    return KubernetesApiSandboxPool(app_config)


@router.get("/sandbox-pool/health", response_model=SandboxPoolHealth)
async def sandbox_pool_health(request: Request) -> SandboxPoolHealth:
    return SandboxPoolHealth.model_validate(_pool(request).health())


@router.get("/sandboxes", response_model=SandboxListResponse)
async def list_sandboxes(request: Request) -> SandboxListResponse:
    try:
        return SandboxListResponse(sandboxes=_pool(request).list())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/sandboxes", response_model=SandboxSummary)
async def create_sandbox(body: SandboxCreateRequest, request: Request) -> SandboxSummary:
    try:
        return _pool(request).create(body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/sandboxes/{sandbox_id}", response_model=SandboxSummary)
async def get_sandbox(sandbox_id: str, request: Request) -> SandboxSummary:
    try:
        return _pool(request).get(sandbox_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/sandboxes/{sandbox_id}")
async def delete_sandbox(sandbox_id: str, request: Request) -> dict[str, bool]:
    try:
        _pool(request).delete(sandbox_id)
        return {"ok": True}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/sandboxes/{sandbox_id}/python-packages/probe", response_model=SandboxPythonProbeResult)
async def probe_sandbox_python_packages(sandbox_id: str, request: Request) -> SandboxPythonProbeResult:
    try:
        summary = _pool(request).get(sandbox_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if summary.status != "Running":
        raise HTTPException(status_code=400, detail="sandbox must be Running before probing Python packages")
    if not summary.sandbox_url:
        raise HTTPException(status_code=400, detail="sandbox_url is empty")

    try:
        from deerflow.community.aio_sandbox import AioSandbox

        sandbox = AioSandbox(id=summary.sandbox_id, base_url=summary.sandbox_url)
        output = sandbox.execute_command(
            "python - <<'PY'\n"
            "import json, subprocess, sys\n"
            "payload = {'pythonVersion': sys.version.split()[0], 'packages': []}\n"
            "try:\n"
            "    result = subprocess.run(\n"
            "        [sys.executable, '-m', 'pip', 'list', '--format=json'],\n"
            "        check=True,\n"
            "        text=True,\n"
            "        stdout=subprocess.PIPE,\n"
            "        stderr=subprocess.PIPE,\n"
            "        timeout=120,\n"
            "    )\n"
            "    payload['packages'] = json.loads(result.stdout or '[]')\n"
            "except Exception as exc:\n"
            "    payload['error'] = str(exc)\n"
            "print(json.dumps(payload, ensure_ascii=False))\n"
            "PY"
        )
        data = _extract_probe_json(output)
        packages = [
            SandboxPythonPackage(name=str(item.get("name", "")), version=str(item.get("version", "")))
            for item in data.get("packages", [])
            if isinstance(item, dict) and item.get("name")
        ]
        packages.sort(key=lambda item: item.name.lower())
        return SandboxPythonProbeResult(
            sandbox_id=summary.sandbox_id,
            sandbox_url=summary.sandbox_url,
            python_version=str(data.get("pythonVersion", "")),
            package_count=len(packages),
            packages=packages,
            raw_output=output,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


def _extract_probe_json(output: str) -> dict[str, object]:
    lines = [line.strip() for line in output.splitlines() if line.strip()]
    for line in reversed(lines):
        if not line.startswith("{"):
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            return value
    raise ValueError("failed to parse Python package probe output")
