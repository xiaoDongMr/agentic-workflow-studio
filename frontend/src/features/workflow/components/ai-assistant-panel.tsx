import type { HumanMessage, Message } from '@langchain/langgraph-sdk'
import { type HTMLAttributes, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronsUp, History, PanelLeftClose, RefreshCw, SendHorizontal, Sparkles } from 'lucide-react'

import { streamAssistantMessage, type AssistantStreamEvent } from '@/api/assistant'
import {
  getAssistantThreadMessages,
  listAssistantThreads,
  type AssistantThreadMessageRecord,
  type AssistantThreadSummary,
} from '@/api/assistant-history'
import { cn } from '@/lib/utils'

import {
  createAssistantMessageNormalizer,
  formatRelativeTimestamp,
  getAssistantTimelineItems,
  getThreadSummarySubtitle,
  getThreadSummaryTitle,
  isRecord,
  mergePartialMessage,
  persistThreadId,
  readStoredThreadId,
  ThreadSidebar,
  TimelineMessageList,
  type NoticeMessage,
} from './assistant'

interface AiAssistantPanelProps extends HTMLAttributes<HTMLDivElement> {
  onCollapse?: () => void
}

function createMessageId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createOptimisticHumanMessage(content: string): HumanMessage {
  return {
    id: createMessageId('user'),
    type: 'human',
    content,
  }
}

function buildNotice(content: string, tone: NoticeMessage['tone']): NoticeMessage {
  return {
    id: createMessageId('notice'),
    tone,
    content,
  }
}

function normalizeEventName(eventName: string) {
  return eventName.split('|')[0] ?? eventName
}

function mergeConversationMessages({
  backendMessages,
  ephemeralMessages,
  optimisticUserMessage,
}: {
  backendMessages: Message[]
  ephemeralMessages: Message[]
  optimisticUserMessage: HumanMessage | null
}) {
  const nextMessages = [...backendMessages]

  if (optimisticUserMessage) {
    nextMessages.push(optimisticUserMessage)
  }

  for (const partialMessage of ephemeralMessages) {
    const targetIndex = partialMessage.id ? nextMessages.findIndex((message) => message.id === partialMessage.id) : -1

    if (targetIndex === -1) {
      nextMessages.push(partialMessage)
    } else {
      nextMessages[targetIndex] = partialMessage
    }
  }

  return nextMessages
}

function dedupeMessagesById(messages: Message[]) {
  const seen = new Set<string>()

  return messages.filter((message) => {
    if (!message.id) {
      return true
    }
    if (seen.has(message.id)) {
      return false
    }
    seen.add(message.id)
    return true
  })
}

function scheduleAsyncTask(task: () => void) {
  queueMicrotask(task)
}

export function AiAssistantPanel({ className, onCollapse, ...props }: AiAssistantPanelProps) {
  const [backendMessages, setBackendMessages] = useState<Message[]>([])
  const [ephemeralMessages, setEphemeralMessages] = useState<Message[]>([])
  const [optimisticUserMessage, setOptimisticUserMessage] = useState<HumanMessage | null>(null)
  const [notices, setNotices] = useState<NoticeMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [threadId, setThreadId] = useState<string | undefined>(() => readStoredThreadId())
  const [threads, setThreads] = useState<AssistantThreadSummary[]>([])
  const [threadsLoading, setThreadsLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyHasMore, setHistoryHasMore] = useState(false)
  const [oldestHistorySeq, setOldestHistorySeq] = useState<number>()
  const [isStreaming, setIsStreaming] = useState(false)
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false)
  const [errorText, setErrorText] = useState('')
  const abortControllerRef = useRef<AbortController | null>(null)
  const messageNormalizerRef = useRef(createAssistantMessageNormalizer())
  const viewportRef = useRef<HTMLDivElement | null>(null)

  const appendNotice = useCallback((content: string, tone: NoticeMessage['tone']) => {
    setNotices((current) => [...current, buildNotice(content, tone)])
  }, [])

  const conversationMessages = useMemo(
    () => mergeConversationMessages({ backendMessages, ephemeralMessages, optimisticUserMessage }),
    [backendMessages, ephemeralMessages, optimisticUserMessage],
  )

  const timelineItems = useMemo(() => getAssistantTimelineItems(conversationMessages), [conversationMessages])
  const hasAssistantOutput = useMemo(() => timelineItems.some((item) => item.type !== 'human'), [timelineItems])
  const activeThread = useMemo(() => threads.find((item) => item.thread_id === threadId), [threadId, threads])

  const normalizeHistoryRecords = useCallback((records: AssistantThreadMessageRecord[]) => {
    return records
      .map((record) =>
        messageNormalizerRef.current.normalizeMessage(
          record.content,
          isRecord(record.metadata) ? record.metadata : undefined,
        ),
      )
      .filter((message): message is Message => message !== null)
  }, [])

  const refreshThreads = useCallback(async () => {
    setThreadsLoading(true)
    try {
      setThreads(await listAssistantThreads())
    } catch (error) {
      const nextError = error instanceof Error ? error.message : '加载历史会话失败'
      setErrorText(nextError)
      appendNotice(nextError, 'error')
    } finally {
      setThreadsLoading(false)
    }
  }, [appendNotice])

  const upsertEphemeralMessage = useCallback((message: Message, mode: 'append' | 'replace' = 'append') => {
    setEphemeralMessages((current) => {
      const targetIndex = message.id ? current.findIndex((item) => item.id === message.id) : -1
      if (targetIndex === -1) {
        return [...current, message]
      }

      const nextMessages = [...current]
      nextMessages[targetIndex] = mode === 'append' ? mergePartialMessage(nextMessages[targetIndex], message) : message
      return nextMessages
    })
  }, [])

  const replaceConversationWithHistory = useCallback(
    async (nextThreadId: string) => {
      setHistoryLoading(true)
      try {
        const result = await getAssistantThreadMessages(nextThreadId)
        const nextMessages = normalizeHistoryRecords(result.data)
        setThreadId(nextThreadId)
        setBackendMessages(nextMessages)
        setEphemeralMessages([])
        setOptimisticUserMessage(null)
        setNotices([])
        setErrorText('')
        setHistoryHasMore(result.has_more)
        setOldestHistorySeq(result.data[0]?.seq)
        messageNormalizerRef.current.clear()
      } catch (error) {
        const nextError = error instanceof Error ? error.message : '加载历史消息失败'
        setErrorText(nextError)
        appendNotice(nextError, 'error')
      } finally {
        setHistoryLoading(false)
      }
    },
    [appendNotice, normalizeHistoryRecords],
  )

  const loadMoreHistory = useCallback(async () => {
    if (!threadId || !oldestHistorySeq || historyLoading || isStreaming) {
      return
    }

    setHistoryLoading(true)
    try {
      const result = await getAssistantThreadMessages(threadId, oldestHistorySeq)
      const olderMessages = normalizeHistoryRecords(result.data)
      setBackendMessages((current) => dedupeMessagesById([...olderMessages, ...current]))
      setHistoryHasMore(result.has_more)
      setOldestHistorySeq(result.data[0]?.seq ?? oldestHistorySeq)
    } catch (error) {
      const nextError = error instanceof Error ? error.message : '加载更早历史消息失败'
      setErrorText(nextError)
      appendNotice(nextError, 'error')
    } finally {
      setHistoryLoading(false)
    }
  }, [appendNotice, historyLoading, isStreaming, normalizeHistoryRecords, oldestHistorySeq, threadId])

  const syncSnapshotMessages = useCallback((data: unknown) => {
    if (!isRecord(data) || !Array.isArray(data.messages)) {
      return
    }

    const nextMessages = messageNormalizerRef.current.normalizeMessageList(data.messages)
    const nextIds = new Set(nextMessages.map((message) => message.id).filter(Boolean))

    setBackendMessages(nextMessages)
    setHistoryHasMore(false)
    setOldestHistorySeq(undefined)
    setOptimisticUserMessage(null)
    setEphemeralMessages((current) => current.filter((message) => message.id && !nextIds.has(message.id)))
  }, [])

  const consumeTupleMessage = useCallback(
    (data: unknown) => {
      const message = messageNormalizerRef.current.normalizeMessageTuple(data)
      if (message) {
        upsertEphemeralMessage(message, 'replace')
      }
    },
    [upsertEphemeralMessage],
  )

  const consumeMessageList = useCallback(
    (data: unknown, mode: 'append' | 'replace') => {
      messageNormalizerRef.current.normalizeMessageList(data).forEach((message) => {
        upsertEphemeralMessage(message, mode)
      })
    },
    [upsertEphemeralMessage],
  )

  const handleStreamEvent = useCallback(
    (event: AssistantStreamEvent) => {
      const eventName = normalizeEventName(event.event)

      if (eventName === 'metadata') {
        if (isRecord(event.data) && typeof event.data.thread_id === 'string') {
          setThreadId(event.data.thread_id)
        }
        return
      }

      if (eventName === 'messages') {
        consumeTupleMessage(event.data)
        return
      }

      if (eventName === 'messages/partial') {
        consumeMessageList(event.data, 'replace')
        return
      }

      if (eventName === 'messages/complete') {
        consumeMessageList(event.data, 'replace')
        return
      }

      if (eventName === 'values') {
        syncSnapshotMessages(event.data)
        return
      }

      if (eventName === 'error') {
        const nextError =
          isRecord(event.data) && typeof event.data.message === 'string'
            ? event.data.message
            : 'AI 助手返回了错误事件'
        setErrorText(nextError)
        appendNotice(nextError, 'error')
      }
    },
    [appendNotice, consumeMessageList, consumeTupleMessage, syncSnapshotMessages],
  )

  const resetConversation = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    messageNormalizerRef.current.clear()
    setThreadId(undefined)
    setBackendMessages([])
    setEphemeralMessages([])
    setHistoryHasMore(false)
    setOldestHistorySeq(undefined)
    setOptimisticUserMessage(null)
    setNotices([])
    setInputValue('')
    setErrorText('')
    setIsStreaming(false)
  }, [])

  const handleSelectThread = useCallback(
    (nextThreadId: string) => {
      if (isStreaming || historyLoading || (nextThreadId === threadId && backendMessages.length > 0)) {
        return
      }

      void replaceConversationWithHistory(nextThreadId)
    },
    [backendMessages.length, historyLoading, isStreaming, replaceConversationWithHistory, threadId],
  )

  const openHistoryDrawer = useCallback(() => {
    setHistoryDrawerOpen(true)
    scheduleAsyncTask(() => void refreshThreads())
  }, [refreshThreads])

  const handleSend = useCallback(async () => {
    const prompt = inputValue.trim()
    if (!prompt || isStreaming) {
      return
    }

    const controller = new AbortController()
    abortControllerRef.current = controller
    setIsStreaming(true)
    setErrorText('')
    setEphemeralMessages([])
    setHistoryHasMore(false)
    setOldestHistorySeq(undefined)
    messageNormalizerRef.current.clear()
    setOptimisticUserMessage(createOptimisticHumanMessage(prompt))
    setInputValue('')

    try {
      await streamAssistantMessage({
        message: prompt,
        threadId,
        signal: controller.signal,
        onThreadId: setThreadId,
        onEvent: handleStreamEvent,
      })
    } catch (error) {
      if (controller.signal.aborted) {
        return
      }

      const nextError = error instanceof Error ? error.message : '发起流式对话失败'
      setErrorText(nextError)
      appendNotice(nextError, 'error')
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
      }
      setIsStreaming(false)
    }
  }, [appendNotice, handleStreamEvent, inputValue, isStreaming, threadId])

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSend()
    }
  }

  useEffect(() => {
    const viewport = viewportRef.current
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight
    }
  }, [timelineItems, notices, isStreaming])

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    scheduleAsyncTask(() => void refreshThreads())
  }, [refreshThreads])

  useEffect(() => {
    persistThreadId(threadId)
  }, [threadId])

  useEffect(() => {
    if (!threadId || backendMessages.length > 0 || ephemeralMessages.length > 0 || optimisticUserMessage) {
      return
    }

    scheduleAsyncTask(() => void replaceConversationWithHistory(threadId))
  }, [backendMessages.length, ephemeralMessages.length, optimisticUserMessage, replaceConversationWithHistory, threadId])

  useEffect(() => {
    if (!isStreaming) {
      scheduleAsyncTask(() => void refreshThreads())
    }
  }, [isStreaming, refreshThreads, threadId])

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
          onClose={() => setHistoryDrawerOpen(false)}
          onNewThread={resetConversation}
          onSelectThread={handleSelectThread}
        />

        <div className="min-h-0 flex flex-1 flex-col">
          <div className="border-b border-white/8 px-4 py-3">
            <div className="line-clamp-1 text-sm font-medium text-white">
              {activeThread ? getThreadSummaryTitle(activeThread) : '当前会话'}
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500">
              <span className="line-clamp-1">
                {threadId ? `线程：${threadId}` : '发送首条消息后自动创建线程'}
              </span>
              <span>{activeThread ? formatRelativeTimestamp(activeThread.updated_at) : '未开始'}</span>
            </div>
          </div>

          <div ref={viewportRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div className="space-y-4">
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

              {conversationMessages.length === 0 && (
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
                </>
              )}

              <TimelineMessageList items={timelineItems} notices={notices} isStreaming={isStreaming} />

              {isStreaming && !hasAssistantOutput && (
                <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-xs text-slate-300">
                  已发送到后端，正在等待首个流式响应片段...
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-white/8 px-4 py-4">
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
                onClick={() => void handleSend()}
                disabled={!inputValue.trim() || isStreaming || historyLoading}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500 text-white transition-colors hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-slate-700"
                aria-label="发送"
              >
                <SendHorizontal className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-500">
              <span>{activeThread ? getThreadSummarySubtitle(activeThread) : '发送首条消息后自动创建线程'}</span>
              <span>
                {errorText ||
                  (historyLoading
                    ? '正在加载历史消息'
                    : isStreaming
                      ? '正在通过 langgraph-sdk 接收结构化流式消息'
                      : '等待输入')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
