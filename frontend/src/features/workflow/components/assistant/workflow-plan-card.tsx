import { Check, WandSparkles, X } from 'lucide-react'

import type { WorkflowPlanPreview } from '@/features/workflow/assistant/types'

import { WorkflowPlanDiagram } from './workflow-plan-diagram'

export function WorkflowPlanCard({
  plan,
  confirmed,
  isStreaming,
  onConfirm,
  onCancel,
}: {
  plan: WorkflowPlanPreview
  confirmed: boolean
  isStreaming: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden rounded-[22px] border border-violet-300/16 bg-violet-500/[0.045] shadow-[0_16px_44px_rgba(15,23,42,0.18)]">
      <div className="flex items-start justify-between gap-3 border-b border-white/8 bg-[linear-gradient(135deg,rgba(139,92,246,0.12),rgba(15,23,42,0.38))] px-4 py-3.5">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-violet-300/18 bg-violet-400/10 text-violet-100">
            <WandSparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-violet-50">流程草图</p>
            <p className="mt-1 text-[11px] leading-4 text-slate-400">{plan.summary}</p>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-violet-300/16 bg-violet-400/[0.07] px-2 py-1 text-[10px] text-violet-100">
          {confirmed && <Check className="h-3 w-3" />}
          {confirmed ? '已确认' : '待确认'}
        </span>
      </div>
      <div className="p-4">
        <div className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-white/8 bg-slate-950/64">
          <div className="flex items-center justify-between border-b border-white/8 px-3 py-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">流程预览</span>
            <span className="text-[10px] text-slate-600">可视化草图</span>
          </div>
          <WorkflowPlanDiagram source={plan.mermaid} />
          <details className="border-t border-white/8">
            <summary className="cursor-pointer list-none px-3 py-2 text-[10px] text-slate-500 hover:text-slate-300 [&::-webkit-details-marker]:hidden">
              查看 Mermaid 源码
            </summary>
            <pre className="max-h-48 overflow-auto border-t border-white/8 p-3.5 text-[11px] leading-5 text-sky-100/90">
              {plan.mermaid}
            </pre>
          </details>
        </div>
        {!confirmed && (
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={isStreaming}
              onClick={onConfirm}
              className="flex h-9 flex-1 items-center justify-center gap-2 rounded-xl border border-violet-300/18 bg-violet-500 text-xs font-semibold text-white shadow-[0_10px_24px_rgba(124,58,237,0.2)] transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              确认并生成
            </button>
            <button
              type="button"
              disabled={isStreaming}
              onClick={onCancel}
              className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.025] px-3 text-xs text-slate-300 transition hover:bg-white/[0.06] disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
              取消
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
