import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

export function StatCard({
  icon: Icon,
  label,
  value,
  tone = 'blue',
}: {
  icon: LucideIcon
  label: string
  value: string | number
  tone?: 'blue' | 'emerald' | 'amber' | 'violet'
}) {
  const toneClass = {
    blue: 'border-blue-400/20 bg-blue-400/10 text-blue-200',
    emerald: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    amber: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
    violet: 'border-violet-400/20 bg-violet-400/10 text-violet-200',
  }[tone]

  return (
    <div className="rounded-[22px] border border-white/8 bg-white/[0.045] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className={cn('inline-flex h-10 w-10 items-center justify-center rounded-2xl border', toneClass)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-4 text-2xl font-semibold tracking-tight text-white">{value}</div>
      <div className="mt-1 text-xs text-slate-400">{label}</div>
    </div>
  )
}
