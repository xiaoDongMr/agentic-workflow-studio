import { type HTMLAttributes, type KeyboardEvent, useCallback, useEffect, useRef } from 'react'
import { ChevronsUp, Coins, FileText, History, PanelLeftClose, RefreshCw, SendHorizontal, Sparkles, Square } from 'lucide-react'

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

const SUGGESTED_PROMPTS = [
  '帮我生成一个订单查询工作流',
  '给当前画布补一套客服投诉处理链路',
  '检查这个工作流还缺哪些节点',
  '把流程改成先校验权限再调用工具',
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
        'relative flex h-full flex-col overflow-hidden rounded-[28px] border border-white/8 bg-slate-950/92 shadow-[0_20px_60px_rgba(2,6,23,0.46)] backdrop-blur',
        className,
      )}
      {...props}
    >
      <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
        <div className="flex items-center gap-2">
          <p className="text-base font-semibold text-white">AI 助手</p>
          <span className="text-slate-500">·</span>
          <p className="text-xs font-medium text-slate-300">
            {isStreaming ? '统一流式收口中' : '已连接 LangGraph 兼容接口'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openHistoryDrawer}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-slate-400 transition-colors hover:bg-white/6 hover:text-white',
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
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/6 hover:text-white"
            aria-label="新建会话"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onCollapse}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/6 hover:text-white"
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

        <div className="min-h-0 flex flex-1 flex-col">
          <div className="border-b border-white/8 px-4 py-3">
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
                  <div className="flex items-start gap-3 rounded-[24px] border border-blue-400/15 bg-blue-500/8 p-4">
                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-500/10 text-blue-200">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-white">欢迎使用工作流 AI 助手</div>
                      <div className="text-sm leading-6 text-slate-300">
                        我会把 LangGraph 的流式消息统一收口后再渲染，支持展示思考过程、工具调用、工具结果关联、澄清问题和子任务执行。
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-white/3 px-4 py-3 text-xs leading-5 text-slate-400">
                    试试输入「帮我生成一个订单查询工作流」或「给当前画布补一套客服投诉处理链路」。
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {SUGGESTED_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => void sendMessage(prompt)}
                        disabled={isStreaming || historyLoading}
                        className="rounded-2xl border border-white/8 bg-white/4 px-3 py-2 text-left text-xs leading-5 text-slate-300 transition-colors hover:border-blue-400/30 hover:bg-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {prompt}
                      </button>
                    ))}
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
                <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-xs text-slate-300">
                  已发送到后端，正在等待首个流式响应片段...
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-white/8 px-4 py-4">
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
            <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-slate-950/85 px-4 py-3">
              <input
                type="text"
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="在这里输入你的提示语，可继续回答澄清问题"
                className="flex-1 bg-transparent text-xs text-slate-300 outline-none placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={() => (isStreaming ? stopStreaming() : void sendMessage())}
                disabled={(!inputValue.trim() && !isStreaming) || historyLoading}
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-xl text-white transition-colors disabled:cursor-not-allowed disabled:bg-slate-700',
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
                      ? '正在通过 langgraph-sdk/react useStream 接收结构化流式消息'
                      : '等待输入')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
