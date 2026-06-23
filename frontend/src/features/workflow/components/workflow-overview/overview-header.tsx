import { Sparkles } from 'lucide-react'

import type { WorkflowDocument } from '@/types/workflow'

export function WorkflowOverviewHeader({ workflow }: { workflow: WorkflowDocument }) {
  return (
    <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-300/16 bg-blue-400/10 px-3 py-1.5 text-xs font-medium text-blue-100">
          <Sparkles className="h-3.5 w-3.5" />
          Workflow Design
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white lg:text-4xl">工作流设计</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
          创建、打开或管理你的工作流。未保存内容会保留在本地草稿中。
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 rounded-[24px] border border-white/8 bg-white/[0.045] p-3">
        <OverviewStat label="节点" value={workflow.nodes.length} />
        <OverviewStat label="连线" value={workflow.edges.length} />
        <OverviewStat label="版本" value={workflow.version.replace(/^v/, '')} />
      </div>
    </div>
  )
}

function OverviewStat({ label, value }: { label: string | number; value: string | number }) {
  return (
    <div className="min-w-[72px] rounded-2xl border border-white/8 bg-slate-950/50 px-3 py-2.5">
      <div className="text-lg font-semibold tracking-tight text-white">{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </div>
  )
}
