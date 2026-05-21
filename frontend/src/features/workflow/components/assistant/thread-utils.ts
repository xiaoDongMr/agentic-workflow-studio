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
  return getThreadTitle(thread) || '未命名会话'
}

export function getThreadTitle(thread: AssistantThreadSummary) {
  const displayName = thread.display_name?.trim()
  if (displayName) {
    return displayName
  }

  const metadataTitle = typeof thread.metadata?.title === 'string' ? thread.metadata.title.trim() : ''
  return metadataTitle || ''
}

export function mergeThreadSummaries(
  remoteThreads: AssistantThreadSummary[],
  currentThreads: AssistantThreadSummary[],
) {
  const currentById = new Map(currentThreads.map((thread) => [thread.thread_id, thread]))
  const remoteIds = new Set(remoteThreads.map((thread) => thread.thread_id))
  const mergedRemoteThreads = remoteThreads.map((remoteThread) => {
    const currentThread = currentById.get(remoteThread.thread_id)
    if (getThreadTitle(remoteThread) || !currentThread) {
      return remoteThread
    }

    const currentTitle = getThreadTitle(currentThread)
    if (!currentTitle) {
      return remoteThread
    }

    return {
      ...remoteThread,
      display_name: currentTitle,
    }
  })
  const localOnlyThreads = currentThreads.filter((thread) => !remoteIds.has(thread.thread_id) && getThreadTitle(thread))

  return [...localOnlyThreads, ...mergedRemoteThreads]
}

export function upsertThreadTitle(
  threads: AssistantThreadSummary[],
  threadId: string,
  title: string,
  status: AssistantThreadSummary['status'],
) {
  const index = threads.findIndex((thread) => thread.thread_id === threadId)
  if (index === -1) {
    return [
      {
        thread_id: threadId,
        display_name: title,
        status,
        updated_at: new Date().toISOString(),
      },
      ...threads,
    ]
  }

  const nextThreads = [...threads]
  nextThreads[index] = {
    ...nextThreads[index],
    display_name: title,
    updated_at: nextThreads[index].updated_at ?? new Date().toISOString(),
  }
  return nextThreads
}

export function getThreadSummarySubtitle(thread: AssistantThreadSummary) {
  const assistantId = thread.assistant_id?.trim()
  if (assistantId) {
    return assistantId
  }
  return thread.status?.trim() || '线程会话'
}
