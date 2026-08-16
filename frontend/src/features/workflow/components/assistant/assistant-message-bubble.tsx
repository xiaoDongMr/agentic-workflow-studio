import { AlertTriangle, Bot, ShieldCheck, Sparkles, UserRound } from 'lucide-react'

import type { WorkflowAssistantMessage } from '@/features/workflow/assistant/types'
import { cn } from '@/lib/utils'

export function AssistantMessageBubble({ message }: { message: WorkflowAssistantMessage }) {
  if (message.role === 'system') {
    const Icon = message.tone === 'error'
      ? AlertTriangle
      : message.tone === 'warning'
        ? AlertTriangle
      : message.tone === 'success'
        ? ShieldCheck
        : Sparkles
    return (
      <div className={cn(
        'mx-auto flex max-w-[92%] items-start gap-2 rounded-xl border px-3 py-2 text-[11px] leading-4',
        message.tone === 'error'
          ? 'border-rose-300/14 bg-rose-400/[0.055] text-rose-100/80'
          : message.tone === 'warning'
            ? 'border-amber-300/14 bg-amber-400/[0.055] text-amber-100/80'
          : message.tone === 'success'
            ? 'border-emerald-300/14 bg-emerald-400/[0.055] text-emerald-100/80'
            : 'border-white/8 bg-white/[0.025] text-slate-400',
      )}>
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{message.content}</span>
      </div>
    )
  }

  const isUser = message.role === 'user'
  return (
    <div className={cn('flex items-end gap-2.5', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-sky-300/14 bg-sky-400/[0.07] text-sky-200">
          <Bot className="h-3.5 w-3.5" />
        </span>
      )}
      <div className={cn(
        'max-w-[82%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-xs leading-5 shadow-[0_8px_24px_rgba(2,6,23,0.14)]',
        isUser
          ? 'rounded-br-md border border-blue-300/16 bg-[linear-gradient(135deg,rgba(59,130,246,0.95),rgba(79,70,229,0.9))] text-white'
          : 'rounded-bl-md border border-white/8 bg-white/[0.045] text-slate-200',
      )}>
        {message.content}
      </div>
      {isUser && (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-blue-300/14 bg-blue-400/[0.08] text-blue-200">
          <UserRound className="h-3.5 w-3.5" />
        </span>
      )}
    </div>
  )
}
