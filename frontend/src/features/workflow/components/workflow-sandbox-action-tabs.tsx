import type { ReactNode } from 'react'
import { Link2, Plus } from 'lucide-react'

import { cn } from '@/lib/utils'

export type WorkflowSandboxActionMode = 'create' | 'existing'

interface WorkflowSandboxActionTabsProps {
  value: WorkflowSandboxActionMode
  onChange: (mode: WorkflowSandboxActionMode) => void
}

const WORKFLOW_SANDBOX_ACTIONS: Array<{
  description: string
  icon: ReactNode
  label: string
  value: WorkflowSandboxActionMode
}> = [
  {
    description: '选择镜像并设置过期时间',
    icon: <Plus className="h-3.5 w-3.5" />,
    label: '创建新沙箱',
    value: 'create',
  },
  {
    description: '从运行中实例中选择',
    icon: <Link2 className="h-3.5 w-3.5" />,
    label: '关联已有沙箱',
    value: 'existing',
  },
]

export function WorkflowSandboxActionTabs({ value, onChange }: WorkflowSandboxActionTabsProps) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-2xl border border-white/8 bg-slate-950/64 p-1">
      {WORKFLOW_SANDBOX_ACTIONS.map((action) => (
        <WorkflowSandboxActionTab
          key={action.value}
          active={action.value === value}
          action={action}
          onClick={() => onChange(action.value)}
        />
      ))}
    </div>
  )
}

function WorkflowSandboxActionTab({
  active,
  action,
  onClick,
}: {
  active: boolean
  action: (typeof WORKFLOW_SANDBOX_ACTIONS)[number]
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition',
        active
          ? 'border-emerald-300/24 bg-emerald-400/12 text-emerald-50 shadow-[0_10px_24px_rgba(16,185,129,0.08)]'
          : 'border-transparent text-slate-400 hover:border-white/8 hover:bg-white/[0.04] hover:text-slate-100',
      )}
    >
      <span
        className={cn(
          'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border',
          active ? 'border-emerald-300/24 bg-emerald-400/12 text-emerald-100' : 'border-white/8 bg-slate-950/50',
        )}
      >
        {action.icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold">{action.label}</span>
        <span className="mt-0.5 block truncate text-[10px] text-slate-500">{action.description}</span>
      </span>
    </button>
  )
}
