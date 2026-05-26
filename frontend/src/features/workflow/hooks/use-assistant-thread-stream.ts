import type { Message } from '@langchain/langgraph-sdk'
import { Client } from '@langchain/langgraph-sdk/client'
import { useStream } from '@langchain/langgraph-sdk/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  deleteAssistantThread,
  deleteAssistantRunFeedback,
  getAssistantThreadRunMessages,
  listAssistantThreadRuns,
  listAssistantThreadFeedback,
  listAssistantThreads,
  renameAssistantThread,
  upsertAssistantRunFeedback,
  type AssistantRunFeedback,
  type AssistantThreadRun,
  type AssistantThreadMessageRecord,
  type AssistantThreadSummary,
} from '@/api/assistant-history'

import {
  createAssistantMessageNormalizer,
  exportThreadAsJSON,
  exportThreadAsMarkdown,
  getAssistantTimelineItems,
  isRecord,
  mergeThreadSummaries,
  persistThreadId,
  readStoredThreadId,
  upsertThreadTitle,
  type NoticeMessage,
} from '../components/assistant'

interface AssistantThreadState {
  messages: Message[]
  title?: string
  artifacts?: string[]
}

export interface AssistantTokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

const DEFAULT_API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

let cachedClient: Client | null = null

function getAssistantClient(): Client {
  if (cachedClient) {
    return cachedClient
  }

  const normalizedBase = DEFAULT_API_BASE_URL.endsWith('/')
    ? DEFAULT_API_BASE_URL
    : `${DEFAULT_API_BASE_URL}/`

  cachedClient = new Client({
    apiUrl: new URL(normalizedBase, window.location.origin).toString(),
  })
  return cachedClient
}

function createMessageId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function buildNotice(content: string, tone: NoticeMessage['tone']): NoticeMessage {
  return {
    id: createMessageId('notice'),
    tone,
    content,
  }
}

function createOptimisticHumanMessage(content: string): Message {
  return {
    id: createMessageId('user'),
    type: 'human',
    content,
  }
}

function dedupeMessagesByIdentity(messages: Message[]) {
  const seen = new Set<string>()

  return messages.filter((message) => {
    const identity = 'tool_call_id' in message ? message.tool_call_id : message.id
    if (!identity) {
      return true
    }
    if (seen.has(identity)) {
      return false
    }
    seen.add(identity)
    return true
  })
}

function mergeMessages(historyMessages: Message[], threadMessages: Message[], optimisticMessages: Message[]) {
  const liveMessageIds = new Set(
    threadMessages.map((message) => ('tool_call_id' in message ? message.tool_call_id : message.id)).filter(Boolean),
  )
  let cutoff = historyMessages.length

  for (let index = historyMessages.length - 1; index >= 0; index -= 1) {
    const message = historyMessages[index]
    if (!message) {
      continue
    }

    const identity = 'tool_call_id' in message ? message.tool_call_id : message.id
    if (identity && liveMessageIds.has(identity)) {
      cutoff = index
      continue
    }

    break
  }

  return dedupeMessagesByIdentity([...historyMessages.slice(0, cutoff), ...threadMessages, ...optimisticMessages])
}

function scheduleAsyncTask(task: () => void) {
  queueMicrotask(task)
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function attachRunMetadata(message: Message, record: AssistantThreadMessageRecord): Message {
  return {
    ...message,
    additional_kwargs: {
      ...(message.additional_kwargs ?? {}),
      run_id: record.run_id,
    },
  }
}

function readTokenCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function aggregateTokenUsage(messages: Message[]): AssistantTokenUsage {
  const countedMessages = new Set<string>()

  return messages.reduce<AssistantTokenUsage>(
    (usage, message, index) => {
      const rawUsage = (message as Message & { usage_metadata?: Record<string, unknown> }).usage_metadata
      if (!rawUsage) {
        return usage
      }

      const identity = message.id ?? `${message.type}-${index}`
      if (countedMessages.has(identity)) {
        return usage
      }
      countedMessages.add(identity)

      const inputTokens = readTokenCount(rawUsage.input_tokens)
      const outputTokens = readTokenCount(rawUsage.output_tokens)
      const totalTokens = readTokenCount(rawUsage.total_tokens) || inputTokens + outputTokens

      return {
        inputTokens: usage.inputTokens + inputTokens,
        outputTokens: usage.outputTokens + outputTokens,
        totalTokens: usage.totalTokens + totalTokens,
      }
    },
    { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  )
}

export function useAssistantThreadStream() {
  const [threadId, setThreadId] = useState<string | undefined>(() => readStoredThreadId())
  const [historyMessages, setHistoryMessages] = useState<Message[]>([])
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([])
  const [notices, setNotices] = useState<NoticeMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [threads, setThreads] = useState<AssistantThreadSummary[]>([])
  const [threadsLoading, setThreadsLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyHasMore, setHistoryHasMore] = useState(false)
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [currentRunId, setCurrentRunId] = useState<string | undefined>()
  const [feedbackByRunId, setFeedbackByRunId] = useState<Record<string, AssistantRunFeedback>>({})
  const previousHumanMessageCountRef = useRef(0)
  const currentThreadIdRef = useRef(threadId)
  const hydratedHistoryThreadIdRef = useRef<string | undefined>()
  const hydratingHistoryThreadIdRef = useRef<string | undefined>()
  const historyRunsRef = useRef<AssistantThreadRun[]>([])
  const historyRunIndexRef = useRef(-1)
  const historyRunBeforeSeqRef = useRef<number | undefined>()
  const messageNormalizerRef = useRef(createAssistantMessageNormalizer())

  const updateThreadId = useCallback((nextThreadId: string | undefined) => {
    currentThreadIdRef.current = nextThreadId
    setThreadId(nextThreadId)
  }, [])

  const appendNotice = useCallback((content: string, tone: NoticeMessage['tone']) => {
    setNotices((current) => [...current, buildNotice(content, tone)])
  }, [])

  const refreshThreads = useCallback(async () => {
    setThreadsLoading(true)
    try {
      const remoteThreads = await listAssistantThreads()
      setThreads((current) => mergeThreadSummaries(remoteThreads, current))
    } catch (error) {
      const nextError = getErrorMessage(error, '加载历史会话失败')
      setErrorText(nextError)
      appendNotice(nextError, 'error')
    } finally {
      setThreadsLoading(false)
    }
  }, [appendNotice])

  const stream = useStream<AssistantThreadState>({
    client: getAssistantClient(),
    assistantId: 'lead_agent',
    threadId: threadId ?? null,
    reconnectOnMount: true,
    fetchStateHistory: { limit: 1 },
    onThreadId: updateThreadId,
    onCreated(run) {
      updateThreadId(run.thread_id)
      setCurrentRunId(run.run_id)
      setThreads((current) => current.map((thread) => (thread.thread_id === run.thread_id ? { ...thread, status: 'running' } : thread)))
    },
    onUpdateEvent(data) {
      const currentThreadId = currentThreadIdRef.current
      if (!currentThreadId || !isRecord(data)) {
        return
      }

      const updates = Object.values(data)
      for (const update of updates) {
        const title = isRecord(update) && typeof update.title === 'string' ? update.title.trim() : ''
        if (title) {
          setThreads((current) => upsertThreadTitle(current, currentThreadId, title, 'running'))
        }
      }
    },
    onError(error) {
      setOptimisticMessages([])
      const nextError = getErrorMessage(error, '发起流式对话失败')
      setErrorText(nextError)
      appendNotice(nextError, 'error')
    },
    onFinish() {
      setOptimisticMessages([])
      void refreshThreads()
    },
  })

  const streamMessages = stream.messages
  const humanMessageCount = useMemo(
    () => streamMessages.filter((message) => message.type === 'human').length,
    [streamMessages],
  )
  const messages = useMemo(
    () => mergeMessages(historyMessages, streamMessages, optimisticMessages),
    [historyMessages, optimisticMessages, streamMessages],
  )
  const timelineItems = useMemo(() => getAssistantTimelineItems(messages), [messages])
  const hasAssistantOutput = useMemo(() => timelineItems.some((item) => item.type !== 'human'), [timelineItems])
  const activeThread = useMemo(() => threads.find((item) => item.thread_id === threadId), [threadId, threads])
  const currentThreadTitle = typeof stream.values?.title === 'string' ? stream.values.title.trim() : ''
  const artifactPaths = useMemo(
    () => (Array.isArray(stream.values?.artifacts) ? stream.values.artifacts.filter((item): item is string => typeof item === 'string') : []),
    [stream.values?.artifacts],
  )
  const tokenUsage = useMemo(() => aggregateTokenUsage(messages), [messages])

  const normalizeHistoryRecords = useCallback((records: AssistantThreadMessageRecord[]) => {
    return records
      .map((record) => {
        const message = messageNormalizerRef.current.normalizeMessage(
          record.content,
          isRecord(record.metadata) ? record.metadata : undefined,
        )
        return message ? attachRunMetadata(message, record) : null
      })
      .filter((message): message is Message => message !== null)
  }, [])

  const loadNextHistoryBatch = useCallback(
    async (targetThreadId: string, mode: 'replace' | 'prepend') => {
      const run = historyRunsRef.current[historyRunIndexRef.current]
      if (!run) {
        setHistoryHasMore(false)
        return
      }

      const result = await getAssistantThreadRunMessages(targetThreadId, run.run_id, historyRunBeforeSeqRef.current)
      const nextMessages = normalizeHistoryRecords(result.data)

      if (mode === 'replace') {
        setHistoryMessages(nextMessages)
      } else {
        setHistoryMessages((current) => dedupeMessagesByIdentity([...nextMessages, ...current]))
      }

      if (result.has_more && result.data[0]?.seq) {
        historyRunBeforeSeqRef.current = result.data[0].seq
      } else {
        historyRunIndexRef.current -= 1
        historyRunBeforeSeqRef.current = undefined
      }

      setHistoryHasMore(historyRunIndexRef.current >= 0 || Boolean(result.has_more))
    },
    [normalizeHistoryRecords],
  )

  const replaceConversationWithHistory = useCallback(
    async (nextThreadId: string) => {
      if (hydratingHistoryThreadIdRef.current === nextThreadId) {
        return
      }

      hydratingHistoryThreadIdRef.current = nextThreadId
      setHistoryLoading(true)
      try {
        const runs = await listAssistantThreadRuns(nextThreadId)
        historyRunsRef.current = runs
        historyRunIndexRef.current = runs.length - 1
        historyRunBeforeSeqRef.current = undefined
        setCurrentRunId(runs[runs.length - 1]?.run_id)
        updateThreadId(nextThreadId)
        stream.switchThread(nextThreadId)
        setHistoryMessages([])
        setOptimisticMessages([])
        setNotices([])
        setErrorText('')
        setHistoryHasMore(runs.length > 0)
        hydratedHistoryThreadIdRef.current = nextThreadId
        if (runs.length > 0) {
          await loadNextHistoryBatch(nextThreadId, 'replace')
        }
        messageNormalizerRef.current.clear()
      } catch (error) {
        hydratedHistoryThreadIdRef.current = nextThreadId
        const nextError = getErrorMessage(error, '加载历史消息失败')
        setErrorText(nextError)
        appendNotice(nextError, 'error')
      } finally {
        if (hydratingHistoryThreadIdRef.current === nextThreadId) {
          hydratingHistoryThreadIdRef.current = undefined
        }
        setHistoryLoading(false)
      }
    },
    [appendNotice, loadNextHistoryBatch, stream, updateThreadId],
  )

  const loadMoreHistory = useCallback(async () => {
    if (!threadId || !historyHasMore || historyLoading || stream.isLoading) {
      return
    }

    setHistoryLoading(true)
    try {
      await loadNextHistoryBatch(threadId, 'prepend')
    } catch (error) {
      const nextError = getErrorMessage(error, '加载更早历史消息失败')
      setErrorText(nextError)
      appendNotice(nextError, 'error')
    } finally {
      setHistoryLoading(false)
    }
  }, [appendNotice, historyHasMore, historyLoading, loadNextHistoryBatch, stream.isLoading, threadId])

  const loadAllThreadMessages = useCallback(
    async (targetThreadId: string) => {
      const runs = await listAssistantThreadRuns(targetThreadId)
      const allRecords: AssistantThreadMessageRecord[] = []

      for (const run of runs) {
        let beforeSeq: number | undefined
        const runRecords: AssistantThreadMessageRecord[] = []
        while (true) {
          const result = await getAssistantThreadRunMessages(targetThreadId, run.run_id, beforeSeq)
          runRecords.unshift(...result.data)
          if (!result.has_more || !result.data[0]?.seq) {
            break
          }
          beforeSeq = result.data[0].seq
        }
        allRecords.push(...runRecords)
      }

      return normalizeHistoryRecords(allRecords)
    },
    [normalizeHistoryRecords],
  )

  const renameThread = useCallback(
    async (targetThreadId: string, title: string) => {
      const nextTitle = title.trim()
      if (!nextTitle) {
        return
      }

      try {
        await renameAssistantThread(targetThreadId, nextTitle)
        setThreads((current) => upsertThreadTitle(current, targetThreadId, nextTitle, 'idle'))
        appendNotice('会话已重命名', 'info')
      } catch (error) {
        const nextError = getErrorMessage(error, '重命名会话失败')
        setErrorText(nextError)
        appendNotice(nextError, 'error')
      }
    },
    [appendNotice],
  )

  const exportThread = useCallback(
    async (targetThread: AssistantThreadSummary, format: 'markdown' | 'json') => {
      try {
        const exportMessages = targetThread.thread_id === threadId ? messages : await loadAllThreadMessages(targetThread.thread_id)
        if (format === 'markdown') {
          exportThreadAsMarkdown(targetThread, exportMessages)
        } else {
          exportThreadAsJSON(targetThread, exportMessages)
        }
        appendNotice(format === 'markdown' ? '已导出 Markdown' : '已导出 JSON', 'info')
      } catch (error) {
        const nextError = getErrorMessage(error, '导出会话失败')
        setErrorText(nextError)
        appendNotice(nextError, 'error')
      }
    },
    [appendNotice, loadAllThreadMessages, messages, threadId],
  )

  const resetConversation = useCallback(() => {
    void stream.stop()
    stream.switchThread(null)
    messageNormalizerRef.current.clear()
    updateThreadId(undefined)
    hydratedHistoryThreadIdRef.current = undefined
    hydratingHistoryThreadIdRef.current = undefined
    historyRunsRef.current = []
    historyRunIndexRef.current = -1
    historyRunBeforeSeqRef.current = undefined
    setCurrentRunId(undefined)
    setFeedbackByRunId({})
    setHistoryMessages([])
    setHistoryHasMore(false)
    setOptimisticMessages([])
    setNotices([])
    setInputValue('')
    setErrorText('')
  }, [stream, updateThreadId])

  const deleteThread = useCallback(
    async (targetThreadId: string) => {
      try {
        await deleteAssistantThread(targetThreadId)
        setThreads((current) => current.filter((thread) => thread.thread_id !== targetThreadId))
        appendNotice('会话已删除', 'info')
        if (targetThreadId === currentThreadIdRef.current) {
          resetConversation()
        }
      } catch (error) {
        const nextError = getErrorMessage(error, '删除会话失败')
        setErrorText(nextError)
        appendNotice(nextError, 'error')
      }
    },
    [appendNotice, resetConversation],
  )

  const selectThread = useCallback(
    (nextThreadId: string) => {
      if (stream.isLoading || historyLoading || (nextThreadId === threadId && messages.length > 0)) {
        return
      }

      void replaceConversationWithHistory(nextThreadId)
    },
    [historyLoading, messages.length, replaceConversationWithHistory, stream.isLoading, threadId],
  )

  const openHistoryDrawer = useCallback(() => {
    setHistoryDrawerOpen(true)
    scheduleAsyncTask(() => void refreshThreads())
  }, [refreshThreads])

  const closeHistoryDrawer = useCallback(() => {
    setHistoryDrawerOpen(false)
  }, [])

  const stopStreaming = useCallback(() => {
    void stream.stop()
    setOptimisticMessages([])
    appendNotice('已停止本次生成', 'info')
    void refreshThreads()
  }, [appendNotice, refreshThreads, stream])

  const sendMessage = useCallback(async (overridePrompt?: string) => {
    const prompt = (overridePrompt ?? inputValue).trim()
    if (!prompt || stream.isLoading) {
      return
    }

    previousHumanMessageCountRef.current = humanMessageCount
    setErrorText('')
    setHistoryHasMore(false)
    historyRunsRef.current = []
    historyRunIndexRef.current = -1
    historyRunBeforeSeqRef.current = undefined
    setOptimisticMessages([createOptimisticHumanMessage(prompt)])
    if (threadId) {
      setThreads((current) => current.map((thread) => (thread.thread_id === threadId ? { ...thread, status: 'running' } : thread)))
    }
    setInputValue('')

    try {
      await stream.submit(
        {
          messages: [
            {
              type: 'human',
              content: prompt,
            },
          ],
        },
        {
          threadId,
          streamMode: ['messages', 'values'],
          onDisconnect: 'cancel',
        },
      )
    } catch (error) {
      setOptimisticMessages([])
      const nextError = getErrorMessage(error, '发起流式对话失败')
      setErrorText(nextError)
      appendNotice(nextError, 'error')
    }
  }, [appendNotice, humanMessageCount, inputValue, stream, threadId])

  const submitFeedback = useCallback(
    async (runId: string, rating: 1 | -1) => {
      if (!threadId) {
        return
      }

      const currentRating = feedbackByRunId[runId]?.rating
      const previous = feedbackByRunId
      const nextFeedback: AssistantRunFeedback = {
        thread_id: threadId,
        run_id: runId,
        rating,
      }

      setFeedbackByRunId((current) => {
        if (currentRating === rating) {
          const { [runId]: _removed, ...rest } = current
          void _removed
          return rest
        }
        return {
          ...current,
          [runId]: nextFeedback,
        }
      })

      try {
        if (currentRating === rating) {
          await deleteAssistantRunFeedback(threadId, runId)
        } else {
          const savedFeedback = await upsertAssistantRunFeedback(threadId, runId, rating)
          setFeedbackByRunId((current) => ({ ...current, [runId]: savedFeedback }))
        }
      } catch (error) {
        setFeedbackByRunId(previous)
        const nextError = getErrorMessage(error, '提交反馈失败')
        setErrorText(nextError)
        appendNotice(nextError, 'error')
      }
    },
    [appendNotice, feedbackByRunId, threadId],
  )

  useEffect(() => {
    if (optimisticMessages.length === 0) {
      return
    }

    if (humanMessageCount > previousHumanMessageCountRef.current) {
      setOptimisticMessages([])
    }
  }, [humanMessageCount, optimisticMessages.length])

  useEffect(() => {
    scheduleAsyncTask(() => void refreshThreads())
  }, [refreshThreads])

  useEffect(() => {
    persistThreadId(threadId)
  }, [threadId])

  useEffect(() => {
    if (!threadId) {
      setFeedbackByRunId({})
      return
    }

    let cancelled = false
    listAssistantThreadFeedback(threadId)
      .then((feedback) => {
        if (!cancelled) {
          setFeedbackByRunId(feedback)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFeedbackByRunId({})
        }
      })

    return () => {
      cancelled = true
    }
  }, [threadId])

  useEffect(() => {
    if (
      !threadId ||
      historyLoading ||
      historyMessages.length > 0 ||
      streamMessages.length > 0 ||
      optimisticMessages.length > 0 ||
      hydratedHistoryThreadIdRef.current === threadId ||
      hydratingHistoryThreadIdRef.current === threadId
    ) {
      return
    }

    void replaceConversationWithHistory(threadId)
  }, [
    historyLoading,
    historyMessages.length,
    optimisticMessages.length,
    replaceConversationWithHistory,
    streamMessages.length,
    threadId,
  ])

  return {
    activeThread,
    closeHistoryDrawer,
    currentThreadTitle,
    deleteThread,
    errorText,
    exportThread,
    artifactPaths,
    feedbackByRunId,
    hasAssistantOutput,
    historyDrawerOpen,
    historyHasMore,
    historyLoading,
    inputValue,
    isStreaming: stream.isLoading,
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
    currentRunId,
  }
}
