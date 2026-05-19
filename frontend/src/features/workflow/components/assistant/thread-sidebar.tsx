import { History, RefreshCw, X } from 'lucide-react'

import type { AssistantThreadSummary } from '@/api/assistant-history'
import { cn } from '@/lib/utils'

import { formatRelativeTimestamp, getThreadSummarySubtitle, getThreadSummaryTitle } from './thread-utils'

interface ThreadHistoryDrawerProps {
  activeThreadId?: string
  threads: AssistantThreadSummary[]
  threadsLoading: boolean
  historyLoading: boolean
  isStreaming: boolean
  open: boolean
  onClose: () => void
  onNewThread: () => void
  onSelectThread: (threadId: string) => void
}

export function ThreadHistoryDrawer({
  activeThreadId,
  threads,
  threadsLoading,
  historyLoading,
  isStreaming,
  open,
  onClose,
  onNewThread,
  onSelectThread,
}: ThreadHistoryDrawerProps) {
  if (!open) {
    return null
  }

  const handleNewThread = () => {
    onNewThread()
    onClose()
  }

  const handleSelectThread = (threadId: string) => {
    onSelectThread(threadId)
    onClose()
  }

  return (
    <div className="absolute inset-0 z-20">
      <button
        type="button"
        aria-label="关闭历史会话"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]"
      />
      <aside className="absolute top-0 bottom-0 left-0 flex w-[min(300px,82%)] flex-col border-r border-white/10 bg-slate-950/95 shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <History className="h-4 w-4 text-blue-200" />
              历史会话
            </div>
            <p className="mt-1 text-[11px] text-slate-500">选择一个会话后自动回到对话区</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/8 hover:text-white"
            aria-label="关闭历史会话"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-white/8 px-4 py-3">
          <button
            type="button"
            onClick={handleNewThread}
            disabled={isStreaming}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            新建会话
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <div className="space-y-2">
            {threadsLoading && threads.length === 0 && (
              <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-3 text-[11px] text-slate-400">
                正在加载会话列表...
              </div>
            )}

            {!threadsLoading && threads.length === 0 && (
              <div className="rounded-xl border border-dashed border-white/8 px-3 py-3 text-[11px] leading-5 text-slate-500">
                暂无历史会话，发送首条消息后会出现在这里。
              </div>
            )}

            {threads.map((item) => {
              const active = item.thread_id === activeThreadId
              return (
                <button
                  key={item.thread_id}
                  type="button"
                  onClick={() => handleSelectThread(item.thread_id)}
                  disabled={isStreaming || historyLoading}
                  className={cn(
                    'w-full rounded-2xl border px-3 py-3 text-left transition-colors',
                    active
                      ? 'border-blue-400/25 bg-blue-500/10 text-white'
                      : 'border-white/8 bg-white/4 text-slate-300 hover:bg-white/8',
                  )}
                >
                  <div className="line-clamp-2 text-xs font-medium leading-5">{getThreadSummaryTitle(item)}</div>
                  <div className="mt-2 line-clamp-1 text-[11px] text-slate-500">
                    {getThreadSummarySubtitle(item)}
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500">{formatRelativeTimestamp(item.updated_at)}</div>
                </button>
              )
            })}

            {threadsLoading && threads.length > 0 && (
              <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-[11px] text-slate-500">
                正在刷新会话列表...
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}

export const ThreadSidebar = ThreadHistoryDrawer
