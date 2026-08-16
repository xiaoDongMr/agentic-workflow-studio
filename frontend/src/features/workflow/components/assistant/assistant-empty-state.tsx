import { Circle, GitBranch, Layers3, ShieldCheck, Sparkles, type LucideIcon } from 'lucide-react'

export function AssistantEmptyState({ selectedNodeId }: { selectedNodeId?: string }) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-sky-300/14 bg-[linear-gradient(145deg,rgba(14,165,233,0.11),rgba(15,23,42,0.66)_48%,rgba(99,102,241,0.08))] shadow-[0_20px_60px_rgba(2,6,23,0.2)]">
      <div className="flex items-start gap-3.5 px-4 pb-4 pt-[18px]">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-sky-300/18 bg-sky-400/10 text-sky-100">
          <Sparkles className="h-[18px] w-[18px]" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">从业务目标开始</p>
          <p className="mt-1.5 text-xs leading-5 text-slate-400">
            描述你想实现的流程。我会先确认关键需求，再生成流程草图和完整画布。
          </p>
        </div>
      </div>
      {selectedNodeId && (
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-xl border border-blue-300/12 bg-blue-400/[0.06] px-3 py-2 text-[11px] text-blue-100">
          <Circle className="h-3 w-3 fill-blue-300 text-blue-300" />
          <span className="truncate">当前聚焦节点：{selectedNodeId}</span>
        </div>
      )}
      <div className="grid grid-cols-3 border-t border-white/8 bg-slate-950/22">
        <CapabilityItem icon={GitBranch} label="规划流程" />
        <CapabilityItem icon={Layers3} label="整图生成" />
        <CapabilityItem icon={ShieldCheck} label="节点配置" />
      </div>
    </div>
  )
}

function CapabilityItem({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5 border-r border-white/8 px-2 py-2.5 text-[10px] text-slate-400 last:border-r-0">
      <Icon className="h-3.5 w-3.5 text-sky-300/80" />
      <span>{label}</span>
    </div>
  )
}
