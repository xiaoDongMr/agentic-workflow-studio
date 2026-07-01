import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import {
  EditorRenderer,
  FreeLayoutEditorProvider,
  type FreeLayoutPluginContext,
  type FreeLayoutProps,
  type WorkflowJSON,
  type WorkflowNodeProps,
} from '@flowgram.ai/free-layout-editor'
import {
  WorkflowDragService,
  WorkflowSelectService,
  type WorkflowLineEntity,
  type WorkflowNodeJSON,
} from '@flowgram.ai/free-layout-core'
import { createContainerNodePlugin } from '@flowgram.ai/free-container-plugin'
import { createFreeNodePanelPlugin } from '@flowgram.ai/free-node-panel-plugin'
import { createFreeSnapPlugin } from '@flowgram.ai/free-snap-plugin'
import { createMinimapPlugin } from '@flowgram.ai/minimap-plugin'
import '@flowgram.ai/free-layout-editor/index.css'

import { defaultRegistries } from '@/features/workflow/editor/workflow-editor.config'
import {
  EditorBottomBar,
  EditorTrialRunPanel,
  FlowgramNodePanel,
  SingleNodeTrialPanel,
} from '@/features/workflow/editor/workflow-editor-components'
import {
  areDebugFieldsEqual,
  createGlobalDebugFields,
  createSingleNodeTrialFields,
  formatInputFieldValue,
} from '@/features/workflow/editor/debug/debug-fields'
import {
  buildDebugPayloadFromCombinedJson,
  buildDebugPayloadFromFields,
  buildPayloadFromFieldEntries,
  safeParseJsonField,
  syncCombinedJsonWithFields,
  type SingleNodeTrialCache,
} from '@/features/workflow/editor/debug/trial-run-payload'
import {
  normalizeSelectorLabelsForNode,
  normalizeWorkflowNodesForRun,
  toSingleNodeTestWorkflow,
} from '@/features/workflow/editor/debug/single-node-workflow'
import { useWorkflowNodeActions } from '@/features/workflow/editor/hooks/use-workflow-node-actions'
import {
  findFlowgramNodeById,
  flattenFlowgramNodes,
  getWorkflowJSONWithLivePositions,
  installNodeDragEndPersistence,
  lockAllLoopChildPositions,
  patchLoopChildDragIsolation,
} from '@/features/workflow/editor/loop-child-drag'
import type {
  AddNodeOptions,
  FlowgramNodeData,
  GlobalDebugFieldValue,
  NodePaletteKey,
  TrialRunNodeExecution,
  WorkflowRuntimeEvent,
} from '@/features/workflow/editor/workflow-editor.types'
import {
  executionFromLoopRuntimeEvent,
  executionFromRuntimeEvent,
  getLoopExecutionIterations,
  isLoopBodyRuntimeEvent,
  readLoopBodyNodeId,
  readLoopNodeId,
} from '@/features/workflow/editor/runtime-execution-adapter'
import {
  fromFlowgramJSON,
  normalizeNodeData,
  toFlowgramJSON,
} from '@/features/workflow/editor/workflow-editor.utils'
import { clearNodeExecutionPanelExpansion } from '@/features/workflow/editor/node-execution-panel-state'
import {
  clearNodeTrialRunExecution,
  createTrialRunId,
  setNodeTrialRunExecution,
  setActiveTrialRunId,
} from '@/features/workflow/editor/node-trial-run-store'
import { FlowgramNodeCard } from '@/features/workflow/editor/workflow-node-card'
import { streamWorkflow } from '@/api/workflow'
import { cn } from '@/lib/utils'
import { useWorkflowStore } from '@/store/workflow-store'
import {
  findWorkflowNodeById,
  flattenWorkflowNodes,
} from '@/features/workflow/utils/workflow-document'
import type { WorkflowEdge, WorkflowNode } from '@/types/workflow'

export interface WorkflowCanvasApi {
  addNode: (key: NodePaletteKey, options?: AddNodeOptions) => void
  updateSelectedNode: (
    partial: Partial<Omit<WorkflowNode, 'config'>> & {
      config?: Partial<WorkflowNode['config']>
    },
  ) => void
}

interface WorkflowEditorProps {
  workflowId: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  selectedNodeId: string
  onSelectNode: (nodeId: string) => void
  onReady?: (api: WorkflowCanvasApi) => void
  className?: string
}

type PlaygroundConfigWithPosition = {
  getPosFromMouseEvent?: (event: MouseEvent | ReactMouseEvent) => { x: number; y: number }
  toFixedPos?: (position: { x: number; y: number }) => { x: number; y: number }
}

function workflowLineKey(line: WorkflowLineEntity) {
  const fromPort = line.info.fromPort ?? ''
  const toPort = line.info.toPort ?? ''
  return `${line.info.from ?? ''}:${String(fromPort)}->${line.info.to ?? ''}:${String(toPort)}`
}

function updateTrialRunLineStyle(line: WorkflowLineEntity, active: boolean) {
  line.updateUIState({
    className: active ? 'aw-trial-run-edge aw-trial-run-edge--active' : undefined,
    flowing: active,
    lockedColor: active ? '#38bdf8' : '',
    strokeWidth: active ? 3 : undefined,
    strokeWidthSelected: active ? 4 : undefined,
  })
}

function trialRunExecutionStateKey(nodeId: string, loopNodeId?: string) {
  return loopNodeId ? `${loopNodeId}::${nodeId}` : nodeId
}

export function WorkflowEditor({
  workflowId,
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
  onReady,
  className,
}: WorkflowEditorProps) {
  const ctxRef = useRef<FreeLayoutPluginContext | null>(null)
  const [initialData] = useState<WorkflowJSON>(() => toFlowgramJSON(nodes, edges))
  const setWorkflowGraph = useWorkflowStore((state) => state.setWorkflowGraph)
  const [trialRunOpen, setTrialRunOpen] = useState(false)
  const [globalDebugFields, setGlobalDebugFields] = useState<GlobalDebugFieldValue[]>([
    {
      name: 'input2',
      type: 'json',
      value: '{\n  "userInput": "我要查询订单进度",\n  "items": ["订单", "物流", "售后"],\n  "message": {\n    "content": "我要查询订单进度"\n  },\n  "session": {\n    "userId": "U20260428",\n    "channel": "app"\n  }\n}',
    },
    {
      name: 'ujsj',
      type: 'string',
      value: 'test string',
    },
  ])
  const [globalDebugJsonMode, setGlobalDebugJsonMode] = useState(false)
  const [globalDebugCombinedJson, setGlobalDebugCombinedJson] = useState(
    '{\n  "input2": {\n    "userInput": "我要查询订单进度",\n    "items": ["订单", "物流", "售后"],\n    "message": {\n      "content": "我要查询订单进度"\n    },\n    "session": {\n      "userId": "U20260428",\n      "channel": "app"\n    }\n  },\n  "ujsj": "test string"\n}',
  )
  const [globalDebugJsonError, setGlobalDebugJsonError] = useState('')
  const [trialRunExecutions, setTrialRunExecutions] = useState<Record<string, TrialRunNodeExecution>>({})
  const [trialRunning, setTrialRunning] = useState(false)
  const [singleNodeTrialOpen, setSingleNodeTrialOpen] = useState(false)
  const [singleNodeTrialNodeId, setSingleNodeTrialNodeId] = useState('')
  const [singleNodeTrialFields, setSingleNodeTrialFields] = useState<GlobalDebugFieldValue[]>([])
  const [singleNodeJsonMode, setSingleNodeJsonMode] = useState(false)
  const [singleNodeCombinedJson, setSingleNodeCombinedJson] = useState('{}')
  const [singleNodeJsonError, setSingleNodeJsonError] = useState('')
  const singleNodeTrialFieldsRef = useRef<GlobalDebugFieldValue[]>([])
  const singleNodeCombinedJsonRef = useRef('{}')
  const runTimerIdsRef = useRef<number[]>([])
  const runAbortControllerRef = useRef<AbortController | null>(null)
  const singleNodeTrialCacheRef = useRef<Record<string, SingleNodeTrialCache>>({})
  const activeTrialRunIdRef = useRef(createTrialRunId('idle'))
  const trialRunExecutionsRef = useRef<Record<string, TrialRunNodeExecution>>({})
  const pendingTrialRunExecutionsRef = useRef<Record<string, TrialRunNodeExecution>>({})
  const trialRunFlushFrameRef = useRef<number | null>(null)
  const completedGlobalTrialNodeIdsRef = useRef<Set<string>>(new Set())
  const activeTrialRunEdgeKeysRef = useRef<Set<string>>(new Set())

  const singleNodeTrialNode = useMemo(() => {
    const targetNode = findWorkflowNodeById(nodes, singleNodeTrialNodeId)
    return targetNode ? normalizeSelectorLabelsForNode(targetNode, flattenWorkflowNodes(nodes)) : undefined
  }, [nodes, singleNodeTrialNodeId])

  const clearTrialRunTimers = useCallback(() => {
    runTimerIdsRef.current.forEach((timerId) => window.clearTimeout(timerId))
    runTimerIdsRef.current = []
  }, [])

  const abortTrialRunStream = useCallback(() => {
    runAbortControllerRef.current?.abort()
    runAbortControllerRef.current = null
  }, [])

  const saveSingleNodeTrialCache = useCallback((nodeId: string, cache: SingleNodeTrialCache) => {
    singleNodeTrialCacheRef.current = {
      ...singleNodeTrialCacheRef.current,
      [nodeId]: cache,
    }
  }, [])

  useEffect(() => {
    singleNodeTrialFieldsRef.current = singleNodeTrialFields
  }, [singleNodeTrialFields])

  useEffect(() => {
    singleNodeCombinedJsonRef.current = singleNodeCombinedJson
  }, [singleNodeCombinedJson])

  const replaceTrialRunExecutions = useCallback((next: Record<string, TrialRunNodeExecution>) => {
    trialRunExecutionsRef.current = next
    pendingTrialRunExecutionsRef.current = {}
    if (trialRunFlushFrameRef.current !== null) {
      window.cancelAnimationFrame(trialRunFlushFrameRef.current)
      trialRunFlushFrameRef.current = null
    }
    setTrialRunExecutions(next)
  }, [])

  const enqueueTrialRunExecution = useCallback((stateKey: string, execution: TrialRunNodeExecution) => {
    trialRunExecutionsRef.current = {
      ...trialRunExecutionsRef.current,
      [stateKey]: execution,
    }
    pendingTrialRunExecutionsRef.current = {
      ...pendingTrialRunExecutionsRef.current,
      [stateKey]: execution,
    }
    if (trialRunFlushFrameRef.current !== null) {
      return
    }
    trialRunFlushFrameRef.current = window.requestAnimationFrame(() => {
      trialRunFlushFrameRef.current = null
      const pending = pendingTrialRunExecutionsRef.current
      pendingTrialRunExecutionsRef.current = {}
      if (Object.keys(pending).length === 0) {
        return
      }
      setTrialRunExecutions((prev) => ({
        ...prev,
        ...pending,
      }))
    })
  }, [])

  const syncNodeTrialRunExecution = useCallback(
    (nodeId: string, execution?: TrialRunNodeExecution, loopNodeId?: string) => {
      const scopedLoopNodeId = loopNodeId ?? execution?.loopNodeId
      if (execution) {
        setNodeTrialRunExecution({
          runId: activeTrialRunIdRef.current,
          nodeId,
          loopNodeId: scopedLoopNodeId,
        }, execution)
      } else {
        clearNodeTrialRunExecution({
          runId: activeTrialRunIdRef.current,
          nodeId,
          loopNodeId: scopedLoopNodeId,
        })
      }

      const ctx = ctxRef.current
      if (!ctx) {
        return
      }

      const targetNode = findFlowgramNodeById(ctx, nodeId)
      if (!targetNode) {
        return
      }

      const nodeJson = targetNode.toJSON() as WorkflowNodeJSON & { data?: Partial<FlowgramNodeData> }
      const currentData = normalizeNodeData(nodeJson.data, nodeJson.type as WorkflowNode['type'])
      const nextData: FlowgramNodeData = {
        ...currentData,
        trialRunExecution: execution,
      }

      ;(targetNode as WorkflowNodeJSON & { updateExtInfo?: (data: FlowgramNodeData, fullUpdate?: boolean) => void }).updateExtInfo?.(
        nextData,
        true,
      )
    },
    [],
  )

  const applyTrialRunEdgeStyles = useCallback(() => {
    const ctx = ctxRef.current
    if (!ctx) {
      return
    }

    ctx.document.linesManager.getAllLines().forEach((line) => {
      updateTrialRunLineStyle(line, activeTrialRunEdgeKeysRef.current.has(workflowLineKey(line)))
    })
  }, [])

  const clearTrialRunEdgeStyles = useCallback(() => {
    const ctx = ctxRef.current
    activeTrialRunEdgeKeysRef.current.clear()
    completedGlobalTrialNodeIdsRef.current.clear()

    if (!ctx) {
      return
    }

    ctx.document.linesManager.getAllLines().forEach((line) => {
      updateTrialRunLineStyle(line, false)
    })
  }, [])

  const markIncomingTrialRunEdges = useCallback((nodeId: string) => {
    const ctx = ctxRef.current
    if (!ctx) {
      return
    }

    ctx.document.linesManager.getAllLines().forEach((line) => {
      const sourceNodeId = line.info.from ? String(line.info.from) : ''
      const targetNodeId = line.info.to ? String(line.info.to) : ''
      if (targetNodeId === nodeId && completedGlobalTrialNodeIdsRef.current.has(sourceNodeId)) {
        activeTrialRunEdgeKeysRef.current.add(workflowLineKey(line))
      }
    })
    applyTrialRunEdgeStyles()
  }, [applyTrialRunEdgeStyles])

  const applyGlobalTrialRunEdgeEvent = useCallback((event: WorkflowRuntimeEvent) => {
    if (!event.nodeId) {
      return
    }

    if (event.type === 'node_started') {
      markIncomingTrialRunEdges(event.nodeId)
    }
    if (event.type === 'node_completed') {
      completedGlobalTrialNodeIdsRef.current.add(event.nodeId)
    }
  }, [markIncomingTrialRunEdges])

  const applyRuntimeEventToNode = useCallback(
    (event: WorkflowRuntimeEvent, nodeIdOverride?: string, nodeOverride?: WorkflowNode) => {
      const isLoopBodyEvent = isLoopBodyRuntimeEvent(event)
      const nodeId = isLoopBodyEvent ? (readLoopBodyNodeId(event) || event.nodeId) : (nodeIdOverride || event.nodeId)
      if (!nodeId) {
        return
      }
      const loopNodeId = isLoopBodyEvent ? readLoopNodeId(event) : undefined
      const stateKey = trialRunExecutionStateKey(nodeId, loopNodeId)
      const fallbackNode = isLoopBodyEvent ? findWorkflowNodeById(nodes, nodeId) : (nodeOverride ?? findWorkflowNodeById(nodes, nodeId))
      const previous = trialRunExecutionsRef.current[stateKey]
      const execution = isLoopBodyEvent
        ? executionFromLoopRuntimeEvent(event, previous, fallbackNode)
        : executionFromRuntimeEvent(event, previous, fallbackNode)
      syncNodeTrialRunExecution(nodeId, execution, loopNodeId)
      enqueueTrialRunExecution(stateKey, execution)
      if (loopNodeId && execution.status === 'error') {
        const loopStateKey = trialRunExecutionStateKey(loopNodeId)
        const loopNode = findWorkflowNodeById(nodes, loopNodeId)
        const previousLoopExecution = trialRunExecutionsRef.current[loopStateKey]
        const failedIteration = getLoopExecutionIterations(execution).find((item) => item.status === 'error')
        const failureSummary = failedIteration
          ? `第 ${failedIteration.iterationIndex + 1} 轮 / ${failedIteration.nodeTitle} 失败`
          : `${execution.nodeTitle} 执行失败`
        const loopExecution: TrialRunNodeExecution = {
          nodeId: loopNodeId,
          nodeTitle: previousLoopExecution?.nodeTitle ?? loopNode?.title ?? '循环节点',
          log: failureSummary,
          input: previousLoopExecution?.input ?? '{}',
          output: previousLoopExecution?.output ?? '{}',
          durationMs: previousLoopExecution?.durationMs ?? 0,
          status: 'error',
          error: execution.error,
          timeline: previousLoopExecution?.timeline,
          summaryInput: '循环体执行异常',
          summaryOutput: failureSummary,
        }
        syncNodeTrialRunExecution(loopNodeId, loopExecution)
        enqueueTrialRunExecution(loopStateKey, loopExecution)
      }
    },
    [enqueueTrialRunExecution, nodes, syncNodeTrialRunExecution],
  )

  const clearAllNodeTrialRunExecutions = useCallback(() => {
    clearNodeTrialRunExecution()
    const ctx = ctxRef.current
    if (!ctx) {
      return
    }

    flattenFlowgramNodes(ctx.document.getAllNodes()).forEach((node) => {
      const nodeJson = node.toJSON() as WorkflowNodeJSON & { data?: Partial<FlowgramNodeData> }
      const currentData = normalizeNodeData(nodeJson.data, nodeJson.type as WorkflowNode['type'])
      if (!currentData.trialRunExecution) {
        return
      }

      ;(node as WorkflowNodeJSON & { updateExtInfo?: (data: FlowgramNodeData, fullUpdate?: boolean) => void }).updateExtInfo?.(
        {
          ...currentData,
          trialRunExecution: undefined,
        },
        true,
      )
    })
  }, [])

  const handleEditorRef = useCallback((ctx: FreeLayoutPluginContext | null) => {
    ctxRef.current = ctx
  }, [])

  const openSingleNodeTrial = useCallback((nodeId: string) => {
    const ctx = ctxRef.current
    const [latestNodes] = ctx ? fromFlowgramJSON(ctx.document.toJSON()) : [nodes]
    const allKnownNodes = flattenWorkflowNodes(latestNodes)
    const targetNode = findWorkflowNodeById(latestNodes, nodeId)
    if (!targetNode) {
      return
    }

    const cached = singleNodeTrialCacheRef.current[nodeId]
    const fallbackPayload = globalDebugJsonMode
      ? buildDebugPayloadFromCombinedJson(globalDebugCombinedJson)
      : buildPayloadFromFieldEntries(globalDebugFields)
    const fields = createSingleNodeTrialFields(
      targetNode,
      cached?.fields ? buildPayloadFromFieldEntries(cached.fields) : fallbackPayload,
      allKnownNodes,
    )
    const combinedJson = cached?.combinedJson
      ? syncCombinedJsonWithFields(cached.combinedJson, fields)
      : JSON.stringify(buildPayloadFromFieldEntries(fields), null, 2)

    clearTrialRunTimers()
    abortTrialRunStream()
    clearTrialRunEdgeStyles()
    onSelectNode('')
    setTrialRunOpen(false)
    setSingleNodeTrialNodeId(nodeId)
    setSingleNodeTrialFields(fields)
    setSingleNodeCombinedJson(combinedJson)
    setSingleNodeJsonMode(cached?.jsonMode ?? false)
    setSingleNodeJsonError('')
    const nextExecutions = { ...trialRunExecutionsRef.current }
    delete nextExecutions[nodeId]
    replaceTrialRunExecutions(nextExecutions)
    clearNodeTrialRunExecution({ runId: activeTrialRunIdRef.current, nodeId })
    clearNodeExecutionPanelExpansion(nodeId)
    syncNodeTrialRunExecution(nodeId, undefined)
    setSingleNodeTrialOpen(true)
  }, [
    abortTrialRunStream,
    clearTrialRunEdgeStyles,
    clearTrialRunTimers,
    globalDebugCombinedJson,
    globalDebugFields,
    globalDebugJsonMode,
    nodes,
    onSelectNode,
    replaceTrialRunExecutions,
    syncNodeTrialRunExecution,
  ])

  useEffect(() => {
    if (!singleNodeTrialOpen || !singleNodeTrialNodeId) {
      return
    }

    const allKnownNodes = flattenWorkflowNodes(nodes)
    const targetNode = findWorkflowNodeById(nodes, singleNodeTrialNodeId)
    if (!targetNode) {
      return
    }

    const currentFields = singleNodeTrialFieldsRef.current
    const nextFields = createSingleNodeTrialFields(
      targetNode,
      buildPayloadFromFieldEntries(currentFields),
      allKnownNodes,
    )
    if (areDebugFieldsEqual(currentFields, nextFields)) {
      return
    }

    const nextCombinedJson = singleNodeJsonMode
      ? syncCombinedJsonWithFields(singleNodeCombinedJsonRef.current, nextFields)
      : JSON.stringify(buildPayloadFromFieldEntries(nextFields), null, 2)

    setSingleNodeTrialFields(nextFields)
    setSingleNodeCombinedJson(nextCombinedJson)
    saveSingleNodeTrialCache(singleNodeTrialNodeId, {
      fields: nextFields,
      jsonMode: singleNodeJsonMode,
      combinedJson: nextCombinedJson,
    })
    setSingleNodeJsonError('')
  }, [
    nodes,
    saveSingleNodeTrialCache,
    singleNodeJsonMode,
    singleNodeTrialNodeId,
    singleNodeTrialOpen,
  ])

  const runSingleNode = useCallback(async (nodeId: string, payloadOverride?: Record<string, unknown>) => {
    const runId = createTrialRunId('single')
    activeTrialRunIdRef.current = runId
    setActiveTrialRunId(runId)
    clearTrialRunTimers()
    abortTrialRunStream()
    setTrialRunOpen(false)
    replaceTrialRunExecutions({})
    clearNodeTrialRunExecution()
    clearNodeExecutionPanelExpansion()
    clearTrialRunEdgeStyles()
    clearAllNodeTrialRunExecutions()

    const ctx = ctxRef.current
    const [latestNodes] = ctx ? fromFlowgramJSON(ctx.document.toJSON()) : [nodes]
    const allKnownNodes = flattenWorkflowNodes(latestNodes)
    const targetNode = findWorkflowNodeById(latestNodes, nodeId)
    if (!targetNode) {
      return
    }

    const runningExecution: TrialRunNodeExecution = {
      nodeId,
      nodeTitle: targetNode.title,
      log: `${targetNode.title} 单节点测试运行中`,
      input: '{}',
      output: '{}',
      durationMs: 0,
      status: 'running',
      summaryInput: '准备执行',
      summaryOutput: '等待输出',
    }

    replaceTrialRunExecutions({ [nodeId]: runningExecution })
    syncNodeTrialRunExecution(nodeId, runningExecution)

    try {
      const abortController = new AbortController()
      runAbortControllerRef.current = abortController
      const payload = payloadOverride ?? (globalDebugJsonMode
        ? buildDebugPayloadFromCombinedJson(globalDebugCombinedJson)
        : buildPayloadFromFieldEntries(globalDebugFields))

      setTrialRunning(true)
      const executions = await streamWorkflow(toSingleNodeTestWorkflow(targetNode, allKnownNodes, workflowId), payload, {
        signal: abortController.signal,
        onWorkflowEvent: (event) => {
          applyRuntimeEventToNode(event, nodeId, targetNode)
        },
        onStep: (execution) => {
          const previous = trialRunExecutionsRef.current[nodeId]
          const mergedExecution = {
            ...execution,
            timeline: [...(previous?.timeline ?? []), ...(execution.timeline ?? [])].slice(-80),
            degraded: previous?.degraded || execution.degraded,
            tokenUsage: execution.tokenUsage ?? previous?.tokenUsage,
          }
          syncNodeTrialRunExecution(nodeId, mergedExecution)
          enqueueTrialRunExecution(nodeId, mergedExecution)
        },
      })
      const fallbackExecution = executions.at(-1)
      if (fallbackExecution) {
        const previous = trialRunExecutionsRef.current[nodeId]
        const mergedExecution = {
          ...fallbackExecution,
          timeline: [...(previous?.timeline ?? []), ...(fallbackExecution.timeline ?? [])].slice(-80),
          degraded: previous?.degraded || fallbackExecution.degraded,
          tokenUsage: fallbackExecution.tokenUsage ?? previous?.tokenUsage,
        }
        syncNodeTrialRunExecution(nodeId, mergedExecution)
        enqueueTrialRunExecution(nodeId, mergedExecution)
      }
      if (runAbortControllerRef.current === abortController) {
        runAbortControllerRef.current = null
      }
      setTrialRunning(false)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }

      const failedExecution: TrialRunNodeExecution = {
        ...runningExecution,
        log: error instanceof Error ? error.message : '单节点测试失败',
        status: 'error',
        error: error instanceof Error ? error.message : '单节点测试失败',
        summaryOutput: '运行失败',
      }
      setTrialRunning(false)
      replaceTrialRunExecutions({ [nodeId]: failedExecution })
      syncNodeTrialRunExecution(nodeId, failedExecution)
    }
  }, [
    abortTrialRunStream,
    applyRuntimeEventToNode,
    clearAllNodeTrialRunExecutions,
    clearTrialRunEdgeStyles,
    clearTrialRunTimers,
    enqueueTrialRunExecution,
    globalDebugCombinedJson,
    globalDebugFields,
    globalDebugJsonMode,
    nodes,
    replaceTrialRunExecutions,
    syncNodeTrialRunExecution,
    workflowId,
  ])

  const closeDebugPanels = useCallback(() => {
    clearTrialRunTimers()
    abortTrialRunStream()
    clearTrialRunEdgeStyles()
    setTrialRunning(false)
    setTrialRunOpen(false)
    setSingleNodeTrialOpen(false)
  }, [abortTrialRunStream, clearTrialRunEdgeStyles, clearTrialRunTimers])

  const selectNodeForConfig = useCallback(
    (nodeId: string) => {
      if (nodeId) {
        closeDebugPanels()
      }
      onSelectNode(nodeId)
    },
    [closeDebugPanels, onSelectNode],
  )

  const {
    addNode,
    copyNode,
    deleteNode,
    openNodePanel,
    openQuickAddPanel,
    updateNodeConfigById,
    updateSelectedNode,
  } = useWorkflowNodeActions({
    ctxRef,
    nodes,
    edges,
    selectedNodeId,
    onSelectNode,
    setWorkflowGraph,
    onBeforeQuickAdd: () => {
      clearTrialRunTimers()
      setTrialRunning(false)
      setTrialRunOpen(false)
      setSingleNodeTrialOpen(false)
      replaceTrialRunExecutions({})
      clearNodeTrialRunExecution()
      clearNodeExecutionPanelExpansion()
      clearTrialRunEdgeStyles()
    },
    onNodeDeleted: (nodeId) => {
      const nextExecutions = { ...trialRunExecutionsRef.current }
      delete nextExecutions[nodeId]
      replaceTrialRunExecutions(nextExecutions)
      clearNodeTrialRunExecution({ runId: activeTrialRunIdRef.current, nodeId })
      clearNodeExecutionPanelExpansion(nodeId)
      clearTrialRunEdgeStyles()
    },
  })

  const getPlaygroundPositionConfig = useCallback(() => (
    ctxRef.current?.playground as { config?: PlaygroundConfigWithPosition } | undefined
  )?.config, [])

  const resetLineFromMouse = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const ctx = ctxRef.current
    if (!ctx || event.button !== 0) {
      return false
    }

    const target = event.target as HTMLElement
    if (
      target.closest('.aw-flow-node') ||
        target.closest('.aw-flow-port') ||
      target.closest('.aw-flow-ignore-deselect') ||
      target.closest('.gedit-minimap-layer')
    ) {
      return false
    }

    const playgroundConfig = getPlaygroundPositionConfig()
    const getPosFromMouseEvent = playgroundConfig?.getPosFromMouseEvent?.bind(playgroundConfig)
    if (!getPosFromMouseEvent) {
      return false
    }

    const position = getPosFromMouseEvent(event.nativeEvent)
    const line = ctx.document.linesManager.getCloseInLineFromMousePos(position, 14)
    if (!line || !line.from || !line.to || line.isDrawing || line.isHidden || line.disabled) {
      return false
    }

    event.preventDefault()
    event.stopPropagation()
    ctx.get(WorkflowSelectService).select(line)
    void ctx.get(WorkflowDragService).resetLine(line, event.nativeEvent)
    return true
  }, [getPlaygroundPositionConfig])

  const editorProps = useMemo<FreeLayoutProps>(
    () => ({
      background: false,
      readonly: false,
      initialData,
      nodeRegistries: defaultRegistries,
      materials: {
        renderDefaultNode: (props: WorkflowNodeProps) => (
          <FlowgramNodeCard
            node={props.node}
            onSelectNode={selectNodeForConfig}
            selectedNodeId={selectedNodeId}
            trialRunExecution={trialRunExecutions[String(props.node.id)]}
            autoExpandExecutionDetails={singleNodeTrialOpen && singleNodeTrialNodeId === String(props.node.id)}
            nodeActionRunning={trialRunning}
            onRunNode={openSingleNodeTrial}
            onCopyNode={copyNode}
            onDeleteNode={deleteNode}
            onToggleQuickAdd={openQuickAddPanel}
            onAddLoopChild={(loopNodeId) => {
              void openNodePanel({
                parentNodeId: loopNodeId,
                loopSourceNodeId: loopNodeId,
                selectCreated: true,
              })
            }}
          />
        ),
      },
      history: {
        enable: true,
        enableChangeNode: true,
      },
      plugins: () => [
        createContainerNodePlugin({}),
        createFreeSnapPlugin({
          edgeColor: '#3458c5',
          alignColor: '#4f7cff',
          edgeLineWidth: 1,
          alignLineWidth: 1,
          alignCrossWidth: 8,
        }),
        createMinimapPlugin({
          panelStyles: {
            right: 16,
            bottom: 96,
            borderRadius: 18,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(2, 8, 23, 0.9)',
            boxShadow: '0 20px 40px rgba(2, 6, 23, 0.32)',
            backdropFilter: 'blur(16px)',
          },
          inactiveStyle: {
            opacity: 0.7,
            scale: 0.96,
          },
          canvasStyle: {
            canvasWidth: 196,
            canvasHeight: 124,
            canvasPadding: 14,
            canvasBackground: '#020617',
            canvasBorderRadius: 16,
            viewportBackground: 'rgba(59, 130, 246, 0.08)',
            viewportBorderColor: 'rgba(96, 165, 250, 0.72)',
            viewportBorderWidth: 1,
            nodeColor: 'rgba(148, 163, 184, 0.5)',
            nodeBorderRadius: 8,
            overlayColor: 'rgba(2, 6, 23, 0.38)',
          },
        }),
        createFreeNodePanelPlugin({
          renderer: FlowgramNodePanel,
        }),
      ],
      canDropToNode: (_ctx, params) => {
        if (!params.dropNode) {
          return false
        }
        const dropJson = params.dropNode.toJSON() as WorkflowNodeJSON
        if (String(dropJson.type) !== 'loop') {
          return false
        }
        const dragType = params.dragNode
          ? String((params.dragNode.toJSON() as WorkflowNodeJSON).type)
          : String(params.dragNodeType ?? params.dropNodeType ?? '')
        return dragType !== 'loop' && dragType !== 'start' && dragType !== 'loop-start' && dragType !== 'loop-end'
      },
      lineColor: {
        default: 'rgba(100, 116, 139, 0.42)',
        hovered: '#60a5fa',
        selected: '#93c5fd',
        flowing: '#38bdf8',
        error: '#fb7185',
        drawing: '#60a5fa',
        hidden: 'transparent',
      },
      onContentChange: (ctx) => {
        lockAllLoopChildPositions(ctx)
        const liveJson = getWorkflowJSONWithLivePositions(ctx)
        const nextGraph = fromFlowgramJSON(liveJson)
        setWorkflowGraph(...nextGraph)
      },
      onDragLineEnd: async () => {
        const ctx = ctxRef.current
        if (ctx) {
          lockAllLoopChildPositions(ctx)
          const liveJson = getWorkflowJSONWithLivePositions(ctx)
          const nextGraph = fromFlowgramJSON(liveJson)
          setWorkflowGraph(...nextGraph)
        }
      },
      onAllLayersRendered: (ctx) => {
        patchLoopChildDragIsolation(ctx)
        installNodeDragEndPersistence(ctx, setWorkflowGraph)
        ctx.tools.fitView(false)
      },
    }),
    [
      clearTrialRunTimers,
      copyNode,
      deleteNode,
      initialData,
      nodes,
      openNodePanel,
      openQuickAddPanel,
      openSingleNodeTrial,
      selectNodeForConfig,
      selectedNodeId,
      setWorkflowGraph,
      singleNodeTrialNodeId,
      singleNodeTrialOpen,
      trialRunExecutions,
      trialRunning,
      updateNodeConfigById,
    ],
  )

  useEffect(() => {
    if (!onReady) {
      return
    }

    onReady({
      addNode,
      updateSelectedNode,
    })
  }, [addNode, onReady, updateSelectedNode])

  useEffect(() => {
    return () => {
      clearTrialRunTimers()
      abortTrialRunStream()
      clearTrialRunEdgeStyles()
      if (trialRunFlushFrameRef.current !== null) {
        window.cancelAnimationFrame(trialRunFlushFrameRef.current)
        trialRunFlushFrameRef.current = null
      }
    }
  }, [abortTrialRunStream, clearTrialRunEdgeStyles, clearTrialRunTimers])

  const startTrialRun = useCallback(async () => {
    const runId = createTrialRunId('global')
    activeTrialRunIdRef.current = runId
    setActiveTrialRunId(runId)
    clearTrialRunTimers()
    abortTrialRunStream()
    clearTrialRunEdgeStyles()
    setTrialRunOpen(true)
    setSingleNodeTrialOpen(false)
    replaceTrialRunExecutions({})
    clearNodeTrialRunExecution()
    clearNodeExecutionPanelExpansion()
    clearAllNodeTrialRunExecutions()

    try {
      const abortController = new AbortController()
      runAbortControllerRef.current = abortController
      const payload = globalDebugJsonMode
        ? buildDebugPayloadFromCombinedJson(globalDebugCombinedJson)
        : buildDebugPayloadFromFields(globalDebugFields)
      const workflow = {
        id: workflowId,
        name: '当前画布工作流',
        description: '前端画布提交到后端 LangGraph 执行的工作流。',
        version: 'v0.1.0',
        nodes: normalizeWorkflowNodesForRun(nodes),
        edges,
      }
      setGlobalDebugJsonError('')

      setTrialRunning(true)
      await streamWorkflow(workflow, payload, {
        signal: abortController.signal,
        onWorkflowEvent: (event) => {
          applyGlobalTrialRunEdgeEvent(event)
          applyRuntimeEventToNode(event)
        },
        onStep: (execution) => {
          const previous = trialRunExecutionsRef.current[execution.nodeId]
          const mergedExecution = {
            ...execution,
            timeline: [...(previous?.timeline ?? []), ...(execution.timeline ?? [])].slice(-80),
            degraded: previous?.degraded || execution.degraded,
            tokenUsage: execution.tokenUsage ?? previous?.tokenUsage,
          }
          syncNodeTrialRunExecution(execution.nodeId, mergedExecution)
          enqueueTrialRunExecution(execution.nodeId, mergedExecution)
        },
      })
      if (runAbortControllerRef.current === abortController) {
        runAbortControllerRef.current = null
      }
      setTrialRunning(false)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }
      setTrialRunning(false)
      replaceTrialRunExecutions({})
      clearNodeTrialRunExecution()
      clearTrialRunEdgeStyles()
      clearAllNodeTrialRunExecutions()
      setGlobalDebugJsonError('运行失败，请检查 JSON、节点配置或后端服务')
    }
  }, [
    clearAllNodeTrialRunExecutions,
    clearTrialRunTimers,
    clearTrialRunEdgeStyles,
    abortTrialRunStream,
    applyGlobalTrialRunEdgeEvent,
    applyRuntimeEventToNode,
    enqueueTrialRunExecution,
    edges,
    globalDebugCombinedJson,
    globalDebugFields,
    globalDebugJsonMode,
    nodes,
    replaceTrialRunExecutions,
    syncNodeTrialRunExecution,
    workflowId,
  ])

  const closeTrialRun = useCallback(() => {
    clearTrialRunTimers()
    abortTrialRunStream()
    setTrialRunning(false)
    setTrialRunOpen(false)
    replaceTrialRunExecutions({})
    clearNodeTrialRunExecution()
    clearNodeExecutionPanelExpansion()
    clearTrialRunEdgeStyles()
    clearAllNodeTrialRunExecutions()
  }, [abortTrialRunStream, clearAllNodeTrialRunExecutions, clearTrialRunEdgeStyles, clearTrialRunTimers, replaceTrialRunExecutions])

  const updateGlobalDebugField = useCallback((fieldName: string, value: string) => {
    setGlobalDebugFields((prev) =>
      prev.map((field) => {
        if (field.name !== fieldName) {
          return field
        }

        if (field.type === 'json') {
          try {
            JSON.parse(value)
            setGlobalDebugJsonError('')
          } catch {
            setGlobalDebugJsonError('请输入正确的 JSON 结构')
          }
        }

        return {
          ...field,
          value,
        }
      }),
    )
  }, [])

  const updateGlobalDebugCombinedJson = useCallback((value: string) => {
    setGlobalDebugCombinedJson(value)

    try {
      const parsed = JSON.parse(value) as Record<string, unknown>
      setGlobalDebugFields((prev) => {
        const prevMap = new Map(prev.map((field) => [field.name, field]))

        return Object.entries(parsed).map(([name, fieldValue]) => {
          const prevField = prevMap.get(name)
          const isJsonValue =
            typeof fieldValue === 'object' && fieldValue !== null && !Array.isArray(fieldValue)

          return {
            name,
            type: isJsonValue ? 'json' : (prevField?.type ?? 'string'),
            value: isJsonValue
              ? JSON.stringify(fieldValue, null, 2)
              : typeof fieldValue === 'string'
                ? fieldValue
                : JSON.stringify(fieldValue),
          } satisfies GlobalDebugFieldValue
        })
      })
      setGlobalDebugJsonError('')
    } catch {
      setGlobalDebugJsonError('请输入正确的 JSON 结构')
    }
  }, [])

  const updateSingleNodeTrialField = useCallback((fieldName: string, value: string) => {
    setSingleNodeTrialFields((prev) => {
      const nextFields = prev.map((field) => {
        if (field.name !== fieldName) {
          return field
        }

        if (field.type === 'json') {
          try {
            JSON.parse(value)
            setSingleNodeJsonError('')
          } catch {
            setSingleNodeJsonError('请输入正确的 JSON 结构')
          }
        }

        return {
          ...field,
          value,
        }
      })

      if (singleNodeTrialNodeId) {
        saveSingleNodeTrialCache(singleNodeTrialNodeId, {
          fields: nextFields,
          jsonMode: singleNodeJsonMode,
          combinedJson: singleNodeJsonMode
            ? singleNodeCombinedJson
            : JSON.stringify(buildPayloadFromFieldEntries(nextFields), null, 2),
        })
      }
      return nextFields
    })
  }, [saveSingleNodeTrialCache, singleNodeCombinedJson, singleNodeJsonMode, singleNodeTrialNodeId])

  const updateSingleNodeCombinedJson = useCallback((value: string) => {
    setSingleNodeCombinedJson(value)

    try {
      const parsed = JSON.parse(value) as Record<string, unknown>
      const nextFields = singleNodeTrialFields.map((field) => {
        if (!Object.prototype.hasOwnProperty.call(parsed, field.name)) {
          return field
        }
        const nextValue = parsed[field.name]
        const nextType = typeof nextValue === 'object' && nextValue !== null ? 'json' : field.type
        return {
          ...field,
          type: nextType,
          value: formatInputFieldValue(nextValue, nextType === 'json'),
        } satisfies GlobalDebugFieldValue
      })
      setSingleNodeTrialFields(nextFields)
      if (singleNodeTrialNodeId) {
        saveSingleNodeTrialCache(singleNodeTrialNodeId, {
          fields: nextFields,
          jsonMode: singleNodeJsonMode,
          combinedJson: value,
        })
      }
      setSingleNodeJsonError('')
    } catch {
      if (singleNodeTrialNodeId) {
        saveSingleNodeTrialCache(singleNodeTrialNodeId, {
          fields: singleNodeTrialFields,
          jsonMode: singleNodeJsonMode,
          combinedJson: value,
        })
      }
      setSingleNodeJsonError('请输入正确的 JSON 结构')
    }
  }, [saveSingleNodeTrialCache, singleNodeJsonMode, singleNodeTrialFields, singleNodeTrialNodeId])

  const toggleGlobalDebugJsonMode = useCallback(() => {
    setGlobalDebugJsonMode((prev) => {
      const next = !prev

      if (!prev) {
        const combined = JSON.stringify(
          Object.fromEntries(
            globalDebugFields.map((field) => [
              field.name,
              field.type === 'json' ? safeParseJsonField(field.value) : field.value,
            ]),
          ),
          null,
          2,
        )
        setGlobalDebugCombinedJson(combined)
        setGlobalDebugJsonError('')
      }

      return next
    })
  }, [globalDebugFields])

  const toggleSingleNodeJsonMode = useCallback(() => {
    setSingleNodeJsonMode((prev) => {
      const next = !prev
      let combinedJson = singleNodeCombinedJson
      if (!prev) {
        combinedJson = JSON.stringify(buildPayloadFromFieldEntries(singleNodeTrialFields), null, 2)
        setSingleNodeCombinedJson(combinedJson)
        setSingleNodeJsonError('')
      }
      if (singleNodeTrialNodeId) {
        saveSingleNodeTrialCache(singleNodeTrialNodeId, {
          fields: singleNodeTrialFields,
          jsonMode: next,
          combinedJson,
        })
      }
      return next
    })
  }, [saveSingleNodeTrialCache, singleNodeCombinedJson, singleNodeTrialFields, singleNodeTrialNodeId])

  const closeSingleNodeTrial = useCallback(() => {
    abortTrialRunStream()
    setTrialRunning(false)
    setSingleNodeTrialOpen(false)
  }, [abortTrialRunStream])

  const startSingleNodeTrialRun = useCallback(() => {
    if (!singleNodeTrialNodeId) {
      return
    }

    try {
      const payload = singleNodeJsonMode
        ? JSON.parse(singleNodeCombinedJson) as Record<string, unknown>
        : buildPayloadFromFieldEntries(singleNodeTrialFields)
      setSingleNodeJsonError('')
      void runSingleNode(singleNodeTrialNodeId, payload)
    } catch {
      setSingleNodeJsonError('请输入正确的 JSON 结构')
    }
  }, [
    runSingleNode,
    singleNodeCombinedJson,
    singleNodeJsonMode,
    singleNodeTrialFields,
    singleNodeTrialNodeId,
  ])

  return (
    <section
      className={cn(
        'relative h-full overflow-hidden rounded-[28px] border border-white/8 bg-slate-950/70 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]',
        className,
      )}
    >
      <div
        className="aw-flow-editor-shell relative h-full min-h-[680px]"
        onMouseDownCapture={(event) => {
          if (resetLineFromMouse(event)) {
            return
          }
          const target = event.target as HTMLElement
          if (
            target.closest('.aw-flow-node') ||
            target.closest('.aw-flow-ignore-deselect') ||
            target.closest('.gedit-minimap-layer')
          ) {
            return
          }

          onSelectNode('')
        }}
      >
        <FreeLayoutEditorProvider ref={handleEditorRef} {...editorProps}>
          <EditorRenderer className="aw-flow-editor" />
          <EditorTrialRunPanel
            open={trialRunOpen}
            fields={globalDebugFields}
            running={trialRunning}
            jsonMode={globalDebugJsonMode}
            combinedJson={globalDebugCombinedJson}
            jsonError={globalDebugJsonError}
            onFieldChange={updateGlobalDebugField}
            onCombinedJsonChange={updateGlobalDebugCombinedJson}
            onToggleJsonMode={toggleGlobalDebugJsonMode}
            onClose={closeTrialRun}
            onRun={startTrialRun}
          />
          <SingleNodeTrialPanel
            open={singleNodeTrialOpen}
            node={singleNodeTrialNode}
            fields={singleNodeTrialFields}
            running={trialRunning}
            execution={singleNodeTrialNodeId ? trialRunExecutions[singleNodeTrialNodeId] : undefined}
            jsonMode={singleNodeJsonMode}
            combinedJson={singleNodeCombinedJson}
            jsonError={singleNodeJsonError}
            onFieldChange={updateSingleNodeTrialField}
            onCombinedJsonChange={updateSingleNodeCombinedJson}
            onToggleJsonMode={toggleSingleNodeJsonMode}
            onClose={closeSingleNodeTrial}
            onRun={startSingleNodeTrialRun}
          />
          <EditorBottomBar
            trialRunOpen={trialRunOpen}
            onAddNode={() => {
              void openNodePanel()
            }}
            onToggleTrialRun={() => {
              setSingleNodeTrialOpen(false)
              setGlobalDebugFields((prev) => {
                const nextFields = createGlobalDebugFields(nodes, prev)
                setGlobalDebugCombinedJson(JSON.stringify(buildPayloadFromFieldEntries(nextFields), null, 2))
                setGlobalDebugJsonError('')
                return nextFields
              })
              setTrialRunOpen(true)
            }}
          />
        </FreeLayoutEditorProvider>
      </div>
    </section>
  )
}
