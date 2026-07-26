import { type HTMLAttributes, type KeyboardEvent, useCallback, useEffect, useRef } from 'react'
import {
  Bot,
  ChevronsUp,
  Coins,
  FileText,
  History,
  PanelLeftClose,
  RefreshCw,
  SendHorizontal,
  Sparkles,
  Square,
} from 'lucide-react'

import { useAssistantThreadStream } from '@/features/workflow/hooks/use-assistant-thread-stream'
import { cn } from '@/lib/utils'

import {
  formatRelativeTimestamp,
  getThreadSummaryTitle,
  getThreadUpdatedAt,
  ThreadSidebar,
  TimelineMessageList,
} from './assistant'

interface AiAssistantPanelProps extends HTMLAttributes<HTMLDivElement> {
  onCollapse?: () => void
}

const ASSISTANT_CAPABILITIES = [
  { label: '生成节点', description: '按目标补齐流程骨架' },
  { label: '优化链路', description: '调整节点顺序与依赖' },
  { label: '检查缺口', description: '发现输入输出风险' },
]

export function AiAssistantPanel({ className, onCollapse, ...props }: AiAssistantPanelProps) {
  const {
    activeThread,
    artifactPaths,
    closeHistoryDrawer,
    currentThreadTitle,
    currentRunId,
    deleteThread,
    errorText,
    exportThread,
    feedbackByRunId,
    hasAssistantOutput,
    historyDrawerOpen,
    historyHasMore,
    historyLoading,
    inputValue,
    isStreaming,
    loadMoreHistory,
    messages,
    notices,
    openHistoryDrawer,
    renameThread,
    resetConversation,
    selectThread,
    sendMessage,
    setInputValue,
    stopStreaming,
    submitFeedback,
    threadId,
    threads,
    threadsLoading,
    timelineItems,
    tokenUsage,
  } = useAssistantThreadStream()
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null)
  const loadMoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastLoadMoreAtRef = useRef(0)
  const lastTailItemIdRef = useRef<string | undefined>()

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendMessage()
    }
  }

  const throttledLoadMoreHistory = useCallback(() => {
    if (!historyHasMore || historyLoading || isStreaming) {
      return
    }

    const now = Date.now()
    const remaining = 1200 - (now - lastLoadMoreAtRef.current)
    if (remaining <= 0) {
      lastLoadMoreAtRef.current = now
      void loadMoreHistory()
      return
    }

    if (loadMoreTimeoutRef.current) {
      return
    }

    loadMoreTimeoutRef.current = window.setTimeout(() => {
      loadMoreTimeoutRef.current = null
      if (!historyHasMore || historyLoading || isStreaming) {
        return
      }
      lastLoadMoreAtRef.current = Date.now()
      void loadMoreHistory()
    }, remaining)
  }, [historyHasMore, historyLoading, isStreaming, loadMoreHistory])

  useEffect(() => {
    const viewport = viewportRef.current
    const tailItemId = timelineItems[timelineItems.length - 1]?.id
    if (viewport && (lastTailItemIdRef.current !== tailItemId || isStreaming)) {
      viewport.scrollTop = viewport.scrollHeight
    }
    lastTailItemIdRef.current = tailItemId
  }, [timelineItems, notices, isStreaming])

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current
    const viewport = viewportRef.current
    if (!sentinel || !viewport || !historyHasMore) {
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          throttledLoadMoreHistory()
        }
      },
      {
        root: viewport,
        rootMargin: '160px 0px 0px 0px',
      },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [historyHasMore, throttledLoadMoreHistory])

  return (
    <section
      className={cn(
        'relative flex h-full flex-col overflow-hidden rounded-[30px] border border-white/10 bg-slate-950/88 shadow-[0_24px_70px_rgba(2,6,23,0.5)] backdrop-blur-xl',
        className,
      )}
      {...props}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_18%_12%,rgba(96,165,250,0.24),transparent_34%),radial-gradient(circle_at_84%_8%,rgba(168,85,247,0.16),transparent_30%)]" />

      <div className="relative flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-300/20 bg-blue-500/12 text-blue-100 shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-base font-semibold text-white">工作流 AI 助手</p>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                  isStreaming
                    ? 'border-blue-300/25 bg-blue-500/12 text-blue-100'
                    : 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100',
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', isStreaming ? 'animate-pulse bg-blue-300' : 'bg-emerald-300')} />
                {isStreaming ? '生成中' : '在线'}
              </span>
            </div>
            <p className="mt-1 line-clamp-1 text-xs text-slate-400">
              描述目标，我会辅助生成、补全和检查画布节点。
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={openHistoryDrawer}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs text-slate-400 transition-colors hover:bg-white/8 hover:text-white',
              historyDrawerOpen && 'bg-white/8 text-white',
            )}
            aria-label="打开历史会话"
          >
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">历史</span>
          </button>
          <button
            type="button"
            onClick={resetConversation}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-white/8 hover:text-white"
            aria-label="新建会话"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onCollapse}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-white/8 hover:text-white"
            aria-label="收起 AI 助手"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex flex-1">
        <ThreadSidebar
          activeThreadId={threadId}
          threads={threads}
          threadsLoading={threadsLoading}
          historyLoading={historyLoading}
          isStreaming={isStreaming}
          open={historyDrawerOpen}
          onClose={closeHistoryDrawer}
          onNewThread={resetConversation}
          onDeleteThread={deleteThread}
          onExportThread={exportThread}
          onRenameThread={renameThread}
          onSelectThread={selectThread}
        />

        <div className="relative min-h-0 flex flex-1 flex-col">
          <div className="border-b border-white/8 bg-slate-950/35 px-4 py-3">
            <div className="line-clamp-1 text-sm font-medium text-white">
              {activeThread ? getThreadSummaryTitle(activeThread) : currentThreadTitle || '当前会话'}
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500">
              <span className="line-clamp-1">
                {threadId ? `线程：${threadId}` : '发送首条消息后自动创建线程'}
              </span>
              <span>{activeThread ? formatRelativeTimestamp(getThreadUpdatedAt(activeThread)) : '未开始'}</span>
            </div>
          </div>

          <div ref={viewportRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div className="space-y-4">
              <div ref={loadMoreSentinelRef} className="h-1" />
              {historyHasMore && (
                <button
                  type="button"
                  onClick={() => void loadMoreHistory()}
                  disabled={historyLoading || isStreaming}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-xs text-slate-300 transition-colors hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <ChevronsUp className="h-4 w-4" />
                  {historyLoading ? '加载中...' : '加载更早消息'}
                </button>
              )}

              {messages.length === 0 && (
                <>
                  <div className="overflow-hidden rounded-[24px] border border-blue-300/16 bg-gradient-to-br from-blue-500/14 via-slate-900/70 to-violet-500/10 p-4 shadow-[0_18px_44px_rgba(2,6,23,0.24)]">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-300/20 bg-blue-400/12 text-blue-100">
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 space-y-2">
                        <div className="text-sm font-semibold text-white">告诉我业务目标，我来整理成可执行工作流</div>
                        <div className="text-sm leading-6 text-slate-300">
                          支持从零生成节点、补全当前画布、检查输入输出映射，并在需要时先向你确认关键约束。
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {ASSISTANT_CAPABILITIES.map((item) => (
                        <div key={item.label} className="rounded-2xl border border-white/8 bg-slate-950/36 px-3 py-2">
                          <div className="text-xs font-medium text-slate-100">{item.label}</div>
                          <div className="mt-1 text-[11px] leading-4 text-slate-500">{item.description}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <TimelineMessageList
                items={timelineItems}
                notices={notices}
                isStreaming={isStreaming}
                threadId={threadId}
                currentRunId={currentRunId}
                feedbackByRunId={feedbackByRunId}
                onFeedback={submitFeedback}
              />

              {isStreaming && !hasAssistantOutput && (
                <div className="rounded-2xl border border-blue-300/18 bg-blue-500/8 px-4 py-3 text-xs text-blue-100">
                  已收到请求，正在分析工作流结构...
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-white/8 bg-slate-950/42 px-4 py-4">
            {(artifactPaths.length > 0 || tokenUsage.totalTokens > 0) && (
              <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]">
                {tokenUsage.totalTokens > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/8 bg-white/4 px-2.5 py-1.5 text-slate-400">
                    <Coins className="h-3.5 w-3.5 text-amber-300" />
                    Token {tokenUsage.totalTokens} · 输入 {tokenUsage.inputTokens} / 输出 {tokenUsage.outputTokens}
                  </span>
                )}
                {artifactPaths.slice(0, 3).map((artifactPath) => (
                  <a
                    key={artifactPath}
                    href={artifactPath.startsWith('/api/') ? artifactPath : `/api/threads/${threadId}/artifacts${artifactPath}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex max-w-[220px] items-center gap-1.5 truncate rounded-xl border border-white/8 bg-white/4 px-2.5 py-1.5 text-slate-400 transition-colors hover:border-blue-400/30 hover:text-white"
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-blue-300" />
                    <span className="truncate">{artifactPath.split('/').pop() || artifactPath}</span>
                  </a>
                ))}
                {artifactPaths.length > 3 && (
                  <span className="rounded-xl border border-white/8 bg-white/4 px-2.5 py-1.5 text-slate-500">
                    另有 {artifactPaths.length - 3} 个文件
                  </span>
                )}
              </div>
            )}
            <div className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-slate-950/86 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors focus-within:border-blue-300/35">
              <input
                type="text"
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="描述要生成或调整的工作流..."
                className="flex-1 bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={() => (isStreaming ? stopStreaming() : void sendMessage())}
                disabled={(!inputValue.trim() && !isStreaming) || historyLoading}
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-2xl text-white shadow-[0_10px_24px_rgba(59,130,246,0.2)] transition-colors disabled:cursor-not-allowed disabled:bg-slate-700 disabled:shadow-none',
                  isStreaming ? 'bg-rose-500 hover:bg-rose-400' : 'bg-blue-500 hover:bg-blue-400',
                )}
                aria-label={isStreaming ? '停止生成' : '发送'}
              >
                {isStreaming ? <Square className="h-4 w-4 fill-current" /> : <SendHorizontal className="h-4 w-4" />}
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-500">
              <span>
                {activeThread ? `最近更新：${formatRelativeTimestamp(getThreadUpdatedAt(activeThread))}` : '发送首条消息后自动创建线程'}
              </span>
              <span>
                {errorText ||
                  (historyLoading
                    ? '正在加载历史消息'
                    : isStreaming
                      ? '正在生成工作流建议'
                      : '等待输入')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
