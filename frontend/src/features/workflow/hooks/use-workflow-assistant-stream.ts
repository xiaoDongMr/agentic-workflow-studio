import { useCallback, useEffect, useRef, useState } from 'react'

import { applyWorkflowPatch } from '@/features/workflow/assistant/apply-workflow-patch'
import {
  clearWorkflowAssistantSession,
  readWorkflowAssistantSession,
  type WorkflowAssistantSessionSnapshot,
  writeWorkflowAssistantSession,
} from '@/features/workflow/assistant/session-storage'
import type {
  WorkflowAssistantClientEvent,
  WorkflowAssistantMessage,
  WorkflowAssistantStreamRequest,
  WorkflowClarificationAnswer,
  WorkflowClarification,
  WorkflowPatchResult,
  WorkflowPatchStage,
  WorkflowPlanPreview,
} from '@/features/workflow/assistant/types'
import { useWorkflowAssistantHistory } from '@/features/workflow/hooks/use-workflow-assistant-history'
import { validateWorkflowGraph } from '@/features/workflow/validation/workflow-validation-service'
import type { WorkflowValidationIssue } from '@/features/workflow/validation/workflow-validation.types'
import type { WorkflowDocument } from '@/types/workflow'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'
const WORKFLOW_AGENT_ID = 'workflow-agent'
const TRANSIENT_STAGE_ERRORS = new Set([
  '结束节点缺失',
  '条件分支未连接',
  'Else 分支未连接',
])

interface UseWorkflowAssistantStreamOptions {
  workflow: WorkflowDocument
  selectedNodeId?: string
  onPreviewWorkflow: (workflow: WorkflowDocument | null) => void
}

interface PendingRequest {
  event: WorkflowAssistantClientEvent
  message: string
  workflow: WorkflowDocument
  validation?: ReturnType<typeof validateWorkflowGraph>
}

export function useWorkflowAssistantStream({
  workflow,
  selectedNodeId,
  onPreviewWorkflow,
}: UseWorkflowAssistantStreamOptions) {
  const [initialSession] = useState(() => readWorkflowAssistantSession(workflow.id))
  const [threadId, setThreadId] = useState<string | undefined>(initialSession?.threadId)
  const [inputValue, setInputValue] = useState('')
  const [messages, setMessages] = useState<WorkflowAssistantMessage[]>(initialSession?.messages ?? [])
  const [clarification, setClarification] = useState<WorkflowClarification | undefined>(initialSession?.clarification)
  const [plan, setPlan] = useState<WorkflowPlanPreview | undefined>(initialSession?.plan)
  const [currentStage, setCurrentStage] = useState<WorkflowPatchStage | undefined>(initialSession?.currentStage)
  const [completedStages, setCompletedStages] = useState<WorkflowPatchStage[]>(initialSession?.completedStages ?? [])
  const [warnings, setWarnings] = useState<WorkflowValidationIssue[]>(initialSession?.warnings ?? [])
  const [isStreaming, setIsStreaming] = useState(false)
  const [isComplete, setIsComplete] = useState(initialSession?.isComplete ?? false)
  const [errorText, setErrorText] = useState('')
  const workflowRef = useRef(initialSession?.previewWorkflow ?? workflow)
  const threadIdRef = useRef(threadId)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    threadIdRef.current = threadId
  }, [threadId])

  useEffect(() => {
    if (initialSession) {
      onPreviewWorkflow(initialSession.previewWorkflow)
    }
  }, [initialSession, onPreviewWorkflow])

  useEffect(() => {
    if (!threadId) {
      return
    }
    writeWorkflowAssistantSession({
      workflowId: workflow.id,
      threadId,
      messages,
      clarification,
      plan,
      currentStage,
      completedStages,
      warnings,
      isComplete,
      previewWorkflow: workflowRef.current,
    })
  }, [
    clarification,
    completedStages,
    currentStage,
    isComplete,
    messages,
    plan,
    threadId,
    warnings,
    workflow.id,
  ])

  useEffect(() => {
    if (!isStreaming && !plan) {
      workflowRef.current = workflow
    }
  }, [isStreaming, plan, workflow])

  const appendMessage = useCallback((
    role: WorkflowAssistantMessage['role'],
    content: string,
    tone: WorkflowAssistantMessage['tone'] = 'default',
  ) => {
    setMessages((current) => [
      ...current,
      {
        id: createId(role),
        role,
        content,
        tone,
      },
    ])
  }, [])

  const clearConversationState = useCallback(() => {
    workflowRef.current = workflow
    setMessages([])
    setClarification(undefined)
    setPlan(undefined)
    setCurrentStage(undefined)
    setCompletedStages([])
    setWarnings([])
    setIsComplete(false)
    setErrorText('')
    onPreviewWorkflow(null)
  }, [onPreviewWorkflow, workflow])

  const resetConversation = useCallback(() => {
    abortControllerRef.current?.abort()
    clearWorkflowAssistantSession()
    threadIdRef.current = undefined
    setThreadId(undefined)
    clearConversationState()
  }, [clearConversationState])

  const restoreThread = useCallback((
    nextThreadId: string,
    restoredMessages: WorkflowAssistantMessage[],
  ) => {
    abortControllerRef.current?.abort()
    clearConversationState()
    threadIdRef.current = nextThreadId
    setThreadId(nextThreadId)
    setMessages(restoredMessages)
  }, [clearConversationState])

  const restoreSession = useCallback((
    snapshot: WorkflowAssistantSessionSnapshot,
  ) => {
    abortControllerRef.current?.abort()
    threadIdRef.current = snapshot.threadId
    workflowRef.current = snapshot.previewWorkflow
    setThreadId(snapshot.threadId)
    setMessages(snapshot.messages)
    setClarification(snapshot.clarification)
    setPlan(snapshot.plan)
    setCurrentStage(snapshot.currentStage)
    setCompletedStages(snapshot.completedStages)
    setWarnings(snapshot.warnings)
    setIsComplete(snapshot.isComplete)
    setErrorText('')
    onPreviewWorkflow(snapshot.previewWorkflow)
  }, [onPreviewWorkflow])

  const history = useWorkflowAssistantHistory({
    workflowId: workflow.id,
    threadId,
    messages,
    isStreaming,
    onResetConversation: resetConversation,
    onRestoreSession: restoreSession,
    onRestoreThread: restoreThread,
  })

  const runRequest = useCallback(async (initial: PendingRequest) => {
    setIsStreaming(true)
    setErrorText('')
    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      let pending: PendingRequest | undefined = initial
      while (pending && !controller.signal.aborted) {
        const activeThreadId = threadIdRef.current ?? createWorkflowThreadId()
        if (!threadIdRef.current) {
          threadIdRef.current = activeThreadId
          setThreadId(activeThreadId)
        }
        const body: WorkflowAssistantStreamRequest = {
          threadId: activeThreadId,
          message: pending.message,
          workflow: pending.workflow,
          selectedNodeId,
          clientEvent: pending.event,
          validation: pending.validation,
        }
        const response = await fetch(
          `${API_BASE_URL}/threads/${encodeURIComponent(activeThreadId)}/runs/stream`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              assistant_id: WORKFLOW_AGENT_ID,
              input: {
                workflowAssistant: body,
              },
              stream_mode: ['custom'],
            }),
            signal: controller.signal,
          },
        )
        if (!response.ok || !response.body) {
          throw new Error(`工作流助手请求失败：${response.status}`)
        }

        let followUp: PendingRequest | undefined
        await consumeSse(response.body, (event, rawData) => {
          if (event === 'error') {
            const message = errorMessage(rawData)
            setErrorText(message)
            appendMessage('system', message, 'error')
            followUp = undefined
            return
          }

          const data = workflowEventData(event, rawData)
          if (!data) {
            return
          }

          if (typeof data.threadId === 'string') {
            threadIdRef.current = data.threadId
            setThreadId(data.threadId)
          }

          const workflowEvent = String(data.type).slice('workflow.'.length)
          if (workflowEvent === 'message' && typeof data.message === 'string') {
            appendMessage('assistant', data.message)
            return
          }
          if (workflowEvent === 'clarification') {
            const next = data as unknown as WorkflowClarification
            setClarification(next)
            setPlan(undefined)
            appendMessage('assistant', next.summary || '需要补充少量关键信息')
            return
          }
          if (workflowEvent === 'planPreview') {
            const next = data as unknown as WorkflowPlanPreview
            setPlan(next)
            setClarification(undefined)
            appendMessage('assistant', next.summary)
            return
          }
          if (workflowEvent === 'patchStage') {
            const stage = data.stage as WorkflowPatchStage
            setCurrentStage(stage)
            return
          }
          if (workflowEvent === 'fixing') {
            const message = typeof data.message === 'string' ? data.message : '正在自动修复'
            appendMessage('system', message)
            return
          }
          if (workflowEvent === 'workflowPatch') {
            const result = data as unknown as WorkflowPatchResult
            const nextWorkflow = applyWorkflowPatch(workflowRef.current, result.patch)
            workflowRef.current = nextWorkflow
            onPreviewWorkflow(nextWorkflow)
            setCurrentStage(result.stage)
            setCompletedStages((current) => upsertStage(current, result.stage))

            const validation = validateWorkflowGraph(nextWorkflow.nodes, nextWorkflow.edges)
            setWarnings(validation.issues.filter((issue) => issue.severity === 'warning'))
            const blockingIssues = getBlockingIssues(validation.issues, result.stage.final)
            if (blockingIssues.length > 0) {
              followUp = {
                event: 'validation_failed',
                message: '修复当前阶段的画布校验错误',
                workflow: nextWorkflow,
                validation,
              }
            } else {
              followUp = {
                event: 'stage_validated',
                message: '当前阶段校验通过，继续下一阶段',
                workflow: nextWorkflow,
              }
            }
            return
          }
          if (workflowEvent === 'complete') {
            setIsComplete(true)
            setCurrentStage(undefined)
            appendMessage('assistant', '工作流已生成并通过校验，可以应用到正式画布。', 'success')
            followUp = undefined
            return
          }
          if (workflowEvent === 'error') {
            const message = typeof data.message === 'string' ? data.message : '工作流助手执行失败'
            setErrorText(message)
            appendMessage('system', message, 'error')
            followUp = undefined
          }
        })
        pending = followUp
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }
      const message = error instanceof Error ? error.message : '工作流助手执行失败'
      setErrorText(message)
      appendMessage('system', message, 'error')
    } finally {
      setIsStreaming(false)
      abortControllerRef.current = null
      void history.refreshThreads()
    }
  }, [appendMessage, history.refreshThreads, onPreviewWorkflow, selectedNodeId])

  const sendMessage = useCallback(async () => {
    const message = inputValue.trim()
    if (!message || isStreaming) {
      return
    }
    const isNewThread = !threadIdRef.current
    setInputValue('')
    appendMessage('user', message)
    setIsComplete(false)
    await runRequest({
      event: 'user_message',
      message,
      workflow: workflowRef.current,
    })
    const activeThreadId = threadIdRef.current
    if (isNewThread && activeThreadId) {
      await history.nameThread(activeThreadId, message)
    }
  }, [appendMessage, history.nameThread, inputValue, isStreaming, runRequest])

  const submitClarification = useCallback(async (
    answers: WorkflowClarificationAnswer[],
  ) => {
    if (!clarification || isStreaming) {
      return
    }
    const answerByQuestion = new Map(answers.map((answer) => [answer.questionId, answer]))
    const message = clarification.questions
      .map((question) => {
        const answer = answerByQuestion.get(question.id)
        const values = [...(answer?.answers ?? [])]
        if (answer?.other?.trim()) {
          values.push(answer.other.trim())
        }
        return `${question.question}：${values.join('、')}`
      })
      .join('\n')
    appendMessage('user', message)
    setClarification(undefined)
    setIsComplete(false)
    await runRequest({
      event: 'user_message',
      message,
      workflow: workflowRef.current,
    })
  }, [appendMessage, clarification, isStreaming, runRequest])

  const confirmPlan = useCallback(async () => {
    if (!plan || isStreaming) {
      return
    }
    setCompletedStages([])
    setWarnings([])
    setIsComplete(false)
    onPreviewWorkflow(workflowRef.current)
    await runRequest({
      event: 'confirm_plan',
      message: '确认当前流程草图并开始生成',
      workflow: workflowRef.current,
    })
  }, [isStreaming, onPreviewWorkflow, plan, runRequest])

  const cancelPlan = useCallback(async () => {
    abortControllerRef.current?.abort()
    if (threadIdRef.current) {
      await runRequest({
        event: 'cancel_plan',
        message: '取消当前计划',
        workflow: workflowRef.current,
      })
    }
    setPlan(undefined)
    setClarification(undefined)
    setCurrentStage(undefined)
    setCompletedStages([])
    setWarnings([])
    setIsComplete(false)
    onPreviewWorkflow(null)
  }, [onPreviewWorkflow, runRequest])

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort()
    setIsStreaming(false)
  }, [])

  return {
    activeThread: history.activeThread,
    cancelPlan,
    clarification,
    closeHistoryDrawer: history.closeHistoryDrawer,
    completedStages,
    confirmPlan,
    currentStage,
    currentThreadTitle: history.currentThreadTitle,
    deleteThread: history.deleteThread,
    errorText: errorText || history.historyErrorText,
    exportThread: history.exportThread,
    historyDrawerOpen: history.historyDrawerOpen,
    historyLoading: history.historyLoading,
    inputValue,
    isComplete,
    isStreaming,
    messages,
    openHistoryDrawer: history.openHistoryDrawer,
    plan,
    renameThread: history.renameThread,
    sendMessage,
    selectThread: history.selectThread,
    setInputValue,
    stopStreaming,
    submitClarification,
    resetConversation,
    threadId,
    threads: history.threads,
    threadsLoading: history.threadsLoading,
    warnings,
    previewWorkflow: workflowRef.current,
  }
}

function getBlockingIssues(issues: WorkflowValidationIssue[], final: boolean) {
  return issues.filter((issue) => (
    issue.severity === 'error'
    && (final || !TRANSIENT_STAGE_ERRORS.has(issue.title))
  ))
}

function upsertStage(stages: WorkflowPatchStage[], stage: WorkflowPatchStage) {
  return [
    ...stages.filter((item) => item.stageId !== stage.stageId),
    stage,
  ].sort((left, right) => left.sequence - right.sequence)
}

async function consumeSse(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: string, data: unknown) => void,
) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() ?? ''
    chunks.forEach((chunk) => parseSseChunk(chunk, onEvent))
    if (done) {
      if (buffer.trim()) {
        parseSseChunk(buffer, onEvent)
      }
      break
    }
  }
}

function parseSseChunk(
  chunk: string,
  onEvent: (event: string, data: unknown) => void,
) {
  let event = 'message'
  const dataLines: string[] = []
  chunk.split('\n').forEach((line) => {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim())
    }
  })
  if (dataLines.length === 0) {
    return
  }
  const data = JSON.parse(dataLines.join('\n')) as unknown
  onEvent(event, data)
}

function workflowEventData(event: string, data: unknown): Record<string, unknown> | undefined {
  if (event !== 'custom' || !data || typeof data !== 'object') {
    return undefined
  }
  const payload = data as Record<string, unknown>
  return typeof payload.type === 'string' && payload.type.startsWith('workflow.')
    ? payload
    : undefined
}

function errorMessage(data: unknown) {
  if (data && typeof data === 'object') {
    const message = (data as Record<string, unknown>).message
    if (typeof message === 'string') {
      return message
    }
  }
  return '工作流助手执行失败'
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createWorkflowThreadId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `workflow-agent-${Date.now()}-${Math.random().toString(16).slice(2)}`
}
