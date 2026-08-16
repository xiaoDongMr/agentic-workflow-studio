import type {
  WorkflowAssistantMessage,
  WorkflowClarification,
  WorkflowConfirmedClarification,
  WorkflowPlanPreview,
  WorkflowSandboxRequirement,
  WorkflowToolActivity,
} from '@/features/workflow/assistant/types'
import type { WorkflowDocument } from '@/types/workflow'

const STORAGE_KEY = 'workflow-ai-assistant-sessions'
const MAX_SESSION_COUNT = 20

interface WorkflowAssistantSessionStore {
  activeThreadId?: string
  sessions: Record<string, WorkflowAssistantSessionSnapshot>
}

export interface WorkflowAssistantSessionSnapshot {
  workflowId: string
  threadId: string
  messages: WorkflowAssistantMessage[]
  clarification?: WorkflowClarification
  confirmedClarifications: WorkflowConfirmedClarification[]
  sandboxRequirement?: WorkflowSandboxRequirement
  plan?: WorkflowPlanPreview
  planTimestamp?: number
  planConfirmed: boolean
  toolActivities: WorkflowToolActivity[]
  isComplete: boolean
  previewWorkflow: WorkflowDocument
}

export function readWorkflowAssistantSession(
  workflowId: string,
): WorkflowAssistantSessionSnapshot | undefined {
  const store = readStore()
  if (!store.activeThreadId) {
    return undefined
  }
  return readWorkflowAssistantSessionByThread(workflowId, store.activeThreadId)
}

export function readWorkflowAssistantSessionByThread(
  workflowId: string,
  threadId: string,
): WorkflowAssistantSessionSnapshot | undefined {
  if (!workflowId || !threadId) {
    return undefined
  }
  const snapshot = readStore().sessions[threadId]
  if (!isValidSnapshot(snapshot) || snapshot.workflowId !== workflowId) {
    return undefined
  }
  return snapshot
}

export function writeWorkflowAssistantSession(
  snapshot: WorkflowAssistantSessionSnapshot,
) {
  if (typeof window === 'undefined') {
    return
  }
  try {
    const store = readStore()
    const { [snapshot.threadId]: _previous, ...otherSessions } = store.sessions
    void _previous
    const retainedEntries = [
      ...Object.entries(otherSessions),
      [snapshot.threadId, snapshot] as const,
    ].slice(-MAX_SESSION_COUNT)
    writeStore({
      activeThreadId: snapshot.threadId,
      sessions: Object.fromEntries(retainedEntries),
    })
  } catch {
    // Storage quota or privacy mode must not block the assistant.
  }
}

export function clearWorkflowAssistantSession() {
  if (typeof window === 'undefined') {
    return
  }
  try {
    const store = readStore()
    writeStore({ sessions: store.sessions })
  } catch {
    // Ignore unavailable browser storage.
  }
}

export function deleteWorkflowAssistantSession(threadId: string) {
  if (typeof window === 'undefined') {
    return
  }
  try {
    const store = readStore()
    const { [threadId]: _deleted, ...sessions } = store.sessions
    void _deleted
    writeStore({
      activeThreadId: store.activeThreadId === threadId ? undefined : store.activeThreadId,
      sessions,
    })
  } catch {
    // Ignore unavailable browser storage.
  }
}

function readStore(): WorkflowAssistantSessionStore {
  if (typeof window === 'undefined') {
    return { sessions: {} }
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return { sessions: {} }
  }
  try {
    const parsed = JSON.parse(raw) as Partial<WorkflowAssistantSessionStore>
    return {
      activeThreadId: parsed.activeThreadId,
      sessions: parsed.sessions && typeof parsed.sessions === 'object'
        ? parsed.sessions
        : {},
    }
  } catch {
    return { sessions: {} }
  }
}

function writeStore(store: WorkflowAssistantSessionStore) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

function isValidSnapshot(
  snapshot: WorkflowAssistantSessionSnapshot | undefined,
): snapshot is WorkflowAssistantSessionSnapshot {
  return Boolean(
    snapshot
    && typeof snapshot.threadId === 'string'
    && snapshot.previewWorkflow
    && Array.isArray(snapshot.messages)
    && Array.isArray(snapshot.confirmedClarifications)
    && typeof snapshot.planConfirmed === 'boolean'
    && (!snapshot.plan || typeof snapshot.planTimestamp === 'number')
    && Array.isArray(snapshot.toolActivities)
    && typeof snapshot.isComplete === 'boolean',
  )
}
