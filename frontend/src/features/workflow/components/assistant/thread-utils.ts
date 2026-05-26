import type { AssistantThreadSummary } from '@/api/assistant-history'

const THREAD_STORAGE_KEY = 'workflow-ai-assistant-thread-id'
const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

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

  const date = new Date(value)
  const timestamp = date.getTime()
  if (Number.isNaN(timestamp)) {
    return '最近更新'
  }

  const delta = Date.now() - timestamp
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  const absDelta = Math.abs(delta)
  const timeText = date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  if (delta < 0 && absDelta < minute) {
    return '刚刚'
  }
  if (delta < 0) {
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }
  if (delta < minute) {
    return '刚刚'
  }
  if (delta < hour) {
    return `${Math.floor(delta / minute)} 分钟前`
  }
  if (delta < day) {
    return `${Math.floor(delta / hour)} 小时前`
  }

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const dayDiff = Math.floor((startOfToday - startOfTarget) / day)

  if (dayDiff === 1) {
    return `昨天 ${timeText}`
  }
  if (dayDiff > 1 && dayDiff < 7) {
    return `${WEEKDAY_LABELS[date.getDay()]} ${timeText}`
  }

  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleString('zh-CN', {
    year: sameYear ? undefined : 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function getThreadSummaryTitle(thread: AssistantThreadSummary) {
  return getThreadTitle(thread) || 'Untitled'
}

export function getThreadTitle(thread: AssistantThreadSummary) {
  const valueTitle = typeof thread.values?.title === 'string' ? thread.values.title.trim() : ''
  return valueTitle || ''
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
      values: {
        ...remoteThread.values,
        title: currentTitle,
      },
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
        values: {
          title,
        },
        status,
        updated_at: new Date().toISOString(),
      },
      ...threads,
    ]
  }

  const nextThreads = [...threads]
  nextThreads[index] = {
    ...nextThreads[index],
    values: {
      ...nextThreads[index].values,
      title,
    },
    updated_at: nextThreads[index].updated_at ?? new Date().toISOString(),
  }
  return nextThreads
}

export function getThreadUpdatedAt(thread: AssistantThreadSummary) {
  return thread.updated_at || thread.created_at
}
