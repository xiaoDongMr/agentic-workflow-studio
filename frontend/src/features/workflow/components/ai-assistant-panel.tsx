import type { AIMessage, DefaultToolCall, HumanMessage, Message } from '@langchain/langgraph-sdk'
import { MessageTupleManager, toMessageDict } from '@langchain/langgraph-sdk/ui'
import { type HTMLAttributes, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  ChevronsUp,
  CircleAlert,
  GitBranch,
  History,
  Lightbulb,
  Loader2,
  MessageCircleQuestionMark,
  PanelLeftClose,
  RefreshCw,
  SendHorizontal,
  Sparkles,
  Wrench,
} from 'lucide-react'

import { streamAssistantMessage, type AssistantStreamEvent } from '@/api/assistant'
import {
  getAssistantThreadMessages,
  listAssistantThreads,
  type AssistantThreadMessageRecord,
  type AssistantThreadSummary,
} from '@/api/assistant-history'
import { cn } from '@/lib/utils'

import {
  extractContentFromMessage,
  extractReasoningContentFromMessage,
  formatStructuredData,
  getAssistantMessageGroups,
  getSubagentTasks,
  getToolCallsWithResults,
  hasReasoning,
  isRecord,
  type AssistantSubagentTask,
  type AssistantToolCallWithResult,
} from './assistant-message-utils'

interface AiAssistantPanelProps extends HTMLAttributes<HTMLDivElement> {
  onCollapse?: () => void
}

interface NoticeMessage {
  id: string
  tone: 'error' | 'info'
  content: string
}

const THREAD_STORAGE_KEY = 'workflow-ai-assistant-thread-id'

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

function isMessageLike(value: unknown): value is Message {
  return isRecord(value) && typeof value.type === 'string' && 'content' in value
}

function isChunkMessageLike(value: unknown): value is Message {
  return isMessageLike(value) && value.type.endsWith('MessageChunk')
}

function normalizeEventName(eventName: string) {
  return eventName.split('|')[0] ?? eventName
}

function readStoredThreadId() {
  if (typeof window === 'undefined') {
    return undefined
  }

  const stored = window.localStorage.getItem(THREAD_STORAGE_KEY)
  return stored || undefined
}

function persistThreadId(threadId?: string) {
  if (typeof window === 'undefined') {
    return
  }

  if (threadId) {
    window.localStorage.setItem(THREAD_STORAGE_KEY, threadId)
    return
  }

  window.localStorage.removeItem(THREAD_STORAGE_KEY)
}

function formatRelativeTimestamp(value?: string) {
  if (!value) {
    return '刚刚'
  }

  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) {
    return '最近更新'
  }

  const delta = Date.now() - timestamp
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (delta < minute) {
    return '刚刚'
  }
  if (delta < hour) {
    return `${Math.floor(delta / minute)} 分钟前`
  }
  if (delta < day) {
    return `${Math.floor(delta / hour)} 小时前`
  }
  return `${Math.floor(delta / day)} 天前`
}

function getThreadSummaryTitle(thread: AssistantThreadSummary) {
  const metadataTitle = typeof thread.metadata?.title === 'string' ? thread.metadata.title.trim() : ''
  if (thread.display_name?.trim()) {
    return thread.display_name.trim()
  }
  if (metadataTitle) {
    return metadataTitle
  }
  return '未命名会话'
}

function getThreadSummarySubtitle(thread: AssistantThreadSummary) {
  const assistantId = thread.assistant_id?.trim()
  if (assistantId) {
    return assistantId
  }
  return thread.status?.trim() || '线程会话'
}

function mergeMessageContent(existing: Message['content'], incoming: Message['content']) {
  if (typeof existing === 'string' && typeof incoming === 'string') {
    return `${existing}${incoming}`
  }

  if (Array.isArray(existing) && Array.isArray(incoming)) {
    return [...existing, ...incoming]
  }

  return `${extractTextFromContent(existing)}${extractTextFromContent(incoming)}`
}

function extractTextFromContent(content: Message['content']) {
  if (typeof content === 'string') {
    return content
  }

  return content
    .map((item) => {
      if (item.type === 'text') {
        return item.text
      }

      if (item.type === 'image_url') {
        return typeof item.image_url === 'string' ? item.image_url : item.image_url.url
      }

      return ''
    })
    .join('\n')
}

function mergeToolCalls(
  existing: AIMessage<DefaultToolCall>['tool_calls'],
  incoming: AIMessage<DefaultToolCall>['tool_calls'],
) {
  const merged = [...(existing ?? [])]

  for (const toolCall of incoming ?? []) {
    const index = merged.findIndex((candidate) =>
      toolCall.id ? candidate.id === toolCall.id : candidate.name === toolCall.name,
    )

    if (index === -1) {
      merged.push(toolCall)
      continue
    }

    merged[index] = {
      ...merged[index],
      ...toolCall,
      args: {
        ...merged[index].args,
        ...toolCall.args,
      },
    }
  }

  return merged.length > 0 ? merged : undefined
}

function mergePartialMessage(existing: Message | undefined, incoming: Message): Message {
  if (!existing || existing.type !== 'ai' || incoming.type !== 'ai') {
    return incoming
  }

  return {
    ...existing,
    ...incoming,
    additional_kwargs: {
      ...(existing.additional_kwargs ?? {}),
      ...(incoming.additional_kwargs ?? {}),
    },
    content: mergeMessageContent(existing.content, incoming.content),
    tool_calls: mergeToolCalls(existing.tool_calls, incoming.tool_calls),
    invalid_tool_calls: incoming.invalid_tool_calls ?? existing.invalid_tool_calls,
    usage_metadata: incoming.usage_metadata ?? existing.usage_metadata,
  }
}

function summarizeToolCall(toolCall: AssistantToolCallWithResult['call']) {
  if (typeof toolCall.args.description === 'string' && toolCall.args.description.trim()) {
    return toolCall.args.description
  }

  if (typeof toolCall.args.query === 'string' && toolCall.args.query.trim()) {
    return toolCall.args.query
  }

  if (typeof toolCall.args.path === 'string' && toolCall.args.path.trim()) {
    return toolCall.args.path
  }

  if (typeof toolCall.args.url === 'string' && toolCall.args.url.trim()) {
    return toolCall.args.url
  }

  return '查看本次工具调用参数'
}

function StatusPill({
  tone,
  label,
}: {
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'error'
  label: string
}) {
  const toneClassName = {
    neutral: 'border-white/10 bg-white/5 text-slate-300',
    info: 'border-blue-400/20 bg-blue-500/10 text-blue-200',
    success: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200',
    warning: 'border-amber-400/20 bg-amber-500/10 text-amber-100',
    error: 'border-rose-400/20 bg-rose-500/10 text-rose-100',
  }[tone]

  return (
    <span className={cn('rounded-full border px-2 py-1 text-[11px] font-medium', toneClassName)}>
      {label}
    </span>
  )
}

function ExpandableSection({
  icon,
  title,
  status,
  defaultOpen = false,
  children,
}: {
  icon: React.ReactNode
  title: string
  status?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}) {
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

function TextContent({ content, muted = false }: { content: string; muted?: boolean }) {
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

function CodeLikeBlock({ content }: { content: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-white/6 bg-slate-950/85 p-3 text-xs leading-5 text-slate-300">
      {content}
    </pre>
  )
}

function ToolCallCard({ toolCall }: { toolCall: AssistantToolCallWithResult }) {
  const resultText = toolCall.result ? extractContentFromMessage(toolCall.result) : ''
  const statusTone = toolCall.state === 'completed' ? 'success' : toolCall.state === 'error' ? 'error' : 'info'
  const statusLabel = toolCall.state === 'completed' ? '已完成' : toolCall.state === 'error' ? '失败' : '执行中'

  return (
    <ExpandableSection
      icon={<Wrench className="h-4 w-4" />}
      title={`${toolCall.call.name} · ${summarizeToolCall(toolCall.call)}`}
      status={<StatusPill tone={statusTone} label={statusLabel} />}
      defaultOpen={toolCall.state !== 'completed'}
    >
      <div className="space-y-3">
        <div className="space-y-2">
          <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">调用参数</div>
          <CodeLikeBlock content={formatStructuredData(toolCall.call.args)} />
        </div>
        <div className="space-y-2">
          <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">工具结果</div>
          {resultText ? (
            <CodeLikeBlock content={resultText} />
          ) : (
            <div className="rounded-xl border border-dashed border-white/8 px-3 py-2 text-xs text-slate-400">
              工具还在执行，等待结果返回...
            </div>
          )}
        </div>
      </div>
    </ExpandableSection>
  )
}

function SubagentTaskCard({ task }: { task: AssistantSubagentTask }) {
  const statusTone = task.status === 'completed' ? 'success' : task.status === 'failed' ? 'error' : 'info'
  const statusLabel = task.status === 'completed' ? '已完成' : task.status === 'failed' ? '失败' : '执行中'

  return (
    <ExpandableSection
      icon={<GitBranch className="h-4 w-4" />}
      title={`${task.description} · ${task.subagentType}`}
      status={<StatusPill tone={statusTone} label={statusLabel} />}
      defaultOpen={task.status !== 'completed'}
    >
      <div className="space-y-3">
        <div className="space-y-2">
          <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">任务提示词</div>
          <CodeLikeBlock content={task.prompt || '未提供任务提示词'} />
        </div>
        <div className="space-y-2">
          <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">子任务结果</div>
          {task.result ? (
            <CodeLikeBlock content={task.result} />
          ) : (
            <div className="rounded-xl border border-dashed border-white/8 px-3 py-2 text-xs text-slate-400">
              子任务仍在执行中，结果返回后会显示在这里。
            </div>
          )}
        </div>
      </div>
    </ExpandableSection>
  )
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
  const [errorText, setErrorText] = useState('')
  const abortControllerRef = useRef<AbortController | null>(null)
  const tupleManagerRef = useRef<MessageTupleManager>(new MessageTupleManager())
  const viewportRef = useRef<HTMLDivElement | null>(null)

  const conversationMessages = useMemo(() => {
    const nextMessages = [...backendMessages]

    if (optimisticUserMessage) {
      nextMessages.push(optimisticUserMessage)
    }

    for (const partialMessage of ephemeralMessages) {
      const targetIndex =
        partialMessage.id !== undefined
          ? nextMessages.findIndex((message) => message.id === partialMessage.id)
          : -1

      if (targetIndex === -1) {
        nextMessages.push(partialMessage)
      } else {
        nextMessages[targetIndex] = partialMessage
      }
    }

    return nextMessages
  }, [backendMessages, ephemeralMessages, optimisticUserMessage])

  const groupedMessages = useMemo(
    () => getAssistantMessageGroups(conversationMessages),
    [conversationMessages],
  )

  const hasAssistantOutput = useMemo(
    () => groupedMessages.some((group) => group.type !== 'human'),
    [groupedMessages],
  )

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }

    viewport.scrollTop = viewport.scrollHeight
  }, [groupedMessages, notices, isStreaming])

  const appendNotice = (content: string, tone: NoticeMessage['tone']) => {
    setNotices((current) => [...current, buildNotice(content, tone)])
  }

  const refreshThreads = useCallback(async () => {
    setThreadsLoading(true)
    try {
      const nextThreads = await listAssistantThreads()
      setThreads(nextThreads)
    } catch (error) {
      const nextError = error instanceof Error ? error.message : '加载历史会话失败'
      setErrorText(nextError)
      appendNotice(nextError, 'error')
    } finally {
      setThreadsLoading(false)
    }
  }, [])

  const upsertEphemeralMessage = (message: Message, mode: 'append' | 'replace' = 'append') => {
    setEphemeralMessages((current) => {
      const targetIndex = message.id !== undefined ? current.findIndex((item) => item.id === message.id) : -1

      if (targetIndex === -1) {
        return [...current, message]
      }

      const nextMessages = [...current]
      nextMessages[targetIndex] =
        mode === 'append' ? mergePartialMessage(nextMessages[targetIndex], message) : message

      return nextMessages
    })
  }

  const normalizeIncomingMessage = (rawMessage: unknown, metadata?: Record<string, unknown>) => {
    if (!isMessageLike(rawMessage)) {
      return null
    }

    if (
      metadata?.langgraph_node === 'TitleMiddleware.after_model' ||
      (Array.isArray(metadata?.tags) && metadata.tags.includes('middleware:title'))
    ) {
      return null
    }

    if (!isChunkMessageLike(rawMessage)) {
      return rawMessage
    }

    const tupleId = tupleManagerRef.current.add(rawMessage, metadata)
    if (!tupleId) {
      return rawMessage
    }

    const assembled = tupleManagerRef.current.get(tupleId)
    if (!assembled?.chunk) {
      return rawMessage
    }

    return toMessageDict(assembled.chunk) as Message
  }

  const normalizeHistoryRecords = useCallback(
    (records: AssistantThreadMessageRecord[]) =>
      records
        .map((record) => normalizeIncomingMessage(record.content, isRecord(record.metadata) ? record.metadata : undefined))
        .filter((message): message is Message => message !== null),
    [],
  )

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
        tupleManagerRef.current.clear()
      } catch (error) {
        const nextError = error instanceof Error ? error.message : '加载历史消息失败'
        setErrorText(nextError)
        appendNotice(nextError, 'error')
      } finally {
        setHistoryLoading(false)
      }
    },
    [normalizeHistoryRecords],
  )

  const loadMoreHistory = useCallback(async () => {
    if (!threadId || !oldestHistorySeq || historyLoading || isStreaming) {
      return
    }

    setHistoryLoading(true)
    try {
      const result = await getAssistantThreadMessages(threadId, oldestHistorySeq)
      const olderMessages = normalizeHistoryRecords(result.data)
      setBackendMessages((current) => {
        const next = [...olderMessages, ...current]
        const seen = new Set<string>()
        return next.filter((message) => {
          if (!message.id) {
            return true
          }
          if (seen.has(message.id)) {
            return false
          }
          seen.add(message.id)
          return true
        })
      })
      setHistoryHasMore(result.has_more)
      setOldestHistorySeq(result.data[0]?.seq ?? oldestHistorySeq)
    } catch (error) {
      const nextError = error instanceof Error ? error.message : '加载更早历史消息失败'
      setErrorText(nextError)
      appendNotice(nextError, 'error')
    } finally {
      setHistoryLoading(false)
    }
  }, [historyLoading, isStreaming, normalizeHistoryRecords, oldestHistorySeq, threadId])

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    void refreshThreads()
  }, [refreshThreads])

  useEffect(() => {
    persistThreadId(threadId)
  }, [threadId])

  useEffect(() => {
    if (!threadId) {
      return
    }

    if (backendMessages.length > 0 || ephemeralMessages.length > 0 || optimisticUserMessage) {
      return
    }

    void replaceConversationWithHistory(threadId)
  }, [backendMessages.length, ephemeralMessages.length, optimisticUserMessage, replaceConversationWithHistory, threadId])

  useEffect(() => {
    if (isStreaming) {
      return
    }

    void refreshThreads()
  }, [isStreaming, refreshThreads, threadId])

  const syncSnapshotMessages = (data: unknown) => {
    if (!isRecord(data) || !Array.isArray(data.messages)) {
      return
    }

    const nextMessages = data.messages
      .map((message) => normalizeIncomingMessage(message))
      .filter((message): message is Message => message !== null)
    const nextIds = new Set(nextMessages.map((message) => message.id).filter(Boolean))

    setBackendMessages(nextMessages)
    setHistoryHasMore(false)
    setOldestHistorySeq(undefined)
    setOptimisticUserMessage(null)
    setEphemeralMessages((current) =>
      current.filter((message) => {
        if (!message.id) {
          return false
        }

        return !nextIds.has(message.id)
      }),
    )
  }

  const consumeTupleMessage = (data: unknown) => {
    if (!Array.isArray(data) || data.length === 0) {
      return
    }

    const message = normalizeIncomingMessage(
      data[0],
      isRecord(data[1]) ? (data[1] as Record<string, unknown>) : undefined,
    )

    if (!message) {
      return
    }

    upsertEphemeralMessage(message, 'replace')
  }

  const consumeMessageList = (data: unknown, mode: 'append' | 'replace') => {
    if (!Array.isArray(data)) {
      return
    }

    data
      .map((message) => normalizeIncomingMessage(message))
      .filter((message): message is Message => message !== null)
      .forEach((message) => {
        upsertEphemeralMessage(message, mode)
      })
  }

  const handleStreamEvent = (event: AssistantStreamEvent) => {
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
  }

  const handleSelectThread = (nextThreadId: string) => {
    if (isStreaming || historyLoading) {
      return
    }

    if (nextThreadId === threadId && backendMessages.length > 0) {
      return
    }

    void replaceConversationWithHistory(nextThreadId)
  }

  const handleResetConversation = () => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    tupleManagerRef.current.clear()
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
  }

  const handleSend = async () => {
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
    tupleManagerRef.current.clear()
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
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSend()
    }
  }

  const activeThread = useMemo(
    () => threads.find((item) => item.thread_id === threadId),
    [threadId, threads],
  )

  return (
    <section
      className={cn(
        'flex h-full flex-col overflow-hidden rounded-[28px] border border-white/8 bg-slate-950/92 shadow-[0_20px_60px_rgba(2,6,23,0.46)] backdrop-blur',
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
            onClick={handleResetConversation}
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
        <aside className="flex w-[152px] shrink-0 flex-col border-r border-white/8 bg-slate-950/75">
          <div className="border-b border-white/8 px-3 py-3">
            <button
              type="button"
              onClick={handleResetConversation}
              disabled={isStreaming}
              className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-xs text-slate-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              新建会话
            </button>
          </div>
          <div className="flex items-center gap-2 px-3 pt-3 text-[11px] font-medium tracking-wide text-slate-400 uppercase">
            <History className="h-3.5 w-3.5" />
            历史会话
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
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
                const active = item.thread_id === threadId
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
                    <div className="line-clamp-2 text-xs font-medium leading-5">
                      {getThreadSummaryTitle(item)}
                    </div>
                    <div className="mt-2 line-clamp-1 text-[11px] text-slate-500">
                      {getThreadSummarySubtitle(item)}
                    </div>
                    <div className="mt-1 text-[10px] text-slate-500">
                      {formatRelativeTimestamp(item.updated_at)}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </aside>

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

              {groupedMessages.map((group) => {
                if (group.type === 'human') {
                  return (
                    <div key={group.id} className="flex justify-end">
                      <div className="max-w-[88%] rounded-[22px] border border-blue-400/30 bg-blue-500/15 px-4 py-3 shadow-[0_8px_24px_rgba(59,130,246,0.12)]">
                        {group.messages.map((message, index) => (
                          <TextContent
                            key={`${group.id}-${message.id ?? index}`}
                            content={extractContentFromMessage(message)}
                          />
                        ))}
                      </div>
                    </div>
                  )
                }

                if (group.type === 'assistant') {
                  return (
                    <div key={group.id} className="flex items-start gap-3">
                      <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-blue-500/25 bg-blue-500/10 text-blue-200">
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <div className="flex-1 rounded-[22px] border border-white/8 bg-white/4 p-4">
                        {group.messages.map((message, index) => (
                          <TextContent
                            key={`${group.id}-${message.id ?? index}`}
                            content={extractContentFromMessage(message) || '正在组织最终回复...'}
                          />
                        ))}
                      </div>
                    </div>
                  )
                }

                if (group.type === 'assistant:clarification') {
                  const clarificationText = group.messages.map(extractContentFromMessage).find(Boolean) ?? '请补充更多信息。'

                  return (
                    <div key={group.id} className="rounded-[22px] border border-amber-400/20 bg-amber-500/10 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-amber-100">
                          <MessageCircleQuestionMark className="h-4 w-4" />
                          需要你补充澄清信息
                        </div>
                        <StatusPill tone="warning" label="待回复" />
                      </div>
                      <TextContent content={clarificationText} muted={true} />
                    </div>
                  )
                }

                if (group.type === 'assistant:subagent') {
                  const taskCards = getSubagentTasks(group.messages)
                  const reasoningMessages = group.messages.filter((message) => hasReasoning(message))

                  return (
                    <div key={group.id} className="space-y-3 rounded-[22px] border border-white/8 bg-white/4 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-white">
                          <GitBranch className="h-4 w-4 text-violet-300" />
                          子任务 / 子代理执行
                        </div>
                        <StatusPill tone={isStreaming ? 'info' : 'neutral'} label={`${taskCards.length} 个任务`} />
                      </div>

                      {reasoningMessages.map((message, index) => {
                        const reasoning = extractReasoningContentFromMessage(message)
                        if (!reasoning) {
                          return null
                        }

                        return (
                          <ExpandableSection
                            key={`${group.id}-reasoning-${message.id ?? index}`}
                            icon={<Lightbulb className="h-4 w-4" />}
                            title={`任务规划 ${index + 1}`}
                            status={<StatusPill tone="info" label="思考中" />}
                            defaultOpen={index === reasoningMessages.length - 1}
                          >
                            <TextContent content={reasoning} muted={true} />
                          </ExpandableSection>
                        )
                      })}

                      {taskCards.map((task) => (
                        <SubagentTaskCard key={task.id} task={task} />
                      ))}
                    </div>
                  )
                }

                const reasoningMessages = group.messages.filter((message) => hasReasoning(message))
                const toolCalls = getToolCallsWithResults(group.messages).filter(
                  (toolCall) => toolCall.call.name !== 'task' && toolCall.call.name !== 'ask_clarification',
                )

                return (
                  <div key={group.id} className="space-y-3 rounded-[22px] border border-white/8 bg-white/4 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-white">
                        <Loader2 className={cn('h-4 w-4 text-blue-300', isStreaming && 'animate-spin')} />
                        处理中
                      </div>
                      <StatusPill tone={isStreaming ? 'info' : 'neutral'} label={isStreaming ? '流式更新中' : '已收口'} />
                    </div>

                    {reasoningMessages.map((message, index) => {
                      const reasoning = extractReasoningContentFromMessage(message)
                      if (!reasoning) {
                        return null
                      }

                      return (
                        <ExpandableSection
                          key={`${group.id}-reasoning-${message.id ?? index}`}
                          icon={<Lightbulb className="h-4 w-4" />}
                          title={`思考过程 ${index + 1}`}
                          status={<StatusPill tone="info" label="推理中" />}
                          defaultOpen={index === reasoningMessages.length - 1}
                        >
                          <TextContent content={reasoning} muted={true} />
                        </ExpandableSection>
                      )
                    })}

                    {toolCalls.map((toolCall) => (
                      <ToolCallCard key={toolCall.id} toolCall={toolCall} />
                    ))}

                    {reasoningMessages.length === 0 && toolCalls.length === 0 && (
                      <div className="rounded-xl border border-dashed border-white/8 px-4 py-3 text-xs text-slate-400">
                        已收到处理中消息，正在等待思考或工具执行细节返回...
                      </div>
                    )}
                  </div>
                )
              })}

              {isStreaming && !hasAssistantOutput && (
                <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-xs text-slate-300">
                  已发送到后端，正在等待首个流式响应片段...
                </div>
              )}

              {notices.map((notice) => (
                <div
                  key={notice.id}
                  className={cn(
                    'rounded-2xl px-4 py-3 text-xs leading-5',
                    notice.tone === 'error'
                      ? 'border border-rose-400/20 bg-rose-500/10 text-rose-100'
                      : 'border border-white/8 bg-white/4 text-slate-300',
                  )}
                >
                  <div className="flex items-start gap-2">
                    {notice.tone === 'error' ? (
                      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    ) : (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    )}
                    <span>{notice.content}</span>
                  </div>
                </div>
              ))}
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
                {errorText || (historyLoading ? '正在加载历史消息' : isStreaming ? '正在通过 langgraph-sdk 接收结构化流式消息' : '等待输入')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
