import { useCallback, useEffect, useRef, useState } from 'react'

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
  WorkflowConfirmedClarification,
  WorkflowGraphNode,
  WorkflowGraphResult,
  WorkflowMetadataResult,
  WorkflowPlanPreview,
  WorkflowPreviewGraphSummary,
  WorkflowSandboxRequirement,
  WorkflowToolActivity,
} from '@/features/workflow/assistant/types'
import { useWorkflowAssistantHistory } from '@/features/workflow/hooks/use-workflow-assistant-history'
import type { WorkflowDocument, WorkflowEdge, WorkflowNode } from '@/types/workflow'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'
const WORKFLOW_AGENT_ID = 'workflow-agent'
interface UseWorkflowAssistantStreamOptions {
  workflow: WorkflowDocument
  selectedNodeId?: string
  sandboxId?: string
  sandboxBindingStatus: 'unbound' | 'bound' | 'unavailable'
  onPreviewWorkflow: (workflow: WorkflowDocument | null) => void
  onOpenSandbox: () => void
}

interface PendingRequest {
  event: WorkflowAssistantClientEvent
  message: string
  workflow: WorkflowDocument
}

export function useWorkflowAssistantStream({
  workflow,
  selectedNodeId,
  sandboxId,
  sandboxBindingStatus,
  onPreviewWorkflow,
  onOpenSandbox,
}: UseWorkflowAssistantStreamOptions) {
  const [initialSession] = useState(() => readWorkflowAssistantSession(workflow.id))
  const [threadId, setThreadId] = useState<string | undefined>(initialSession?.threadId)
  const [inputValue, setInputValue] = useState('')
  const [messages, setMessages] = useState<WorkflowAssistantMessage[]>(initialSession?.messages ?? [])
  const [clarification, setClarification] = useState<WorkflowClarification | undefined>(initialSession?.clarification)
  const [confirmedClarifications, setConfirmedClarifications] = useState<
    WorkflowConfirmedClarification[]
  >(initialSession?.confirmedClarifications ?? [])
  const [sandboxRequirement, setSandboxRequirement] = useState<WorkflowSandboxRequirement | undefined>(
    initialSession?.sandboxRequirement,
  )
  const [plan, setPlan] = useState<WorkflowPlanPreview | undefined>(initialSession?.plan)
  const [planTimestamp, setPlanTimestamp] = useState<number | undefined>(
    initialSession?.planTimestamp,
  )
  const [planConfirmed, setPlanConfirmed] = useState(initialSession?.planConfirmed ?? false)
  const [toolActivities, setToolActivities] = useState<WorkflowToolActivity[]>(
    initialSession?.toolActivities ?? [],
  )
  const [runStatusText, setRunStatusText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [isComplete, setIsComplete] = useState(initialSession?.isComplete ?? false)
  const [errorText, setErrorText] = useState('')
  const [previewWorkflowState, setPreviewWorkflowState] = useState(
    initialSession?.previewWorkflow ?? workflow,
  )
  const workflowRef = useRef(previewWorkflowState)
  const threadIdRef = useRef(threadId)
  const abortControllerRef = useRef<AbortController | null>(null)
  const activePreviewWorkflow = (
    isStreaming
    || Boolean(plan)
    || isComplete
  )
    ? previewWorkflowState
    : workflow

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
      confirmedClarifications,
      sandboxRequirement,
      plan,
      planTimestamp,
      planConfirmed,
      toolActivities,
      isComplete,
      previewWorkflow: activePreviewWorkflow,
    })
  }, [
    clarification,
    confirmedClarifications,
    isComplete,
    messages,
    plan,
    planConfirmed,
    planTimestamp,
    activePreviewWorkflow,
    sandboxRequirement,
    threadId,
    toolActivities,
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
        timestamp: Date.now(),
      },
    ])
  }, [])

  const clearConversationState = useCallback(() => {
    workflowRef.current = workflow
    setPreviewWorkflowState(workflow)
    setMessages([])
    setClarification(undefined)
    setConfirmedClarifications([])
    setSandboxRequirement(undefined)
    setPlan(undefined)
    setPlanTimestamp(undefined)
    setPlanConfirmed(false)
    setToolActivities([])
    setRunStatusText('')
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
    setPreviewWorkflowState(snapshot.previewWorkflow)
    setThreadId(snapshot.threadId)
    setMessages(snapshot.messages)
    setClarification(snapshot.clarification)
    setConfirmedClarifications(snapshot.confirmedClarifications)
    setSandboxRequirement(snapshot.sandboxRequirement)
    setPlan(snapshot.plan)
    setPlanTimestamp(snapshot.planTimestamp)
    setPlanConfirmed(snapshot.planConfirmed)
    setToolActivities(snapshot.toolActivities)
    setRunStatusText('')
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
  const refreshThreads = history.refreshThreads
  const nameThread = history.nameThread

  const runRequest = useCallback(async (initial: PendingRequest) => {
    setPreviewWorkflowState(workflowRef.current)
    setIsStreaming(true)
    setErrorText('')
    setRunStatusText('')
    setToolActivities([])
    let activitySettlement: Exclude<WorkflowToolActivity['status'], 'running'> = 'completed'
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
          workflowId: pending.workflow.id,
          message: pending.message,
          workflow: pending.workflow,
          selectedNodeId,
          sandboxId,
          sandboxBindingStatus,
          clientEvent: pending.event,
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
              stream_mode: ['custom', 'messages-tuple'],
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
            activitySettlement = 'failed'
            setErrorText(message)
            appendMessage('system', message, 'error')
            followUp = undefined
            return
          }

          if (event === 'messages') {
            const activity = normalizeModelOutputDelta(rawData)
            if (activity) {
              setToolActivities((current) => upsertModelOutputActivity(
                current,
                activity,
              ))
            }
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
            setRunStatusText(data.message)
            return
          }
          if (workflowEvent === 'modelOutput') {
            setToolActivities((current) => upsertModelOutputActivity(
              current,
              normalizeModelOutputActivity(data),
            ))
            return
          }
          if (workflowEvent === 'toolActivity') {
            setToolActivities((current) => upsertToolActivity(
              current,
              normalizeToolActivity(data),
            ))
            return
          }
          if (workflowEvent === 'systemNotice') {
            const message = typeof data.message === 'string'
              ? data.message
              : '系统已介入当前执行'
            const terminal = data.terminal === true
            const tone = data.level === 'error' ? 'error' : 'warning'
            appendMessage('system', message, tone)
            if (terminal) {
              activitySettlement = 'failed'
              setErrorText(message)
              setRunStatusText('')
              followUp = undefined
            }
            return
          }
          if (workflowEvent === 'clarification') {
            const next = data as unknown as WorkflowClarification
            setClarification(next)
            setSandboxRequirement(undefined)
            setPlan(undefined)
            setPlanTimestamp(undefined)
            return
          }
          if (workflowEvent === 'sandboxRequired') {
            const next = data as unknown as WorkflowSandboxRequirement
            setSandboxRequirement(next)
            setClarification(undefined)
            setPlan(undefined)
            setPlanTimestamp(undefined)
            onOpenSandbox()
            return
          }
          if (workflowEvent === 'planPreview') {
            const next = data as unknown as WorkflowPlanPreview
            setPlan(next)
            setPlanTimestamp(Date.now())
            setPlanConfirmed(false)
            setClarification(undefined)
            setSandboxRequirement(undefined)
            return
          }
          if (workflowEvent === 'workflowMetadata') {
            const result = data as unknown as WorkflowMetadataResult
            const nextWorkflow = {
              ...workflowRef.current,
              name: result.name,
              description: result.description,
            }
            workflowRef.current = nextWorkflow
            setPreviewWorkflowState(nextWorkflow)
            onPreviewWorkflow(nextWorkflow)
            return
          }
          if (workflowEvent === 'workflowGraph') {
            const result = data as unknown as WorkflowGraphResult
            const previousWorkflow = workflowRef.current
            const nextWorkflow = mergeGeneratedGraph(previousWorkflow, result)
            const previewGraphSummary = summarizePreviewGraphUpdate(previousWorkflow, nextWorkflow)
            workflowRef.current = nextWorkflow
            setPreviewWorkflowState(nextWorkflow)
            onPreviewWorkflow(nextWorkflow)
            setToolActivities((current) => {
              const nextPreviewGraphSummary = withPreviewGraphSyncIndex(
                previewGraphSummary,
                current,
              )
              return upsertToolActivity(
                current,
                createLocalToolActivity({
                  toolName: 'frontend.apply_preview_graph',
                  label: '同步预览快照',
                  category: 'canvas',
                  status: 'completed',
                  detail: formatPreviewGraphUpdateDetail(nextPreviewGraphSummary),
                  previewGraphSummary: nextPreviewGraphSummary,
                }),
              )
            })
            return
          }
          if (workflowEvent === 'complete') {
            setIsComplete(true)
            appendMessage('assistant', '工作流已生成并同步到当前画布。', 'success')
            followUp = undefined
            return
          }
          if (workflowEvent === 'error') {
            const message = typeof data.message === 'string' ? data.message : '工作流助手执行失败'
            activitySettlement = 'failed'
            setErrorText(message)
            setRunStatusText('')
            appendMessage('system', message, 'error')
            followUp = undefined
          }
        })
        pending = followUp
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        activitySettlement = 'cancelled'
        return
      }
      activitySettlement = 'failed'
      const message = error instanceof Error ? error.message : '工作流助手执行失败'
      setErrorText(message)
      appendMessage('system', message, 'error')
    } finally {
      setIsStreaming(false)
      setRunStatusText('')
      setToolActivities((current) => settleRunningActivities(current, activitySettlement))
      abortControllerRef.current = null
      void refreshThreads()
    }
  }, [
    appendMessage,
    refreshThreads,
    onOpenSandbox,
    onPreviewWorkflow,
    sandboxBindingStatus,
    sandboxId,
    selectedNodeId,
  ])

  const sendMessage = useCallback(async () => {
    const message = inputValue.trim()
    if (!message || isStreaming) {
      return
    }
    const isNewThread = !threadIdRef.current
    const initialWorkflowName = workflowRef.current.name.trim()
    setInputValue('')
    appendMessage('user', message)
    setSandboxRequirement(undefined)
    setIsComplete(false)
    await runRequest({
      event: 'clarification_response',
      message,
      workflow: workflowRef.current,
    })
    const activeThreadId = threadIdRef.current
    if (isNewThread && activeThreadId) {
      const generatedWorkflowName = workflowRef.current.name.trim()
      const threadTitle = (
        (!initialWorkflowName || initialWorkflowName === '未命名项目')
        && generatedWorkflowName
        && generatedWorkflowName !== '未命名项目'
      )
        ? generatedWorkflowName
        : message
      await nameThread(activeThreadId, threadTitle)
    }
  }, [appendMessage, inputValue, isStreaming, nameThread, runRequest])

  const continueAfterSandboxBinding = useCallback(async () => {
    if (!sandboxRequirement || !sandboxId || sandboxBindingStatus !== 'bound' || isStreaming) {
      return
    }
    setSandboxRequirement(undefined)
    appendMessage('system', `已绑定沙箱 ${sandboxId}，继续执行当前任务。`, 'success')
    await runRequest({
      event: 'sandbox_bound',
      message: '沙箱已绑定，继续执行中断前的任务',
      workflow: workflowRef.current,
    })
  }, [
    appendMessage,
    isStreaming,
    runRequest,
    sandboxBindingStatus,
    sandboxId,
    sandboxRequirement,
  ])

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
        return `${question.question}：${values.join('、') || '未填写'}`
      })
      .join('\n')
    setConfirmedClarifications((current) => [
      ...current,
      {
        clarification,
        answers,
        timestamp: Date.now(),
      },
    ])
    setClarification(undefined)
    setIsComplete(false)
    await runRequest({
      event: 'user_message',
      message,
      workflow: workflowRef.current,
    })
  }, [clarification, isStreaming, runRequest])

  const confirmPlan = useCallback(async () => {
    if (!plan || isStreaming) {
      return
    }
    setIsComplete(false)
    setPlanConfirmed(true)
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
    setPlanTimestamp(undefined)
    setPlanConfirmed(false)
    setClarification(undefined)
    setSandboxRequirement(undefined)
    setToolActivities([])
    setRunStatusText('')
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
    confirmedClarifications,
    closeHistoryDrawer: history.closeHistoryDrawer,
    confirmPlan,
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
    planConfirmed,
    planTimestamp,
    renameThread: history.renameThread,
    sendMessage,
    sandboxRequirement,
    selectThread: history.selectThread,
    setInputValue,
    stopStreaming,
    submitClarification,
    continueAfterSandboxBinding,
    resetConversation,
    threadId,
    toolActivities,
    threads: history.threads,
    threadsLoading: history.threadsLoading,
    runStatusText,
    previewWorkflow: activePreviewWorkflow,
  }
}

function mergeGeneratedGraph(
  current: WorkflowDocument,
  result: WorkflowGraphResult,
): WorkflowDocument {
  const previousById = new Map(current.nodes.map((node) => [node.id, node]))
  const edges = result.graph.edges.map((edge, index) => ({
    ...edge,
    id: edge.id || `${edge.source}-${edge.target}-${index + 1}`,
  }))
  const levels = buildNodeLevels(result.graph.nodes, edges)
  const rowsByLevel = new Map<number, number>()
  const nodes = result.graph.nodes.map((node) => {
    const level = levels.get(node.id) ?? 0
    const row = rowsByLevel.get(level) ?? 0
    rowsByLevel.set(level, row + 1)
    return completeNodePosition(
      node,
      previousById.get(node.id),
      { x: 80 + level * 280, y: 120 + row * 180 },
    )
  })
  return {
    ...current,
    nodes,
    edges,
  }
}

function completeNodePosition(
  node: WorkflowGraphNode,
  previous: WorkflowNode | undefined,
  fallback: WorkflowNode['position'],
): WorkflowNode {
  const position = isPosition(node.position)
    ? node.position
    : previous?.position ?? fallback
  const previousBodyById = new Map(
    (previous?.config.loopBodyNodes ?? []).map((bodyNode) => [bodyNode.id, bodyNode]),
  )
  const loopBodyNodes = (node.config.loopBodyNodes ?? []).map((bodyNode, index) => (
    completeNodePosition(
      bodyNode,
      previousBodyById.get(bodyNode.id),
      { x: 48 + index * 240, y: 96 },
    )
  ))
  return {
    ...node,
    position,
    status: node.status ?? previous?.status ?? 'idle',
    config: {
      ...node.config,
      ...(node.type === 'loop' ? { loopBodyNodes } : {}),
    },
  }
}

function buildNodeLevels(
  nodes: WorkflowGraphNode[],
  edges: WorkflowEdge[],
): Map<string, number> {
  const levels = new Map(nodes.map((node) => [node.id, 0]))
  for (let pass = 0; pass < nodes.length; pass += 1) {
    let changed = false
    edges.forEach((edge) => {
      const sourceLevel = levels.get(edge.source)
      const targetLevel = levels.get(edge.target)
      if (sourceLevel === undefined || targetLevel === undefined) {
        return
      }
      const nextLevel = Math.min(sourceLevel + 1, nodes.length)
      if (nextLevel > targetLevel) {
        levels.set(edge.target, nextLevel)
        changed = true
      }
    })
    if (!changed) {
      break
    }
  }
  return levels
}

function isPosition(
  position: WorkflowNode['position'] | undefined,
): position is WorkflowNode['position'] {
  return Boolean(
    position
    && Number.isFinite(position.x)
    && Number.isFinite(position.y),
  )
}

function summarizePreviewGraphUpdate(
  previous: WorkflowDocument,
  next: WorkflowDocument,
): WorkflowPreviewGraphSummary {
  const previousNodes = flattenNodesForSummary(previous.nodes)
  const nextNodes = flattenNodesForSummary(next.nodes)
  const previousNodeById = new Map(previousNodes.map((node) => [node.id, node]))
  const nextNodeById = new Map(nextNodes.map((node) => [node.id, node]))
  const previousEdgeByKey = new Map(previous.edges.map((edge) => [edgeKey(edge), edge]))
  const nextEdgeByKey = new Map(next.edges.map((edge) => [edgeKey(edge), edge]))

  const addedNodes = nextNodes
    .filter((node) => !previousNodeById.has(node.id))
    .map(toNodeChange)
  const updatedNodes = nextNodes
    .filter((node) => {
      const previousNode = previousNodeById.get(node.id)
      return previousNode ? nodeSummarySignature(previousNode) !== nodeSummarySignature(node) : false
    })
    .map(toNodeChange)
  const removedNodes = previousNodes
    .filter((node) => !nextNodeById.has(node.id))
    .map(toNodeChange)
  const addedEdges = next.edges
    .filter((edge) => !previousEdgeByKey.has(edgeKey(edge)))
    .map((edge) => toEdgeChange(edge, nextNodeById))
  const removedEdges = previous.edges
    .filter((edge) => !nextEdgeByKey.has(edgeKey(edge)))
    .map((edge) => toEdgeChange(edge, previousNodeById))

  return {
    syncIndex: 0,
    nodeCount: nextNodes.length,
    edgeCount: next.edges.length,
    nodeChangeCount: addedNodes.length + updatedNodes.length + removedNodes.length,
    edgeChangeCount: addedEdges.length + removedEdges.length,
    addedNodes,
    updatedNodes,
    removedNodes,
    addedEdges,
    removedEdges,
    positionedNodeCount: nextNodes.filter((node) => isPosition(node.position)).length,
  }
}

function withPreviewGraphSyncIndex(
  summary: WorkflowPreviewGraphSummary,
  activities: WorkflowToolActivity[],
): WorkflowPreviewGraphSummary {
  const previousSyncIndex = [...activities].reverse().find((activity) => (
    activity.toolName === 'frontend.apply_preview_graph'
    && activity.previewGraphSummary
  ))?.previewGraphSummary?.syncIndex ?? 0
  return {
    ...summary,
    syncIndex: previousSyncIndex + 1,
  }
}

function formatPreviewGraphUpdateDetail(summary: WorkflowPreviewGraphSummary) {
  const parts = [
    `第 ${summary.syncIndex} 次同步，画布现有 ${summary.nodeCount} 个节点、${summary.edgeCount} 条连线`,
  ]
  if (summary.addedNodes.length) {
    parts.push(`新增 ${summary.addedNodes.length} 个节点`)
  }
  if (summary.updatedNodes.length) {
    parts.push(`更新 ${summary.updatedNodes.length} 个节点`)
  }
  if (summary.removedNodes.length) {
    parts.push(`移除 ${summary.removedNodes.length} 个旧节点`)
  }
  if (summary.addedEdges.length || summary.removedEdges.length) {
    parts.push(`连线 +${summary.addedEdges.length} / -${summary.removedEdges.length}`)
  }
  return parts.join('；')
}

function flattenNodesForSummary(nodes: WorkflowNode[]): WorkflowNode[] {
  return nodes.flatMap((node) => [
    node,
    ...flattenNodesForSummary(node.config.loopBodyNodes ?? []),
  ])
}

function toNodeChange(node: WorkflowNode) {
  return {
    id: node.id,
    title: node.title || node.id,
    type: node.type,
  }
}

function toEdgeChange(
  edge: WorkflowEdge,
  nodesById: Map<string, WorkflowNode>,
) {
  return {
    id: edge.id || edgeKey(edge),
    sourceTitle: nodesById.get(edge.source)?.title || edge.source,
    targetTitle: nodesById.get(edge.target)?.title || edge.target,
  }
}

function edgeKey(edge: WorkflowEdge) {
  return [
    edge.source,
    edge.target,
    edge.sourcePortID ?? '',
    edge.targetPortID ?? '',
  ].join('::')
}

function nodeSummarySignature(node: WorkflowNode) {
  return JSON.stringify({
    title: node.title,
    type: node.type,
    description: node.description,
    inputs: node.inputs,
    outputs: node.outputs,
    config: node.config,
  })
}

function normalizeToolActivity(data: Record<string, unknown>): WorkflowToolActivity {
  const toolName = nonEmptyString(data.toolName) ?? 'unknown_tool'
  const status = isToolActivityStatus(data.status) ? data.status : 'running'
  return {
    id: createId('system'),
    toolName,
    label: nonEmptyString(data.label) ?? '执行工作流工具',
    category: nonEmptyString(data.category) ?? 'tool',
    actor: isToolActivityActor(data.actor) ? data.actor : 'system',
    actorLabel: nonEmptyString(data.actorLabel) ?? '系统',
    kind: isToolActivityKind(data.kind) ? data.kind : 'tool',
    groupId: nonEmptyString(data.groupId) ?? 'system',
    parentId: nonEmptyString(data.parentId),
    status,
    detail: nonEmptyString(data.detail),
    capabilities: Array.isArray(data.capabilities)
      ? data.capabilities.filter((item): item is string => typeof item === 'string')
      : [],
    timestamp: Date.now(),
  }
}

function normalizeModelOutputActivity(
  data: Record<string, unknown>,
): WorkflowToolActivity {
  const actor = data.actor === 'graph-builder' ? 'graph-builder' : 'main-agent'
  const outputId = nonEmptyString(data.outputId)
  return {
    id: outputId ? `model-${outputId}` : createId('model'),
    toolName: 'model_output',
    label: actor === 'graph-builder' ? '画布生成器输出' : '工作流助手输出',
    category: 'model',
    actor,
    actorLabel: nonEmptyString(data.actorLabel)
      ?? (actor === 'graph-builder' ? '画布生成器' : '工作流助手'),
    kind: 'model',
    groupId: actor,
    status: 'running',
    modelOutput: typeof data.content === 'string' ? data.content : undefined,
    modelOutputId: outputId,
    capabilities: [],
    timestamp: Date.now(),
  }
}

function normalizeModelOutputDelta(
  data: unknown,
): WorkflowToolActivity | undefined {
  if (!Array.isArray(data) || data.length < 1 || !isRecord(data[0])) {
    return undefined
  }
  const message = data[0]
  const metadata = isRecord(data[1]) ? data[1] : {}
  const tags = Array.isArray(metadata.tags)
    ? metadata.tags.filter((item: unknown): item is string => typeof item === 'string')
    : []
  if (
    tags.some((tag) => tag.startsWith('middleware:summarize'))
    || (message.type !== 'AIMessageChunk' && message.type !== 'ai')
  ) {
    return undefined
  }

  const content = visibleModelDeltaText(message.content)
  if (!content) {
    return undefined
  }
  const outputId = nonEmptyString(message.id)
  const isGraphBuilder = (
    message.name === 'workflow-graph-builder'
    || tags.includes('subagent:workflow-graph-builder')
  )
  if (isGraphBuilder) {
    return undefined
  }
  const actor = 'main-agent'
  return {
    id: outputId ? `model-${outputId}` : createId('model-stream'),
    toolName: 'model_output',
    label: '工作流助手输出',
    category: 'model',
    actor,
    actorLabel: '工作流助手',
    kind: 'model',
    groupId: actor,
    status: 'running',
    modelOutput: content,
    modelOutputId: outputId,
    capabilities: [],
    timestamp: Date.now(),
  }
}

function visibleModelDeltaText(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }
  if (!Array.isArray(content)) {
    return ''
  }
  return content
    .flatMap((block) => (
      isRecord(block)
      && (block.type === 'text' || block.type === 'output_text')
      && typeof block.text === 'string'
        ? [block.text]
        : []
    ))
    .join('')
}

function upsertModelOutputActivity(
  activities: WorkflowToolActivity[],
  next: WorkflowToolActivity,
): WorkflowToolActivity[] {
  let matchIndex = next.modelOutputId
    ? activities.findIndex((activity) => (
        activity.kind === 'model'
        && activity.modelOutputId === next.modelOutputId
      ))
    : -1
  if (matchIndex < 0) {
    for (let index = activities.length - 1; index >= 0; index -= 1) {
      const activity = activities[index]
      if (activity.kind === 'model' && activity.actor === next.actor && activity.status === 'running') {
        matchIndex = index
        break
      }
    }
  }
  if (matchIndex < 0) {
    return [...activities, next].slice(-24)
  }

  const current = activities[matchIndex]
  const continuesSameOutput = Boolean(
    next.modelOutputId && current.modelOutputId === next.modelOutputId,
  )
  const separator = continuesSameOutput || !current.modelOutput || !next.modelOutput ? '' : '\n'
  const updated = [...activities]
  updated[matchIndex] = {
    ...current,
    ...next,
    id: current.id,
    timestamp: current.timestamp,
    modelOutput: next.status === 'running'
      ? `${current.modelOutput ?? ''}${separator}${next.modelOutput ?? ''}`.slice(0, 4000)
      : next.modelOutput || current.modelOutput,
  }
  return updated.slice(-24)
}

function createLocalToolActivity(input: {
  toolName: string
  label: string
  category: string
  status: WorkflowToolActivity['status']
  detail?: string
  previewGraphSummary?: WorkflowPreviewGraphSummary
}): WorkflowToolActivity {
  return {
    id: createId('system'),
    toolName: input.toolName,
    label: input.label,
    category: input.category,
    actor: 'frontend',
    actorLabel: '前端画布',
    kind: input.category === 'validation' ? 'validation' : 'canvas',
    groupId: 'frontend',
    status: input.status,
    detail: input.detail,
    previewGraphSummary: input.previewGraphSummary,
    capabilities: ['frontend-canvas'],
    timestamp: Date.now(),
  }
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isToolActivityStatus(value: unknown): value is WorkflowToolActivity['status'] {
  return value === 'running'
    || value === 'completed'
    || value === 'blocked'
    || value === 'failed'
    || value === 'cancelled'
}

function isToolActivityActor(value: unknown): value is WorkflowToolActivity['actor'] {
  return value === 'main-agent' || value === 'graph-builder' || value === 'frontend' || value === 'system'
}

function isToolActivityKind(value: unknown): value is WorkflowToolActivity['kind'] {
  return value === 'tool'
    || value === 'skill'
    || value === 'subagent'
    || value === 'model'
    || value === 'validation'
    || value === 'canvas'
}

function upsertToolActivity(
  activities: WorkflowToolActivity[],
  next: WorkflowToolActivity,
): WorkflowToolActivity[] {
  if (next.toolName === 'frontend.apply_preview_graph') {
    const previousIndex = activities.findIndex(
      (activity) => activity.toolName === next.toolName,
    )
    if (previousIndex >= 0) {
      const updated = [...activities]
      updated[previousIndex] = {
        ...next,
        id: updated[previousIndex].id,
        timestamp: updated[previousIndex].timestamp,
      }
      return updated.slice(-24)
    }
  }

  let runningIndex = -1
  for (let index = activities.length - 1; index >= 0; index -= 1) {
    const item = activities[index]
    if (
      item.toolName === next.toolName
      && item.actor === next.actor
      && item.groupId === next.groupId
      && item.status === 'running'
    ) {
      runningIndex = index
      break
    }
  }
  if (runningIndex >= 0 && next.status !== 'running') {
    const updated = [...activities]
    updated[runningIndex] = {
      ...updated[runningIndex],
      ...next,
      id: updated[runningIndex].id,
      timestamp: updated[runningIndex].timestamp,
    }
    return updated.slice(-24)
  }
  return [...activities, next].slice(-24)
}

function settleRunningActivities(
  activities: WorkflowToolActivity[],
  status: Exclude<WorkflowToolActivity['status'], 'running'>,
): WorkflowToolActivity[] {
  return activities.map((activity) => (
    activity.status === 'running'
      ? {
          ...activity,
          status: status === 'failed' && activity.kind === 'model' ? 'completed' : status,
          detail: status === 'cancelled'
            ? activity.detail
              ? `${activity.detail}；执行已由用户停止`
              : '执行已由用户停止'
            : activity.detail,
        }
      : activity
  ))
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
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
