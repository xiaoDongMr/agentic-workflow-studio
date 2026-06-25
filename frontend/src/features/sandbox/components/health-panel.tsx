import { AlertTriangle, Cpu, Layers3, Network, Server } from 'lucide-react'

import type { SandboxPoolHealth } from '@/api/sandbox-pool'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export function HealthPanel({ health }: { health: SandboxPoolHealth | null }) {
  const errorText = health?.extra.error
  const enabled = health?.enabled ?? false

  return (
    <section className="rounded-3xl border border-white/8 bg-white/[0.035] p-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(220px,0.7fr)_minmax(0,1.3fr)_auto] xl:items-center">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-blue-300/18 bg-blue-400/10 text-blue-200">
            <Layers3 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold tracking-tight text-white">资源池连接状态</h3>
            <p className="mt-1 text-xs text-slate-500">Kubernetes Sandbox Pool</p>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          <div className="rounded-2xl border border-white/8 bg-slate-950/32 px-3 py-2.5">
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <Server className="h-3.5 w-3.5 text-blue-300" />
              Backend
            </div>
            <div className="mt-1 truncate text-xs font-medium text-slate-100">{health?.backend ?? '-'}</div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-slate-950/32 px-3 py-2.5">
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <Network className="h-3.5 w-3.5 text-emerald-300" />
              Namespace
            </div>
            <div className="mt-1 truncate text-xs font-medium text-slate-100">{health?.namespace ?? '-'}</div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-slate-950/32 px-3 py-2.5">
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <Cpu className="h-3.5 w-3.5 text-violet-300" />
              Client
            </div>
            <div className="mt-1 truncate text-xs font-medium text-slate-100">{health?.client ?? '-'}</div>
          </div>
        </div>

        <Badge
          className={cn(
            'w-fit rounded-2xl px-3 py-2 text-sm xl:justify-self-end',
            enabled && !errorText
              ? 'border-emerald-400/24 bg-emerald-400/10 text-emerald-200'
              : 'border-amber-400/24 bg-amber-400/10 text-amber-200',
          )}
        >
          {enabled && !errorText ? '资源池可用' : '等待配置'}
        </Badge>
      </div>

      {errorText ? (
        <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorText}</span>
          </div>
        </div>
      ) : null}
    </section>
  )
}
