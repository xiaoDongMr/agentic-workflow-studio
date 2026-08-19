import { Server } from 'lucide-react'

export function WorkflowSandboxRequirementCard({
  bound,
  isStreaming,
  reason,
  requestedCapabilities,
  sandboxId,
  onContinue,
  onOpenSandbox,
}: {
  bound: boolean
  isStreaming: boolean
  reason: string
  requestedCapabilities: string[]
  sandboxId?: string
  onContinue: () => void
  onOpenSandbox: () => void
}) {
  return (
    <div className="overflow-hidden rounded-[22px] border border-emerald-300/16 bg-emerald-400/[0.055]">
      <div className="flex items-start gap-3 border-b border-white/8 bg-emerald-400/[0.05] px-4 py-3.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-emerald-300/18 bg-emerald-400/10 text-emerald-100">
          <Server className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-emerald-50">需要工作流沙箱</p>
          <p className="mt-1 text-[11px] leading-5 text-slate-400">{reason}</p>
        </div>
      </div>
      <div className="space-y-3 p-4">
        {requestedCapabilities.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {requestedCapabilities.map((capability) => (
              <span
                key={capability}
                className="rounded-lg border border-white/8 bg-slate-950/44 px-2 py-1 font-mono text-[10px] text-slate-300"
              >
                {capability}
              </span>
            ))}
          </div>
        )}
        {bound ? (
          <p className="truncate rounded-xl border border-emerald-300/14 bg-emerald-400/[0.07] px-3 py-2 font-mono text-[11px] text-emerald-100">
            已绑定：{sandboxId}
          </p>
        ) : (
          <p className="text-[11px] leading-5 text-amber-100/80">
            请先人工创建或关联沙箱，绑定完成后再继续当前任务。
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onOpenSandbox}
            className="flex h-9 flex-1 items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] px-3 text-xs font-medium text-slate-200 transition hover:bg-white/[0.07]"
          >
            {bound ? '查看沙箱' : '打开沙箱绑定'}
          </button>
          <button
            type="button"
            disabled={!bound || isStreaming}
            onClick={onContinue}
            className="flex h-9 flex-1 items-center justify-center rounded-xl border border-emerald-300/18 bg-emerald-500 px-3 text-xs font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-45"
          >
            已完成绑定，继续
          </button>
        </div>
      </div>
    </div>
  )
}
