import { type ReactNode, useState } from 'react'
import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'error'

interface StatusPillProps {
  tone: StatusTone
  label: string
}

const STATUS_TONE_CLASS_NAMES: Record<StatusTone, string> = {
  neutral: 'border-white/10 bg-white/5 text-slate-300',
  info: 'border-blue-400/20 bg-blue-500/10 text-blue-200',
  success: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200',
  warning: 'border-amber-400/20 bg-amber-500/10 text-amber-100',
  error: 'border-rose-400/20 bg-rose-500/10 text-rose-100',
}

export function StatusPill({ tone, label }: StatusPillProps) {
  return (
    <span className={cn('rounded-full border px-2 py-1 text-[11px] font-medium', STATUS_TONE_CLASS_NAMES[tone])}>
      {label}
    </span>
  )
}

interface ExpandableSectionProps {
  icon: ReactNode
  title: string
  status?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}

export function ExpandableSection({
  icon,
  title,
  status,
  defaultOpen = false,
  children,
}: ExpandableSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="overflow-hidden rounded-2xl border border-white/8 bg-black/15">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="text-slate-300">{icon}</span>
          <span className="truncate text-sm font-medium text-slate-100">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {status}
          <ChevronDown className={cn('h-4 w-4 text-slate-500 transition-transform', open && 'rotate-180')} />
        </div>
      </button>
      {open && <div className="border-t border-white/6 px-4 py-4">{children}</div>}
    </div>
  )
}

export function TextContent({ content, muted = false }: { content: string; muted?: boolean }) {
  return (
    <div
      className={cn(
        'whitespace-pre-wrap break-words text-sm leading-6',
        muted ? 'text-slate-300/90' : 'text-slate-100',
      )}
    >
      {content}
    </div>
  )
}

export function CodeLikeBlock({ content }: { content: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-white/6 bg-slate-950/85 p-3 text-xs leading-5 text-slate-300">
      {content}
    </pre>
  )
}
