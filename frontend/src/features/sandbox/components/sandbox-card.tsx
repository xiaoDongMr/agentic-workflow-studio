import type { ReactNode } from 'react'
import { Box, Clock3, ExternalLink, LoaderCircle, Network, Server, Trash2 } from 'lucide-react'

import type { SandboxSummary } from '@/api/sandbox-pool'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDate, statusClassName, statusLabel } from '@/features/sandbox/sandbox-pool-utils'
import { cn } from '@/lib/utils'

export function SandboxCard({
  sandbox,
  deleting,
  onDelete,
}: {
  sandbox: SandboxSummary
  deleting: boolean
  onDelete: (sandboxId: string) => void
}) {
  const resourceSummary = [
    sandbox.serviceName ? `Service: ${sandbox.serviceName}` : '',
    sandbox.ingressName ? `Ingress: ${sandbox.ingressName}` : '',
  ].filter(Boolean).join(' · ') || 'Service: -'

  return (
    <article className="group overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/54 shadow-[0_18px_52px_rgba(2,6,23,0.24)] transition hover:-translate-y-0.5 hover:border-blue-300/24 hover:bg-slate-950/70">
      <div className="relative border-b border-white/8 p-4">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_18%_0%,rgba(96,165,250,0.18),transparent_42%),radial-gradient(circle_at_86%_12%,rgba(16,185,129,0.12),transparent_34%)]" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-300/22 bg-blue-400/12 text-blue-100 shadow-[0_14px_30px_rgba(37,99,235,0.14)]">
              <Box className="h-5 w-5" />
            </span>
            <div className="min-w-0 pt-0.5">
              <h3 className="truncate text-base font-semibold tracking-tight text-white" title={sandbox.sandboxId}>
                {sandbox.sandboxId}
              </h3>
              <p className="mt-1 truncate font-mono text-xs text-slate-500" title={sandbox.podName || '未绑定 Pod'}>
                {sandbox.podName || '未绑定 Pod'}
              </p>
            </div>
          </div>
          <Badge className={cn('shrink-0 rounded-2xl px-3 py-1.5 text-xs font-semibold', statusClassName(sandbox.status))}>
            {statusLabel(sandbox.status)}
          </Badge>
        </div>

        <div className="relative mt-4 grid grid-cols-2 gap-2">
          <SandboxCardMetric label="命名空间" value={sandbox.namespace || '-'} />
          <SandboxCardMetric label="节点" value={sandbox.nodeName || '-'} />
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-xs text-slate-500">
            <ExternalLink className="h-3.5 w-3.5" />
            访问地址
          </div>
          <div
            className="truncate rounded-2xl border border-blue-300/12 bg-blue-400/[0.055] px-3 py-2.5 font-mono text-xs text-blue-100"
            title={sandbox.sandboxUrl || '-'}
          >
            {sandbox.sandboxUrl || '-'}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
          <SandboxInfoPill icon={<Network className="h-3.5 w-3.5" />} label="Pod IP" value={sandbox.podIp || '-'} />
          <SandboxInfoPill icon={<Clock3 className="h-3.5 w-3.5" />} label="创建时间" value={formatDate(sandbox.createdAt)} />
        </div>

        <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Server className="h-3.5 w-3.5" />
            运行镜像
          </div>
          <div className="mt-1 truncate font-mono text-xs text-slate-200" title={sandbox.image || '-'}>
            {sandbox.image || '-'}
          </div>
          {sandbox.imageId ? (
            <div className="mt-1 truncate font-mono text-[11px] text-slate-600" title={sandbox.imageId}>
              image id: {sandbox.imageId}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-3 pt-1">
          <span className="min-w-0 flex-1 truncate rounded-2xl border border-white/8 bg-slate-950/36 px-3 py-2 font-mono text-[11px] text-slate-500" title={resourceSummary}>
            {resourceSummary}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={deleting}
            onClick={() => onDelete(sandbox.sandboxId)}
            className="h-9 shrink-0 rounded-2xl border border-rose-400/16 bg-rose-400/[0.055] px-3 text-rose-100 hover:border-rose-300/30 hover:bg-rose-400/12 disabled:opacity-70"
          >
            {deleting ? <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
            删除
          </Button>
        </div>
      </div>
    </article>
  )
}

function SandboxCardMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/8 bg-slate-950/42 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 truncate text-sm font-medium text-slate-200" title={value}>
        {value}
      </div>
    </div>
  )
}

function SandboxInfoPill({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="min-w-0 rounded-2xl bg-white/[0.04] p-3">
      <div className="flex items-center gap-1.5 text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-1 truncate font-medium text-slate-200" title={value}>
        {value}
      </div>
    </div>
  )
}
