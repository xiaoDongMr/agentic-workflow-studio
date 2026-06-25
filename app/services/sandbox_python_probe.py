from __future__ import annotations

import json

from app.sandbox_pool.schemas import SandboxPythonPackage, SandboxPythonProbeResult, SandboxSummary


PYTHON_PACKAGE_PROBE_COMMAND = (
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


def probe_python_packages(summary: SandboxSummary) -> SandboxPythonProbeResult:
    from deerflow.community.aio_sandbox import AioSandbox

    sandbox = AioSandbox(id=summary.sandbox_id, base_url=summary.sandbox_url)
    output = sandbox.execute_command(PYTHON_PACKAGE_PROBE_COMMAND)
    data = extract_probe_json(output)
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


def extract_probe_json(output: str) -> dict[str, object]:
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
