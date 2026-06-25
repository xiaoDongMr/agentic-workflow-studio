import { useMemo, useState } from 'react'
import { Database, LoaderCircle, Package, PlayCircle, Search } from 'lucide-react'

import type { SandboxPythonProbeResult, SandboxSummary } from '@/api/sandbox-pool'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SearchableSelect } from '@/features/sandbox/components/searchable-select'

export function PythonPackageProbePanel({
  probeError,
  probeResult,
  probing,
  runningSandboxes,
  selectedSandboxId,
  onChangeSandbox,
  onProbe,
}: {
  probeError: string
  probeResult: SandboxPythonProbeResult | null
  probing: boolean
  runningSandboxes: SandboxSummary[]
  selectedSandboxId: string
  onChangeSandbox: (sandboxId: string) => void
  onProbe: () => void
}) {
  const [query, setQuery] = useState('')
  const packages = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!probeResult) {
      return []
    }
    if (!keyword) {
      return probeResult.packages
    }
    return probeResult.packages.filter((item) => item.name.toLowerCase().includes(keyword))
  }, [probeResult, query])

  return (
    <div className="overflow-hidden rounded-[24px] border border-white/8 bg-slate-950/42">
      <div className="border-b border-white/8 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Database className="h-4 w-4 text-emerald-200" />
              Python 依赖探测
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              从运行中的 AioSandbox 执行 `python -m pip list --format=json`，用于确认当前镜像真实内置 Python 包。
            </p>
          </div>
          <Badge className="w-fit rounded-xl border-emerald-400/18 bg-emerald-400/10 px-2.5 py-1 text-emerald-100">
            运行时结果
          </Badge>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <SearchableSelect
            value={selectedSandboxId}
            onChange={onChangeSandbox}
            disabled={probing || runningSandboxes.length === 0}
            placeholder={runningSandboxes.length === 0 ? '暂无运行中沙箱' : '选择运行中沙箱'}
            searchPlaceholder="搜索沙箱 ID 或节点"
            options={runningSandboxes.map((sandbox) => ({
              value: sandbox.sandboxId,
              label: sandbox.sandboxId,
              description: sandbox.nodeName || sandbox.image,
            }))}
          />
          <Button type="button" onClick={onProbe} disabled={probing || !selectedSandboxId} className="h-10 shrink-0">
            {probing ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
            {probing ? '探测中' : '探测依赖'}
          </Button>
        </div>

        {probeError ? (
          <div className="mt-3 rounded-2xl border border-rose-400/18 bg-rose-400/10 px-3 py-2 text-xs text-rose-100">
            {probeError}
          </div>
        ) : null}
      </div>

      {probeResult ? (
        <div className="p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-3">
              <div className="text-xs text-slate-500">探测沙箱</div>
              <div className="mt-1 truncate font-mono text-xs text-slate-100">{probeResult.sandboxId}</div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-3">
              <div className="text-xs text-slate-500">Python</div>
              <div className="mt-1 font-mono text-xs text-slate-100">{probeResult.pythonVersion || '-'}</div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-3">
              <div className="text-xs text-slate-500">Python 包</div>
              <div className="mt-1 font-mono text-xs text-slate-100">{probeResult.packageCount}</div>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-2xl border border-white/8 bg-slate-950/40 px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-slate-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索包名，例如 pandas"
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-600"
            />
          </div>

          <div className="mt-3 max-h-[260px] overflow-auto rounded-2xl border border-white/8">
            {packages.length > 0 ? (
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-slate-950/95 text-slate-500 backdrop-blur">
                  <tr>
                    <th className="border-b border-white/8 px-3 py-2 font-medium">包名</th>
                    <th className="border-b border-white/8 px-3 py-2 font-medium">版本</th>
                  </tr>
                </thead>
                <tbody>
                  {packages.map((item) => (
                    <tr key={`${item.name}@${item.version}`} className="border-b border-white/[0.04] last:border-0">
                      <td className="px-3 py-2 font-mono text-slate-200">{item.name}</td>
                      <td className="px-3 py-2 font-mono text-slate-400">{item.version || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="flex min-h-[160px] items-center justify-center p-6 text-center text-sm text-slate-500">
                没有匹配的 Python 包
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-h-[220px] flex-col items-center justify-center p-6 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-300/18 bg-emerald-400/10 text-emerald-200">
            <Package className="h-5 w-5" />
          </div>
          <h4 className="mt-3 text-sm font-semibold text-white">尚未探测 Python 依赖</h4>
          <p className="mt-2 max-w-md text-xs leading-5 text-slate-500">
            选择一个运行中的沙箱后点击探测。探测结果只反映该沙箱当前 Python 环境。
          </p>
        </div>
      )}
    </div>
  )
}
