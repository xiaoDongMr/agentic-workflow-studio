import { Box, ExternalLink, LoaderCircle, Trash2 } from 'lucide-react'

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
  return (
    <article className="group overflow-hidden rounded-[24px] border border-white/8 bg-white/[0.045] shadow-[0_18px_48px_rgba(2,6,23,0.24)] transition hover:border-blue-300/18 hover:bg-white/[0.06]">
      <div className="border-b border-white/8 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-blue-300/20 bg-blue-400/12 text-blue-200">
                <Box className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-white">{sandbox.sandboxId}</h3>
                <p className="mt-0.5 truncate text-xs text-slate-500">{sandbox.podName || '未绑定 Pod'}</p>
              </div>
            </div>
          </div>
          <Badge className={cn('shrink-0 rounded-xl px-2.5 py-1', statusClassName(sandbox.status))}>
            {statusLabel(sandbox.status)}
          </Badge>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-2xl border border-white/8 bg-slate-950/32 p-3">
            <div className="text-slate-500">命名空间</div>
            <div className="mt-1 truncate font-medium text-slate-200">{sandbox.namespace || '-'}</div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-slate-950/32 p-3">
            <div className="text-slate-500">节点</div>
            <div className="mt-1 truncate font-medium text-slate-200">{sandbox.nodeName || '-'}</div>
          </div>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-xs text-slate-500">
            <ExternalLink className="h-3.5 w-3.5" />
            访问地址
          </div>
          <div className="break-all rounded-2xl border border-white/8 bg-slate-950/36 px-3 py-2 font-mono text-xs text-blue-100">
            {sandbox.sandboxUrl || '-'}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
          <div className="rounded-2xl bg-white/[0.035] p-3">
            <div className="text-slate-500">Pod IP</div>
            <div className="mt-1 font-medium text-slate-200">{sandbox.podIp || '-'}</div>
          </div>
          <div className="rounded-2xl bg-white/[0.035] p-3">
            <div className="text-slate-500">创建时间</div>
            <div className="mt-1 font-medium text-slate-200">{formatDate(sandbox.createdAt)}</div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-3">
          <div className="text-xs text-slate-500">运行镜像</div>
          <div className="mt-1 break-all font-mono text-xs text-slate-200">{sandbox.image || '-'}</div>
          {sandbox.imageId ? <div className="mt-1 font-mono text-[11px] text-slate-600">image id: {sandbox.imageId}</div> : null}
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="min-w-0 truncate text-xs text-slate-500">
            Service: {sandbox.serviceName || '-'}
            {sandbox.ingressName ? ` · Ingress: ${sandbox.ingressName}` : ''}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={deleting}
            onClick={() => onDelete(sandbox.sandboxId)}
            className="border-rose-400/10 text-rose-200 hover:bg-rose-400/10"
          >
            {deleting ? <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
            删除
          </Button>
        </div>
      </div>
    </article>
  )
}
