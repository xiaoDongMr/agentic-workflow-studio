import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Cable } from 'lucide-react'
import {
  EditorRenderer,
  FreeLayoutEditorProvider,
  type FreeLayoutPluginContext,
  type FreeLayoutProps,
  type WorkflowJSON,
  type WorkflowNodeProps,
} from '@flowgram.ai/free-layout-editor'
import type { WorkflowNodeJSON } from '@flowgram.ai/free-layout-core'
import {
  createFreeNodePanelPlugin,
  WorkflowNodePanelService,
} from '@flowgram.ai/free-node-panel-plugin'
import { createFreeSnapPlugin } from '@flowgram.ai/free-snap-plugin'
import { createMinimapPlugin } from '@flowgram.ai/minimap-plugin'
import '@flowgram.ai/free-layout-editor/index.css'

import {
  CANVAS_OFFSET_X,
  CANVAS_OFFSET_Y,
  defaultRegistries,
  paletteToNodeType,
} from '@/features/workflow/editor/workflow-editor.config'
import {
  EditorBottomBar,
  EditorTrialRunPanel,
  FlowgramNodePanel,
  SingleNodeTrialPanel,
} from '@/features/workflow/editor/workflow-editor-components'
import type {
  AddNodeOptions,
  FlowgramNodeData,
  GlobalDebugFieldValue,
  NodePaletteKey,
  TrialRunNodeExecution,
  TrialRunTimelineItem,
  WorkflowRuntimeEvent,
} from '@/features/workflow/editor/workflow-editor.types'
import {
  createNodeData,
  fromFlowgramJSON,
  getNextNodeCanvasPosition,
  getNodeEntityMeta,
  normalizeNodeData,
  toFlowgramJSON,
} from '@/features/workflow/editor/workflow-editor.utils'
import { FlowgramNodeCard } from '@/features/workflow/editor/workflow-node-card'
import { streamWorkflow } from '@/api/workflow'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useWorkflowStore } from '@/store/workflow-store'
import type { WorkflowEdge, WorkflowInputMapping, WorkflowNode, WorkflowDocument } from '@/types/workflow'

export interface WorkflowCanvasApi {
  addNode: (key: NodePaletteKey, options?: AddNodeOptions) => void
  updateSelectedNode: (
    partial: Partial<Omit<WorkflowNode, 'config'>> & {
      config?: Partial<WorkflowNode['config']>
    },
  ) => void
}

interface WorkflowEditorProps {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  selectedNodeId: string
  onSelectNode: (nodeId: string) => void
  onReady?: (api: WorkflowCanvasApi) => void
  className?: string
}

function safeParseJsonField(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return {}
  }
}

function parseArrayFieldValue(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return value.split('\n').map((item) => item.trim()).filter(Boolean)
  }
}

function eventTitle(event: WorkflowRuntimeEvent) {
  if (event.title) {
    return event.title
  }
  const titles: Record<WorkflowRuntimeEvent['type'], string> = {
    node_started: '节点开始执行',
    node_completed: '节点执行完成',
    node_failed: '节点执行失败',
    node_log: '节点日志',
    llm_started: '模型调用开始',
    llm_token: '模型输出片段',
    llm_completed: '模型调用完成',
    llm_retry: '模型调用重试',
    llm_failed: '模型调用失败',
    tool_started: '工具调用开始',
    tool_completed: '工具调用完成',
    tool_failed: '工具调用失败',
  }
  return titles[event.type]
}

function timelineItemFromRuntimeEvent(event: WorkflowRuntimeEvent): TrialRunTimelineItem {
  return {
    id: event.id,
    type: event.type,
    level: event.level ?? 'info',
    title: eventTitle(event),
    message: event.token ?? event.message,
    timestamp: event.timestamp,
    data: event.data,
  }
}

function mergeTimelineItem(
  timeline: TrialRunTimelineItem[] | undefined,
  item: TrialRunTimelineItem,
): TrialRunTimelineItem[] {
  const items = timeline ? [...timeline] : []
  const last = items.at(-1)
  if (item.type === 'llm_token' && last?.type === 'llm_token') {
    items[items.length - 1] = {
      ...last,
      id: item.id,
      message: `${last.message}${item.message}`.slice(-600),
      timestamp: item.timestamp,
    }
    return items
  }
  if (items.some((existing) => existing.id === item.id)) {
    return items
  }
  return [...items, item].slice(-80)
}

function statusFromRuntimeEvent(event: WorkflowRuntimeEvent, current?: TrialRunNodeExecution) {
  if (event.type === 'node_failed') {
    return 'error' as const
  }
  if (event.type === 'node_completed') {
    return 'success' as const
  }
  if (event.type === 'node_started') {
    return 'running' as const
  }
  return current?.status ?? 'running'
}

function executionFromRuntimeEvent(
  event: WorkflowRuntimeEvent,
  current?: TrialRunNodeExecution,
  fallbackNode?: WorkflowNode,
): TrialRunNodeExecution {
  const status = statusFromRuntimeEvent(event, current)
  const nodeTitle = event.nodeTitle || current?.nodeTitle || fallbackNode?.title || event.nodeId || '节点'
  const message = event.message || eventTitle(event)
  const strategyHandled = event.type === 'node_log' && ['使用兜底输出', '忽略模型错误'].includes(event.title ?? '')
  const degraded = current?.degraded || strategyHandled
  return {
    nodeId: event.nodeId || current?.nodeId || fallbackNode?.id || '',
    nodeTitle,
    log: message,
    input: current?.input ?? '{}',
    output: current?.output ?? '{}',
    durationMs: event.durationMs ?? current?.durationMs ?? 0,
    status,
    error: event.error ?? current?.error,
    degraded,
    timeline: mergeTimelineItem(current?.timeline, timelineItemFromRuntimeEvent(event)),
    summaryInput: current?.summaryInput ?? '执行事件',
    summaryOutput: event.type === 'llm_token' ? '模型正在输出…' : degraded && event.type === 'node_completed' ? '已按异常策略降级完成' : message,
  }
}

function buildDebugPayloadFromFields(fields: GlobalDebugFieldValue[]) {
  return buildPayloadFromFieldEntries(fields)
}

function buildDebugPayloadFromCombinedJson(value: string) {
  const parsed = JSON.parse(value) as Record<string, unknown>
  const firstObjectField = Object.values(parsed).find(
    (fieldValue) => typeof fieldValue === 'object' && fieldValue !== null && !Array.isArray(fieldValue),
  )

  if (firstObjectField && typeof firstObjectField === 'object') {
    return {
      ...parsed,
      ...(firstObjectField as Record<string, unknown>),
    }
  }

  return parsed
}

const NODE_COPY_OFFSET = 36

interface SingleNodeTrialCache {
  fields: GlobalDebugFieldValue[]
  jsonMode: boolean
  combinedJson: string
}

function buildPayloadFromFieldEntries(fields: GlobalDebugFieldValue[]) {
  return Object.fromEntries(
    fields.map((field) => [
      field.name,
      field.type === 'json'
        ? safeParseJsonField(field.value)
        : field.type.endsWith('-array')
          ? parseArrayFieldValue(field.value)
          : field.value,
    ]),
  )
}

function isStructuredWorkflowType(type: string) {
  const normalized = type.toLowerCase()
  return normalized.includes('object') || normalized.includes('array') || normalized.includes('json')
}

function getDebugFieldInputType(type: string): GlobalDebugFieldValue['type'] {
  const normalized = type.trim().toLowerCase()
  if (normalized === 'image') {
    return 'image'
  }
  if (normalized === 'video') {
    return 'video'
  }
  if (normalized === 'array<image>') {
    return 'image-array'
  }
  if (normalized === 'array<video>') {
    return 'video-array'
  }
  return isStructuredWorkflowType(type) ? 'json' : 'string'
}

function createSingleNodeTrialFields(node: WorkflowNode, fallbackPayload: Record<string, unknown>) {
  return node.inputs
    .filter((input) => input.name)
    .map((input) => {
      const value = fallbackPayload[input.name]
      const inputType = getDebugFieldInputType(input.type)
      const structured = inputType === 'json'
      return {
        name: input.name,
        type: inputType === 'string' && typeof value === 'object' && value !== null ? 'json' : inputType,
        valueType: input.type,
        value: formatInputFieldValue(value, structured || inputType.endsWith('-array')),
      } satisfies GlobalDebugFieldValue
    })
}

function createGlobalDebugFields(nodes: WorkflowNode[], previousFields: GlobalDebugFieldValue[]) {
  const startNode = nodes.find((node) => node.type === 'start')
  const definitions = startNode?.outputs.filter((output) => output.name) ?? []
  if (definitions.length === 0) {
    return previousFields
  }
  const previousByName = new Map(previousFields.map((field) => [field.name, field]))
  return definitions.map((definition) => {
    const previous = previousByName.get(definition.name)
    const type = getDebugFieldInputType(definition.type)
    return {
      name: definition.name,
      type,
      valueType: definition.type,
      value: previous?.value ?? formatInputFieldValue(undefined, type === 'json' || type.endsWith('-array')),
    } satisfies GlobalDebugFieldValue
  })
}

function formatInputFieldValue(value: unknown, structured: boolean) {
  if (value === undefined) {
    return structured ? '{}' : ''
  }
  if (typeof value === 'string') {
    return structured ? value : value
  }
  return JSON.stringify(value, null, 2)
}

function createUniqueNodeId(type: WorkflowNode['type'], existingIds: Set<string>) {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const baseId = `${type}-${suffix}`
  if (!existingIds.has(baseId)) {
    return baseId
  }

  let index = 2
  while (existingIds.has(`${baseId}-${index}`)) {
    index += 1
  }
  return `${baseId}-${index}`
}

function cloneWorkflowNode(node: WorkflowNode): WorkflowNode {
  return {
    ...node,
    position: { ...node.position },
    inputs: node.inputs.map((item) => ({ ...item })),
    outputs: node.outputs.map((item) => ({ ...item })),
    config: {
      ...node.config,
      inputMappings: node.config.inputMappings.map((item) => ({ ...item })),
    },
  }
}

function toSingleNodeTestWorkflow(node: WorkflowNode): WorkflowDocument {
  const singleNode = cloneWorkflowNode(node)
  const contextMappings = createSingleNodeContextMappings(singleNode)

  return {
    id: `single-node-${singleNode.id}`,
    name: `${singleNode.title} 单节点测试`,
    description: '仅执行当前节点，用于快速验证节点配置。',
    version: 'v0.1.0',
    nodes: [
      {
        ...singleNode,
        config: {
          ...singleNode.config,
          inputMappings: contextMappings,
        },
      },
    ],
    edges: [],
  }
}

function createSingleNodeContextMappings(node: WorkflowNode): WorkflowInputMapping[] {
  if (node.inputs.length > 0) {
    return node.inputs
      .filter((input) => input.name)
      .map((input) => ({
        field: input.name,
        sourceType: 'context',
        source: input.name,
      }))
  }

  return node.config.inputMappings.map(normalizeSingleNodeMapping)
}

function normalizeSingleNodeMapping(mapping: WorkflowInputMapping): WorkflowInputMapping {
  if (mapping.sourceType !== 'node') {
    return { ...mapping }
  }

  return {
    ...mapping,
    sourceType: 'context',
    source: mapping.field,
  }
}

export function WorkflowEditor({
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
  const [quickAddNodeId, setQuickAddNodeId] = useState('')
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
  const runTimerIdsRef = useRef<number[]>([])
  const runAbortControllerRef = useRef<AbortController | null>(null)
  const singleNodeTrialCacheRef = useRef<Record<string, SingleNodeTrialCache>>({})

  const singleNodeTrialNode = useMemo(
    () => nodes.find((node) => node.id === singleNodeTrialNodeId),
    [nodes, singleNodeTrialNodeId],
  )

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

  const syncNodeTrialRunExecution = useCallback(
    (nodeId: string, execution?: TrialRunNodeExecution) => {
      const ctx = ctxRef.current
      if (!ctx) {
        return
      }

      const targetNode = ctx.document.getAllNodes().find((node) => String(node.id) === nodeId)
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

  const applyRuntimeEventToNode = useCallback(
    (event: WorkflowRuntimeEvent, nodeIdOverride?: string, nodeOverride?: WorkflowNode) => {
      const nodeId = nodeIdOverride || event.nodeId
      if (!nodeId) {
        return
      }
      const fallbackNode = nodeOverride ?? nodes.find((item) => item.id === nodeId)
      setTrialRunExecutions((prev) => {
        const execution = executionFromRuntimeEvent(event, prev[nodeId], fallbackNode)
        const next = {
          ...prev,
          [nodeId]: execution,
        }
        syncNodeTrialRunExecution(nodeId, execution)
        return next
      })
    },
    [nodes, syncNodeTrialRunExecution],
  )

  const clearAllNodeTrialRunExecutions = useCallback(() => {
    const ctx = ctxRef.current
    if (!ctx) {
      return
    }

    ctx.document.getAllNodes().forEach((node) => {
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

  const createNodeByType = useCallback(
    (
      type: WorkflowNode['type'],
      options?: {
        connectFromNodeId?: string
        position?: { x: number; y: number }
        selectCreated?: boolean
      },
    ) => {
      const ctx = ctxRef.current
      if (!ctx) {
        return
      }

      const fromNodeId = options?.connectFromNodeId ?? selectedNodeId
      const fromNode = fromNodeId
        ? ctx.document.getAllNodes().find((node) => String(node.id) === fromNodeId)
        : undefined

      const fromNodeLike = fromNode ? getNodeEntityMeta(fromNode) : undefined
      const position = options?.position
        ? {
            x: options.position.x + CANVAS_OFFSET_X,
            y: options.position.y + CANVAS_OFFSET_Y,
          }
        : getNextNodeCanvasPosition(fromNodeLike, edges)

      const existingIds = new Set(ctx.document.getAllNodes().map((node) => String(node.id)))
      const nodeId = createUniqueNodeId(type, existingIds)
      const createdNode = ctx.document.createWorkflowNodeByType(type, position, {
        id: nodeId,
        data: createNodeData(type),
      })

      if (fromNode) {
        ctx.document.linesManager.createLine({
          from: String(fromNode.id),
          to: String(createdNode.id),
        })
      }

      const nextSelectedId = String(createdNode.id)
      if (options?.selectCreated !== false) {
        onSelectNode(nextSelectedId)
      }
      setWorkflowGraph(...fromFlowgramJSON(ctx.document.toJSON()))
      setQuickAddNodeId('')
    },
    [edges, onSelectNode, selectedNodeId, setWorkflowGraph],
  )

  const addNode = useCallback((key: NodePaletteKey, options?: AddNodeOptions) => {
    createNodeByType(paletteToNodeType[key], options)
  }, [createNodeByType])

  const openNodePanel = useCallback(
    async (options?: {
      connectFromNodeId?: string
      position?: { x: number; y: number }
      selectCreated?: boolean
    }) => {
      const ctx = ctxRef.current
      if (!ctx) {
        return
      }

      const fromNodeId = options?.connectFromNodeId ?? selectedNodeId
      const fromNode = fromNodeId
        ? ctx.document.getAllNodes().find((node) => String(node.id) === fromNodeId)
        : undefined
      const fromNodeLike = fromNode ? getNodeEntityMeta(fromNode) : undefined
      const panelPosition = options?.position
        ? {
            x: options.position.x + CANVAS_OFFSET_X,
            y: options.position.y + CANVAS_OFFSET_Y,
          }
        : getNextNodeCanvasPosition(fromNodeLike, edges)
      const sourceTitle = fromNodeId ? nodes.find((node) => node.id === fromNodeId)?.title ?? '' : ''

      if (fromNodeId) {
        setQuickAddNodeId(fromNodeId)
      }

      try {
        const nodePanelService = ctx.get(WorkflowNodePanelService)
        const result = await nodePanelService.singleSelectNodePanel({
          position: panelPosition,
          panelProps: {
            sourceTitle,
          },
          containerNode: fromNode,
        })

        if (!result?.nodeType) {
          return
        }

        createNodeByType(result.nodeType as WorkflowNode['type'], {
          connectFromNodeId: fromNodeId,
          selectCreated: options?.selectCreated,
        })
      } finally {
        setQuickAddNodeId('')
      }
    },
    [createNodeByType, edges, nodes, selectedNodeId],
  )

  const updateSelectedNode = useCallback(
    (
      partial: Partial<Omit<WorkflowNode, 'config'>> & {
        config?: Partial<WorkflowNode['config']>
      },
    ) => {
      const ctx = ctxRef.current
      if (!ctx) {
        return
      }

      const targetNode = ctx.document.getAllNodes().find((node) => String(node.id) === selectedNodeId)
      if (!targetNode) {
        return
      }

      const nodeJson = targetNode.toJSON() as WorkflowNodeJSON & { data?: Partial<FlowgramNodeData> }
      const currentData = normalizeNodeData(nodeJson.data, nodeJson.type as WorkflowNode['type'])
      const nextData = {
        ...currentData,
        ...partial,
        kind: currentData.kind,
        config: {
          ...currentData.config,
          ...partial.config,
        },
      }

      ;(targetNode as WorkflowNodeJSON & { updateExtInfo?: (data: FlowgramNodeData, fullUpdate?: boolean) => void }).updateExtInfo?.(
        nextData,
        true,
      )

      setWorkflowGraph(...fromFlowgramJSON(ctx.document.toJSON()))
    },
    [selectedNodeId, setWorkflowGraph],
  )

  const handleEditorRef = useCallback((ctx: FreeLayoutPluginContext | null) => {
    ctxRef.current = ctx
  }, [])

  const openSingleNodeTrial = useCallback((nodeId: string) => {
    const ctx = ctxRef.current
    const [latestNodes] = ctx ? fromFlowgramJSON(ctx.document.toJSON()) : [nodes]
    const targetNode = latestNodes.find((item) => item.id === nodeId)
    if (!targetNode) {
      return
    }

    const cached = singleNodeTrialCacheRef.current[nodeId]
    const fallbackPayload = globalDebugJsonMode
      ? buildDebugPayloadFromCombinedJson(globalDebugCombinedJson)
      : buildPayloadFromFieldEntries(globalDebugFields)
    const fields = cached?.fields ?? createSingleNodeTrialFields(targetNode, fallbackPayload)
    const combinedJson = cached?.combinedJson ?? JSON.stringify(buildPayloadFromFieldEntries(fields), null, 2)

    clearTrialRunTimers()
    abortTrialRunStream()
    onSelectNode('')
    setTrialRunOpen(false)
    setSingleNodeTrialNodeId(nodeId)
    setSingleNodeTrialFields(fields)
    setSingleNodeCombinedJson(combinedJson)
    setSingleNodeJsonMode(cached?.jsonMode ?? false)
    setSingleNodeJsonError('')
    setTrialRunExecutions((prev) => {
      if (!prev[nodeId]) {
        return prev
      }
      const next = { ...prev }
      delete next[nodeId]
      return next
    })
    syncNodeTrialRunExecution(nodeId, undefined)
    setSingleNodeTrialOpen(true)
  }, [
    abortTrialRunStream,
    clearTrialRunTimers,
    globalDebugCombinedJson,
    globalDebugFields,
    globalDebugJsonMode,
    nodes,
    onSelectNode,
    syncNodeTrialRunExecution,
  ])

  const runSingleNode = useCallback(async (nodeId: string, payloadOverride?: Record<string, unknown>) => {
    clearTrialRunTimers()
    abortTrialRunStream()
    setTrialRunOpen(false)
    setTrialRunExecutions({})
    clearAllNodeTrialRunExecutions()

    const ctx = ctxRef.current
    const [latestNodes] = ctx ? fromFlowgramJSON(ctx.document.toJSON()) : [nodes]
    const targetNode = latestNodes.find((item) => item.id === nodeId)
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

    setTrialRunExecutions({ [nodeId]: runningExecution })
    syncNodeTrialRunExecution(nodeId, runningExecution)

    try {
      const abortController = new AbortController()
      runAbortControllerRef.current = abortController
      const payload = payloadOverride ?? (globalDebugJsonMode
        ? buildDebugPayloadFromCombinedJson(globalDebugCombinedJson)
        : buildPayloadFromFieldEntries(globalDebugFields))

      setTrialRunning(true)
      const executions = await streamWorkflow(toSingleNodeTestWorkflow(targetNode), payload, {
        signal: abortController.signal,
        onWorkflowEvent: (event) => {
          applyRuntimeEventToNode(event, nodeId, targetNode)
        },
        onStep: (execution) => {
          setTrialRunExecutions((prev) => {
            const mergedExecution = {
              ...execution,
              timeline: [...(prev[nodeId]?.timeline ?? []), ...(execution.timeline ?? [])].slice(-80),
              degraded: prev[nodeId]?.degraded || execution.degraded,
            }
            syncNodeTrialRunExecution(nodeId, mergedExecution)
            return { [nodeId]: mergedExecution }
          })
        },
      })
      const fallbackExecution = executions.at(-1)
      if (fallbackExecution) {
        setTrialRunExecutions((prev) => {
          const mergedExecution = {
            ...fallbackExecution,
            timeline: [...(prev[nodeId]?.timeline ?? []), ...(fallbackExecution.timeline ?? [])].slice(-80),
            degraded: prev[nodeId]?.degraded || fallbackExecution.degraded,
          }
          syncNodeTrialRunExecution(nodeId, mergedExecution)
          return { [nodeId]: mergedExecution }
        })
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
      setTrialRunExecutions({ [nodeId]: failedExecution })
      syncNodeTrialRunExecution(nodeId, failedExecution)
    }
  }, [
    abortTrialRunStream,
    applyRuntimeEventToNode,
    clearAllNodeTrialRunExecutions,
    clearTrialRunTimers,
    globalDebugCombinedJson,
    globalDebugFields,
    globalDebugJsonMode,
    nodes,
    syncNodeTrialRunExecution,
  ])

  const copyNode = useCallback((nodeId: string) => {
    const ctx = ctxRef.current
    if (!ctx) {
      return
    }

    const targetNode = ctx.document.getAllNodes().find((item) => String(item.id) === nodeId)
    if (!targetNode) {
      return
    }

    const nodeJson = targetNode.toJSON() as WorkflowNodeJSON & { data?: Partial<FlowgramNodeData> }
    const type = nodeJson.type as WorkflowNode['type']
    const existingIds = new Set(ctx.document.getAllNodes().map((item) => String(item.id)))
    const newNodeId = createUniqueNodeId(type, existingIds)
    const position = (nodeJson.meta as { position?: { x?: number; y?: number } } | undefined)?.position
    const copiedNode = ctx.document.copyNode(
      targetNode,
      newNodeId,
      (json) => {
        const data = normalizeNodeData(json.data as Partial<FlowgramNodeData>, type)
        return {
          ...json,
          id: newNodeId,
          data: {
            ...data,
            title: `${data.title} 副本`,
            trialRunExecution: undefined,
          },
        }
      },
      {
        x: (position?.x ?? CANVAS_OFFSET_X) + NODE_COPY_OFFSET,
        y: (position?.y ?? CANVAS_OFFSET_Y) + NODE_COPY_OFFSET,
      },
    )
    const nextSelectedId = String(copiedNode.id)
    onSelectNode(nextSelectedId)
    setWorkflowGraph(...fromFlowgramJSON(ctx.document.toJSON()))
  }, [onSelectNode, setWorkflowGraph])

  const deleteNode = useCallback((nodeId: string) => {
    const ctx = ctxRef.current
    if (!ctx) {
      return
    }

    const targetNode = ctx.document.getAllNodes().find((item) => String(item.id) === nodeId)
    if (!targetNode || !ctx.document.canRemove(targetNode, true)) {
      return
    }

    targetNode.dispose()
    if (selectedNodeId === nodeId) {
      onSelectNode('')
    }
    setTrialRunExecutions((prev) => {
      const next = { ...prev }
      delete next[nodeId]
      return next
    })
    setWorkflowGraph(...fromFlowgramJSON(ctx.document.toJSON()))
  }, [onSelectNode, selectedNodeId, setWorkflowGraph])

  const closeDebugPanels = useCallback(() => {
    clearTrialRunTimers()
    abortTrialRunStream()
    setTrialRunning(false)
    setTrialRunOpen(false)
    setSingleNodeTrialOpen(false)
  }, [abortTrialRunStream, clearTrialRunTimers])

  const selectNodeForConfig = useCallback(
    (nodeId: string) => {
      if (nodeId) {
        closeDebugPanels()
      }
      onSelectNode(nodeId)
    },
    [closeDebugPanels, onSelectNode],
  )

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
            quickAddOpenNodeId={quickAddNodeId}
            trialRunExecution={trialRunExecutions[String(props.node.id)]}
            nodeActionRunning={trialRunning}
            onRunNode={openSingleNodeTrial}
            onCopyNode={copyNode}
            onDeleteNode={deleteNode}
            onToggleQuickAdd={(nodeId) => {
              clearTrialRunTimers()
              setTrialRunning(false)
              setTrialRunOpen(false)
              setSingleNodeTrialOpen(false)
              setTrialRunExecutions({})
              void openNodePanel({ connectFromNodeId: nodeId })
            }}
          />
        ),
      },
      history: {
        enable: true,
        enableChangeNode: true,
      },
      plugins: () => [
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
      onContentChange: (ctx) => {
        setWorkflowGraph(...fromFlowgramJSON(ctx.document.toJSON()))
      },
      onAllLayersRendered: (ctx) => {
        ctx.tools.fitView(false)
      },
    }),
    [
      clearTrialRunTimers,
      copyNode,
      deleteNode,
      initialData,
      openNodePanel,
      openSingleNodeTrial,
      quickAddNodeId,
      selectNodeForConfig,
      selectedNodeId,
      setWorkflowGraph,
      trialRunExecutions,
      trialRunning,
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
    }
  }, [abortTrialRunStream, clearTrialRunTimers])

  const startTrialRun = useCallback(async () => {
    clearTrialRunTimers()
    abortTrialRunStream()
    setTrialRunOpen(true)
    setSingleNodeTrialOpen(false)
    setTrialRunExecutions({})
    clearAllNodeTrialRunExecutions()

    try {
      const abortController = new AbortController()
      runAbortControllerRef.current = abortController
      const payload = globalDebugJsonMode
        ? buildDebugPayloadFromCombinedJson(globalDebugCombinedJson)
        : buildDebugPayloadFromFields(globalDebugFields)
      const workflow = {
        id: 'current-canvas',
        name: '当前画布工作流',
        description: '前端画布提交到后端 LangGraph 执行的工作流。',
        version: 'v0.1.0',
        nodes,
        edges,
      }
      setGlobalDebugJsonError('')

      setTrialRunning(true)
      await streamWorkflow(workflow, payload, {
        signal: abortController.signal,
        onWorkflowEvent: (event) => {
          applyRuntimeEventToNode(event)
        },
        onStep: (execution) => {
          setTrialRunExecutions((prev) => {
            const mergedExecution = {
              ...execution,
              timeline: [...(prev[execution.nodeId]?.timeline ?? []), ...(execution.timeline ?? [])].slice(-80),
              degraded: prev[execution.nodeId]?.degraded || execution.degraded,
            }
            const next = {
              ...prev,
              [execution.nodeId]: mergedExecution,
            }
            syncNodeTrialRunExecution(execution.nodeId, mergedExecution)
            return next
          })
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
      setTrialRunExecutions({})
      clearAllNodeTrialRunExecutions()
      setGlobalDebugJsonError('运行失败，请检查 JSON、节点配置或后端服务')
    }
  }, [
    clearAllNodeTrialRunExecutions,
    clearTrialRunTimers,
    abortTrialRunStream,
    applyRuntimeEventToNode,
    edges,
    globalDebugCombinedJson,
    globalDebugFields,
    globalDebugJsonMode,
    nodes,
    syncNodeTrialRunExecution,
  ])

  const closeTrialRun = useCallback(() => {
    clearTrialRunTimers()
    abortTrialRunStream()
    setTrialRunning(false)
    setTrialRunOpen(false)
    setTrialRunExecutions({})
    clearAllNodeTrialRunExecutions()
  }, [abortTrialRunStream, clearAllNodeTrialRunExecutions, clearTrialRunTimers])

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
      <div className="relative flex items-center justify-between border-b border-white/8 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <Cable className="h-4 w-4 text-blue-300" />
          工作流主画布
        </div>
        <div className="flex items-center gap-2">
          <Badge>FlowGram</Badge>
          <Badge className="border-white/15 bg-white/3 text-slate-300">Free Layout</Badge>
        </div>
      </div>

      <div
        className="aw-flow-editor-shell relative h-[calc(100%-61px)] min-h-[680px]"
        onMouseDownCapture={(event) => {
          const target = event.target as HTMLElement
          if (
            target.closest('.aw-flow-node') ||
            target.closest('.aw-flow-ignore-deselect') ||
            target.closest('.gedit-minimap-layer')
          ) {
            return
          }

          onSelectNode('')
          setQuickAddNodeId('')
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
              setQuickAddNodeId('')
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
