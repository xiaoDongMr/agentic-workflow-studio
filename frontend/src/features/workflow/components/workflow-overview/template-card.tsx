import { ArrowUpRight, Bot, Code2, GitBranch } from 'lucide-react'

import { cn } from '@/lib/utils'

export const workflowTemplateCards = [
  {
    title: '智能问答链路',
    description: '开始节点接用户输入，经过大模型生成结构化答案，再由结束节点输出。',
    icon: Bot,
    tone: 'blue',
  },
  {
    title: '条件分支处理',
    description: '适合需要根据规则选择不同执行路径的客服、审核和任务分发场景。',
    icon: GitBranch,
    tone: 'amber',
  },
  {
    title: '代码转换流程',
    description: '把模型结果交给代码节点清洗、聚合或转换，再返回稳定 JSON。',
    icon: Code2,
    tone: 'violet',
  },
] as const

export function TemplateCard({
  template,
  onUse,
}: {
  template: (typeof workflowTemplateCards)[number]
  onUse: () => void
}) {
  const Icon = template.icon
  const toneClass = {
    blue: 'border-blue-300/18 bg-blue-400/10 text-blue-100',
    amber: 'border-amber-300/18 bg-amber-400/10 text-amber-100',
    violet: 'border-violet-300/18 bg-violet-400/10 text-violet-100',
  }[template.tone]

  return (
    <button
      type="button"
      onClick={onUse}
      className="group rounded-[24px] border border-white/8 bg-white/[0.045] p-4 text-left transition hover:-translate-y-0.5 hover:border-blue-300/24 hover:bg-white/[0.07]"
    >
      <div className={cn('flex h-11 w-11 items-center justify-center rounded-2xl border', toneClass)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-white">{template.title}</p>
          <p className="mt-2 text-sm leading-6 text-slate-400">{template.description}</p>
        </div>
        <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-slate-500 transition group-hover:text-blue-200" />
      </div>
    </button>
  )
}
