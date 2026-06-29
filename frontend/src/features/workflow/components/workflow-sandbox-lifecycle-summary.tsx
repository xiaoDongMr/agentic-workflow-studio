import type { SandboxSummary } from '@/api/sandbox-pool'
import { formatExpiresAt, formatRemainingTtl, formatTtlSeconds } from '@/features/sandbox/sandbox-pool-utils'
import { cn } from '@/lib/utils'

interface WorkflowSandboxLifecycleSummaryProps {
  sandbox: SandboxSummary
}

export function WorkflowSandboxLifecycleSummary({ sandbox }: WorkflowSandboxLifecycleSummaryProps) {
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-3">
      <WorkflowSandboxLifecycleMetric
        label="剩余时间"
        tone={sandbox.expired ? 'danger' : 'default'}
        value={formatRemainingTtl(sandbox.expiresAt, sandbox.expired)}
      />
      <WorkflowSandboxLifecycleMetric label="TTL" value={formatTtlSeconds(sandbox.ttlSeconds)} />
      <WorkflowSandboxLifecycleMetric label="过期时间" value={formatExpiresAt(sandbox.expiresAt)} />
    </div>
  )
}

function WorkflowSandboxLifecycleMetric({
  label,
  tone = 'default',
  value,
}: {
  label: string
  tone?: 'danger' | 'default'
  value: string
}) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-xl border bg-slate-950/36 px-2.5 py-2',
        tone === 'danger' ? 'border-rose-300/18 text-rose-100' : 'border-white/8 text-slate-100',
      )}
    >
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="mt-1 truncate text-[11px] font-semibold" title={value}>
        {value}
      </p>
    </div>
  )
}
