import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  deleteAssistantThread,
  listAssistantThreadRuns,
  listAssistantThreads,
  renameAssistantThread,
  type AssistantThreadRun,
  type AssistantThreadSummary,
} from '@/api/assistant-history'
import type { WorkflowAssistantMessage, WorkflowAssistantStreamRequest } from '@/features/workflow/assistant/types'
import {
  deleteWorkflowAssistantSession,
  readWorkflowAssistantSessionByThread,
  type WorkflowAssistantSessionSnapshot,
} from '@/features/workflow/assistant/session-storage'
import {
  getThreadSummaryTitle,
  mergeThreadSummaries,
  upsertThreadTitle,
} from '@/features/workflow/components/assistant'

const WORKFLOW_AGENT_ID = 'workflow-agent'

interface UseWorkflowAssistantHistoryOptions {
  workflowId: string
  threadId?: string
  messages: WorkflowAssistantMessage[]
  isStreaming: boolean
  onResetConversation: () => void
  onRestoreSession: (snapshot: WorkflowAssistantSessionSnapshot) => void
  onRestoreThread: (threadId: string, messages: WorkflowAssistantMessage[]) => void
}

export function useWorkflowAssistantHistory({
  workflowId,
  threadId,
  messages,
  isStreaming,
  onResetConversation,
  onRestoreSession,
  onRestoreThread,
}: UseWorkflowAssistantHistoryOptions) {
  const [threads, setThreads] = useState<AssistantThreadSummary[]>([])
  const [threadsLoading, setThreadsLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false)
  const [historyErrorText, setHistoryErrorText] = useState('')

  const refreshThreads = useCallback(async () => {
    setThreadsLoading(true)
    setHistoryErrorText('')
    try {
      const remoteThreads = await listAssistantThreads(200)
      const workflowThreads = remoteThreads.filter((thread) => (
        normalizeAssistantId(thread.assistant_id) === WORKFLOW_AGENT_ID
      ))
      setThreads((current) => mergeThreadSummaries(workflowThreads, current))
    } catch (error) {
      setHistoryErrorText(getErrorMessage(error, '加载工作流助手历史失败'))
    } finally {
      setThreadsLoading(false)
    }
  }, [])

  const nameThread = useCallback(async (targetThreadId: string, message: string) => {
    const title = workflowThreadTitle(message)
    try {
      await renameAssistantThread(targetThreadId, title)
      setThreads((current) => upsertThreadTitle(current, targetThreadId, title, 'idle'))
    } catch {
      // Naming failure must not block an otherwise successful conversation.
    }
  }, [])

  const selectThread = useCallback(async (nextThreadId: string) => {
    if (isStreaming || historyLoading || nextThreadId === threadId) {
      return
    }
    setHistoryLoading(true)
    setHistoryErrorText('')
    try {
      const snapshot = readWorkflowAssistantSessionByThread(workflowId, nextThreadId)
      if (snapshot) {
        onRestoreSession(snapshot)
        return
      }
      const runs = await listAssistantThreadRuns(nextThreadId)
      onRestoreThread(nextThreadId, restoreWorkflowMessages(runs))
    } catch (error) {
      setHistoryErrorText(getErrorMessage(error, '加载工作流助手历史失败'))
    } finally {
      setHistoryLoading(false)
    }
  }, [
    historyLoading,
    isStreaming,
    onRestoreSession,
    onRestoreThread,
    threadId,
    workflowId,
  ])

  const renameThread = useCallback(async (targetThreadId: string, title: string) => {
    const nextTitle = title.trim()
    if (!nextTitle) {
      return
    }
    try {
      await renameAssistantThread(targetThreadId, nextTitle)
      setThreads((current) => upsertThreadTitle(current, targetThreadId, nextTitle, 'idle'))
    } catch (error) {
      setHistoryErrorText(getErrorMessage(error, '重命名会话失败'))
    }
  }, [])

  const deleteThread = useCallback(async (targetThreadId: string) => {
    try {
      await deleteAssistantThread(targetThreadId)
      deleteWorkflowAssistantSession(targetThreadId)
      setThreads((current) => current.filter((thread) => thread.thread_id !== targetThreadId))
      if (targetThreadId === threadId) {
        onResetConversation()
      }
    } catch (error) {
      setHistoryErrorText(getErrorMessage(error, '删除会话失败'))
    }
  }, [onResetConversation, threadId])

  const exportThread = useCallback(async (
    targetThread: AssistantThreadSummary,
    format: 'markdown' | 'json',
  ) => {
    try {
      const exportMessages = targetThread.thread_id === threadId
        ? messages
        : restoreWorkflowMessages(await listAssistantThreadRuns(targetThread.thread_id))
      exportWorkflowConversation(targetThread, exportMessages, format)
    } catch (error) {
      setHistoryErrorText(getErrorMessage(error, '导出会话失败'))
    }
  }, [messages, threadId])

  const openHistoryDrawer = useCallback(() => {
    setHistoryDrawerOpen(true)
    void refreshThreads()
  }, [refreshThreads])

  const closeHistoryDrawer = useCallback(() => {
    setHistoryDrawerOpen(false)
  }, [])

  useEffect(() => {
    void refreshThreads()
  }, [refreshThreads])

  const activeThread = useMemo(
    () => threads.find((thread) => thread.thread_id === threadId),
    [threadId, threads],
  )

  return {
    activeThread,
    closeHistoryDrawer,
    currentThreadTitle: activeThread ? getThreadSummaryTitle(activeThread) : '',
    deleteThread,
    exportThread,
    historyDrawerOpen,
    historyErrorText,
    historyLoading,
    nameThread,
    openHistoryDrawer,
    refreshThreads,
    renameThread,
    selectThread,
    threads,
    threadsLoading,
  }
}

function normalizeAssistantId(value?: string | null) {
  return value?.trim().toLowerCase().replaceAll('_', '-') ?? ''
}

function workflowThreadTitle(message: string) {
  const normalized = message.replace(/\s+/g, ' ').trim()
  return normalized.length > 36 ? `${normalized.slice(0, 36)}...` : normalized
}

function restoreWorkflowMessages(runs: AssistantThreadRun[]): WorkflowAssistantMessage[] {
  const messages: WorkflowAssistantMessage[] = []
  for (const run of runs) {
    const timestamp = parseRunTimestamp(run)
    const request = getWorkflowRequest(run)
    if (
      request
      && (request.clientEvent === 'user_message' || request.clientEvent === 'revise_plan')
      && request.message.trim()
    ) {
      messages.push({
        id: `history-user-${run.run_id}`,
        role: 'user',
        content: request.message.trim(),
        timestamp,
      })
    }
    if (run.status === 'error') {
      messages.push({
        id: `history-error-${run.run_id}`,
        role: 'system',
        content: '该次工作流助手请求执行失败',
        tone: 'error',
        timestamp,
      })
    }
  }
  messages.push({
    id: `history-restored-${runs.at(-1)?.run_id ?? 'thread'}`,
    role: 'system',
    content: messages.length > 0
      ? '已恢复历史需求记录，可以基于当前画布继续调整。'
      : '该会话暂无可恢复的需求记录，可以基于当前画布继续调整。',
    timestamp: Date.now(),
  })
  return messages
}

function parseRunTimestamp(run: AssistantThreadRun) {
  const value = run.created_at ?? run.updated_at
  if (!value) {
    return Date.now()
  }
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : Date.now()
}

function getWorkflowRequest(run: AssistantThreadRun): WorkflowAssistantStreamRequest | undefined {
  const input = run.kwargs?.input
  if (!isRecord(input)) {
    return undefined
  }
  const request = input.workflowAssistant
  if (!isRecord(request) || typeof request.message !== 'string') {
    return undefined
  }
  return request as unknown as WorkflowAssistantStreamRequest
}

function exportWorkflowConversation(
  thread: AssistantThreadSummary,
  messages: WorkflowAssistantMessage[],
  format: 'markdown' | 'json',
) {
  const title = getThreadSummaryTitle(thread)
  const content = format === 'json'
    ? JSON.stringify({
        title,
        thread_id: thread.thread_id,
        created_at: thread.created_at,
        exported_at: new Date().toISOString(),
        messages,
      }, null, 2)
    : [
        `# ${title}`,
        '',
        ...messages.flatMap((message) => [
          `## ${message.role === 'user' ? 'User' : 'Assistant'}`,
          '',
          message.content,
          '',
          '---',
          '',
        ]),
      ].join('\n')
  downloadTextFile(
    content,
    `${sanitizeFilename(title)}.${format === 'json' ? 'json' : 'md'}`,
    format === 'json' ? 'application/json;charset=utf-8' : 'text/markdown;charset=utf-8',
  )
}

function downloadTextFile(content: string, filename: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function sanitizeFilename(value: string) {
  return value.replace(/[^\w\u4e00-\u9fa5 -]/g, '').trim() || 'workflow-conversation'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}
