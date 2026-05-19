import type { AssistantThreadSummary } from '@/api/assistant-history'

const THREAD_STORAGE_KEY = 'workflow-ai-assistant-thread-id'

export function readStoredThreadId() {
  if (typeof window === 'undefined') {
    return undefined
  }

  const stored = window.localStorage.getItem(THREAD_STORAGE_KEY)
  return stored || undefined
}

export function persistThreadId(threadId?: string) {
  if (typeof window === 'undefined') {
    return
  }

  if (threadId) {
    window.localStorage.setItem(THREAD_STORAGE_KEY, threadId)
    return
  }

  window.localStorage.removeItem(THREAD_STORAGE_KEY)
}

export function formatRelativeTimestamp(value?: string) {
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

export function getThreadSummaryTitle(thread: AssistantThreadSummary) {
  const metadataTitle = typeof thread.metadata?.title === 'string' ? thread.metadata.title.trim() : ''
  if (thread.display_name?.trim()) {
    return thread.display_name.trim()
  }
  if (metadataTitle) {
    return metadataTitle
  }
  return '未命名会话'
}

export function getThreadSummarySubtitle(thread: AssistantThreadSummary) {
  const assistantId = thread.assistant_id?.trim()
  if (assistantId) {
    return assistantId
  }
  return thread.status?.trim() || '线程会话'
}
