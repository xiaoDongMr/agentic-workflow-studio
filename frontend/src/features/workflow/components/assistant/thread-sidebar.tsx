import { useState } from 'react'
import { FileJson, FileText, History, MoreHorizontal, Pencil, RefreshCw, Search, Trash2, X } from 'lucide-react'

import type { AssistantThreadSummary } from '@/api/assistant-history'
import { cn } from '@/lib/utils'

import { formatRelativeTimestamp, getThreadSummaryTitle, getThreadUpdatedAt } from './thread-utils'

interface ThreadHistoryDrawerProps {
  activeThreadId?: string
  threads: AssistantThreadSummary[]
  threadsLoading: boolean
  historyLoading: boolean
  isStreaming: boolean
  open: boolean
  onClose: () => void
  onDeleteThread: (threadId: string) => Promise<void>
  onExportThread: (thread: AssistantThreadSummary, format: 'markdown' | 'json') => Promise<void>
  onNewThread: () => void
  onRenameThread: (threadId: string, title: string) => Promise<void>
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
  onDeleteThread,
  onExportThread,
  onNewThread,
  onRenameThread,
  onSelectThread,
}: ThreadHistoryDrawerProps) {
  const [menuThreadId, setMenuThreadId] = useState<string | null>(null)
  const [renameThread, setRenameThread] = useState<AssistantThreadSummary | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteThread, setDeleteThread] = useState<AssistantThreadSummary | null>(null)
  const [searchValue, setSearchValue] = useState('')

  if (!open) {
    return null
  }

  const filteredThreads = threads.filter((thread) =>
    getThreadSummaryTitle(thread).toLowerCase().includes(searchValue.trim().toLowerCase()),
  )

  const getLocalStatusMeta = (threadId: string) => {
    if (threadId !== activeThreadId) {
      return null
    }

    if (isStreaming) {
      return {
        label: '生成中',
        tone: 'info' as const,
        pulse: true,
      }
    }

    if (historyLoading) {
      return {
        label: '加载中',
        tone: 'neutral' as const,
        pulse: true,
      }
    }

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

  const handleStartRename = (thread: AssistantThreadSummary) => {
    setMenuThreadId(null)
    setRenameThread(thread)
    setRenameValue(getThreadSummaryTitle(thread))
  }

  const handleSubmitRename = async () => {
    if (!renameThread || !renameValue.trim()) {
      return
    }
    await onRenameThread(renameThread.thread_id, renameValue)
    setRenameThread(null)
    setRenameValue('')
  }

  const handleDelete = async () => {
    if (!deleteThread) {
      return
    }
    await onDeleteThread(deleteThread.thread_id)
    setDeleteThread(null)
  }

  return (
    <div className="absolute inset-0 z-20">
      <button
        type="button"
        aria-label="关闭历史会话"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]"
      />
      <aside className="absolute top-0 bottom-0 left-0 flex w-[min(340px,88%)] flex-col border-r border-white/10 bg-slate-950/95 shadow-2xl">
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

        <div className="space-y-3 border-b border-white/8 px-4 py-3">
          <button
            type="button"
            onClick={handleNewThread}
            disabled={isStreaming}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            新建会话
          </button>

          {threads.length > 0 && (
            <label className="flex items-center gap-2 rounded-xl border border-white/8 bg-slate-950/75 px-3 py-2 text-xs text-slate-400 focus-within:border-blue-300/35">
              <Search className="h-3.5 w-3.5 shrink-0" />
              <input
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="搜索会话标题"
                className="min-w-0 flex-1 bg-transparent text-slate-200 outline-none placeholder:text-slate-600"
              />
              {searchValue && (
                <button
                  type="button"
                  onClick={() => setSearchValue('')}
                  className="rounded-md p-0.5 text-slate-500 transition-colors hover:bg-white/8 hover:text-white"
                  aria-label="清空搜索"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </label>
          )}
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

            {searchValue.trim() && filteredThreads.length === 0 && (
              <div className="rounded-xl border border-dashed border-white/8 px-3 py-3 text-[11px] leading-5 text-slate-500">
                没有找到匹配的会话。
              </div>
            )}

            {filteredThreads.map((item) => {
              const active = item.thread_id === activeThreadId
              const statusMeta = getLocalStatusMeta(item.thread_id)
              return (
                <div
                  key={item.thread_id}
                  className="group relative"
                >
                  <button
                    type="button"
                    onClick={() => handleSelectThread(item.thread_id)}
                    disabled={isStreaming || historyLoading}
                    className={cn(
                      'w-full rounded-2xl border px-3 py-3 pr-10 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60',
                      active
                        ? 'border-blue-400/30 bg-blue-500/10 text-white shadow-[0_10px_28px_rgba(59,130,246,0.12)]'
                        : 'border-white/8 bg-white/4 text-slate-300 hover:border-white/12 hover:bg-white/8',
                    )}
                  >
                    <div className="line-clamp-2 text-xs font-medium leading-5">{getThreadSummaryTitle(item)}</div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span className="line-clamp-1">最近更新：{formatRelativeTimestamp(getThreadUpdatedAt(item))}</span>
                      {statusMeta && (
                        <span
                          className={cn(
                            'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]',
                            statusMeta.tone === 'info' && 'border-blue-400/20 bg-blue-500/10 text-blue-200',
                            statusMeta.tone === 'neutral' && 'border-white/10 bg-white/5 text-slate-400',
                          )}
                        >
                          <span
                            className={cn(
                              'h-1.5 w-1.5 rounded-full',
                              statusMeta.tone === 'info' && 'bg-blue-300',
                              statusMeta.tone === 'neutral' && 'bg-slate-400',
                              statusMeta.pulse && 'animate-pulse',
                            )}
                          />
                          {statusMeta.label}
                        </span>
                      )}
                    </div>
                  </button>

                  <button
                    type="button"
                    aria-label="更多会话操作"
                    disabled={isStreaming || historyLoading}
                    onClick={(event) => {
                      event.stopPropagation()
                      setMenuThreadId((current) => (current === item.thread_id ? null : item.thread_id))
                    }}
                    className={cn(
                      'absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 opacity-0 transition hover:bg-white/10 hover:text-white group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40',
                      menuThreadId === item.thread_id && 'bg-white/10 text-white opacity-100',
                    )}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>

                  {menuThreadId === item.thread_id && (
                    <div className="absolute top-10 right-2 z-30 w-44 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/98 p-1.5 shadow-2xl backdrop-blur">
                      <button
                        type="button"
                        onClick={() => handleStartRename(item)}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] text-slate-300 transition hover:bg-white/8 hover:text-white"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        重命名
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuThreadId(null)
                          void onExportThread(item, 'markdown')
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] text-slate-300 transition hover:bg-white/8 hover:text-white"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        导出 Markdown
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuThreadId(null)
                          void onExportThread(item, 'json')
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] text-slate-300 transition hover:bg-white/8 hover:text-white"
                      >
                        <FileJson className="h-3.5 w-3.5" />
                        导出 JSON
                      </button>
                      <div className="my-1 h-px bg-white/8" />
                      <button
                        type="button"
                        onClick={() => {
                          setMenuThreadId(null)
                          setDeleteThread(item)
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[11px] text-red-300 transition hover:bg-red-500/10 hover:text-red-200"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        删除会话
                      </button>
                    </div>
                  )}
                </div>
              )
            })}

            {renameThread && (
              <div className="rounded-2xl border border-blue-400/20 bg-blue-500/10 p-3 shadow-xl">
                <div className="flex items-center gap-2 text-xs font-medium text-blue-100">
                  <Pencil className="h-3.5 w-3.5" />
                  重命名会话
                </div>
                <input
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      void handleSubmitRename()
                    }
                    if (event.key === 'Escape') {
                      setRenameThread(null)
                    }
                  }}
                  className="mt-3 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-300/40"
                  placeholder="输入新的会话标题"
                  autoFocus
                />
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setRenameThread(null)}
                    className="rounded-lg px-3 py-1.5 text-[11px] text-slate-400 transition hover:bg-white/8 hover:text-white"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSubmitRename()}
                    disabled={!renameValue.trim()}
                    className="rounded-lg bg-blue-500 px-3 py-1.5 text-[11px] font-medium text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-slate-700"
                  >
                    保存
                  </button>
                </div>
              </div>
            )}

            {deleteThread && (
              <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-3 shadow-xl">
                <div className="flex items-center gap-2 text-xs font-medium text-red-100">
                  <Trash2 className="h-3.5 w-3.5" />
                  删除会话
                </div>
                <p className="mt-2 text-[11px] leading-5 text-red-100/75">
                  将删除「{getThreadSummaryTitle(deleteThread)}」，该操作不可恢复。
                </p>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteThread(null)}
                    className="rounded-lg px-3 py-1.5 text-[11px] text-slate-400 transition hover:bg-white/8 hover:text-white"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    className="rounded-lg bg-red-500 px-3 py-1.5 text-[11px] font-medium text-white transition hover:bg-red-400"
                  >
                    删除
                  </button>
                </div>
              </div>
            )}

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
