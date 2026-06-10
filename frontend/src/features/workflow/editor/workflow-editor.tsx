import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Cable } from 'lucide-react'
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
  WorkflowOperationBaseService,
  WorkflowSelectService,
  type WorkflowLineEntity,
  type WorkflowNodeEntity,
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
  createGlobalDebugFields,
  createSingleNodeTrialFields,
  formatInputFieldValue,
} from '@/features/workflow/editor/debug/debug-fields'
import {
  normalizeSelectorLabelsForNode,
  normalizeWorkflowNodesForRun,
  toSingleNodeTestWorkflow,
} from '@/features/workflow/editor/debug/single-node-workflow'
import { useWorkflowNodeActions } from '@/features/workflow/editor/hooks/use-workflow-node-actions'
import type {
  AddNodeOptions,
  FlowgramNodeData,
  GlobalDebugFieldValue,
  NodePaletteKey,
  TrialRunNodeExecution,
  TrialRunTimelineItem,
  WorkflowRuntimeEvent,
  WorkflowTokenUsage,
} from '@/features/workflow/editor/workflow-editor.types'
import {
  fromFlowgramJSON,
  normalizeNodeData,
  toFlowgramJSON,
} from '@/features/workflow/editor/workflow-editor.utils'
import {
  DEFAULT_LOOP_CANVAS_HEIGHT,
  DEFAULT_LOOP_CANVAS_WIDTH,
  getAutoLoopBodyCanvasSize,
  LOOP_CANVAS_ANCHOR_NODE_TYPE,
} from '@/features/workflow/editor/loop-node.utils'
import { clearNodeExecutionPanelExpansion } from '@/features/workflow/editor/node-execution-panel-state'
import { FlowgramNodeCard } from '@/features/workflow/editor/workflow-node-card'
import { streamWorkflow } from '@/api/workflow'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useWorkflowStore } from '@/store/workflow-store'
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

function readTokenUsage(data?: Record<string, unknown>): WorkflowTokenUsage | undefined {
  const usage = data?.tokenUsage
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) {
    return undefined
  }
  const inputTokens = readTokenCount((usage as Record<string, unknown>).inputTokens)
  const outputTokens = readTokenCount((usage as Record<string, unknown>).outputTokens)
  const totalTokens = readTokenCount((usage as Record<string, unknown>).totalTokens) || inputTokens + outputTokens
  if (totalTokens <= 0) {
    return undefined
  }
  return { inputTokens, outputTokens, totalTokens }
}

function readTokenCount(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(Math.trunc(value), 0)
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.max(Math.trunc(parsed), 0) : 0
  }
  return 0
}

function formatTokenUsage(usage: WorkflowTokenUsage) {
  return `Token ${usage.totalTokens} · 输入 ${usage.inputTokens} / 输出 ${usage.outputTokens}`
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

function timelineItemFromRuntimeEvent(event: WorkflowRuntimeEvent): TrialRunTimelineItem {
  const tokenUsage = readTokenUsage(event.data)
  return {
    id: event.id,
    type: event.type,
    level: event.level ?? 'info',
    title: eventTitle(event),
    message: event.token ?? (tokenUsage && event.type === 'llm_completed' ? formatTokenUsage(tokenUsage) : event.message),
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
  const tokenUsage = readTokenUsage(event.data) ?? current?.tokenUsage
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
    tokenUsage,
    timeline: mergeTimelineItem(current?.timeline, timelineItemFromRuntimeEvent(event)),
    summaryInput: current?.summaryInput ?? '执行事件',
    summaryOutput: tokenUsage && event.type === 'llm_completed' ? formatTokenUsage(tokenUsage) : event.type === 'llm_token' ? '模型正在输出…' : degraded && event.type === 'node_completed' ? '已按异常策略降级完成' : message,
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

function findWorkflowNodeById(nodes: WorkflowNode[], nodeId: string): WorkflowNode | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node
    }
    const bodyNode = findWorkflowNodeById(node.config.loopBodyNodes ?? [], nodeId)
    if (bodyNode) {
      return bodyNode
    }
  }
  return undefined
}

function flattenWorkflowNodes(nodes: WorkflowNode[]): WorkflowNode[] {
  return nodes.flatMap((node) => [node, ...flattenWorkflowNodes(node.config.loopBodyNodes ?? [])])
}

function patchLoopChildDragIsolation(ctx: FreeLayoutPluginContext) {
  const dragService = ctx.get(WorkflowDragService) as unknown as {
    __awLoopChildDragPatched?: boolean
    __awLoopChildDragStartPatched?: boolean
    resetContainerInternalPosition?: (nodes: WorkflowNodeEntity[]) => void
    startDragSelectedNodes?: (event: MouseEvent | React.MouseEvent) => Promise<boolean>
    onNodesDrag?: (listener: (event: LoopDragEvent) => void) => { dispose?: () => void }
  }
  const selectService = ctx.get(WorkflowSelectService) as unknown as {
    selectNode?: (node: WorkflowNodeEntity) => void
  }
  if (!dragService.__awLoopChildDragStartPatched && typeof dragService.startDragSelectedNodes === 'function') {
    const startDragSelectedNodes = dragService.startDragSelectedNodes.bind(dragService)
    dragService.startDragSelectedNodes = (event: MouseEvent | React.MouseEvent) => {
      const targetNode = getDragTargetWorkflowNode(ctx, event.target)
      if (targetNode && getWorkflowNodeType(targetNode) === LOOP_CANVAS_ANCHOR_NODE_TYPE) {
        const loopParent = getLoopContainerForNode(targetNode)
        if (loopParent) {
          selectService.selectNode?.(loopParent)
        }
      } else if (targetNode && isNodeInsideLoopContainer(targetNode)) {
        selectService.selectNode?.(targetNode)
      }
      return startDragSelectedNodes(event)
    }
    dragService.__awLoopChildDragStartPatched = true
  }

  if (!dragService.__awLoopChildDragPatched && typeof dragService.resetContainerInternalPosition === 'function') {
    const resetContainerInternalPosition = dragService.resetContainerInternalPosition.bind(dragService)
    dragService.resetContainerInternalPosition = (nodes: WorkflowNodeEntity[]) => {
      const draggedLoopIds = getDraggedLoopNodeIds(nodes)
      const hasStandaloneLoopChild = nodes.some((node) => {
        if (getWorkflowNodeType(node) === LOOP_CANVAS_ANCHOR_NODE_TYPE) {
          return false
        }
        const loopParent = getLoopContainerForNode(node)
        return loopParent && !draggedLoopIds.has(String(loopParent.id))
      })
      if (hasStandaloneLoopChild) {
        return
      }
      resetContainerInternalPosition(nodes)
    }
    dragService.__awLoopChildDragPatched = true
  }

  const layout = ctx.document.layout as unknown as {
    __awLoopChildTransformPatched?: boolean
    updateAffectedTransform?: (node: WorkflowNodeEntity) => void
    fireChange?: (node: WorkflowNodeEntity) => void
  }
  installLoopParentPositionGuard(ctx, dragService)
  if (layout.__awLoopChildTransformPatched || typeof layout.updateAffectedTransform !== 'function') {
    return
  }

  const updateAffectedTransform = layout.updateAffectedTransform.bind(layout)
  layout.updateAffectedTransform = (node: WorkflowNodeEntity) => {
    if (isNodeInsideLoopContainer(node)) {
      layout.fireChange?.(node)
      return
    }
    updateAffectedTransform(node)
  }
  layout.__awLoopChildTransformPatched = true
}

function isNodeInsideLoopContainer(node: WorkflowNodeEntity) {
  let parent = node.parent
  while (parent) {
    const parentJson = parent.toJSON?.() as WorkflowNodeJSON | undefined
    const parentType = String(parentJson?.type ?? parent.flowNodeType ?? '')
    if (parentType === 'loop') {
      return true
    }
    parent = parent.parent
  }
  return false
}

function installLoopParentPositionGuard(
  ctx: FreeLayoutPluginContext,
  dragService: {
    __awLoopParentPositionGuardInstalled?: boolean
    onNodesDrag?: (listener: (event: LoopDragEvent) => void) => { dispose?: () => void }
  },
) {
  if (dragService.__awLoopParentPositionGuardInstalled || typeof dragService.onNodesDrag !== 'function') {
    return
  }

  const lockedLoopPositions = new Map<string, {
    node: WorkflowNodeEntity
    position: { x: number; y: number }
  }>()
  const operationService = ctx.get(WorkflowOperationBaseService) as WorkflowNodePositionService

  dragService.onNodesDrag((event) => {
    const eventNodes = event.nodes.filter(isWorkflowNodeEntity)
    const draggedLoopIds = getDraggedLoopNodeIds(eventNodes)
    const loopParents = eventNodes
      .filter((node) => getWorkflowNodeType(node) !== LOOP_CANVAS_ANCHOR_NODE_TYPE)
      .map(getLoopContainerForNode)
      .filter((node): node is WorkflowNodeEntity => {
        return Boolean(node) && !draggedLoopIds.has(String(node?.id))
      })

    if (event.type === 'onDragStart') {
      lockedLoopPositions.clear()
      loopParents.forEach((loopNode) => {
        lockedLoopPositions.set(String(loopNode.id), {
          node: loopNode,
          position: {
            x: loopNode.transform.position.x,
            y: loopNode.transform.position.y,
          },
        })
      })
      loopParents.forEach((loopNode) => lockLoopChildPositions(ctx, loopNode, operationService))
      return
    }

    if (lockedLoopPositions.size === 0) {
      return
    }

    lockedLoopPositions.forEach(({ node, position }) => {
      const fixedLoopPosition = position
      if (node.transform.position.x === fixedLoopPosition.x && node.transform.position.y === fixedLoopPosition.y) {
        lockLoopChildPositions(ctx, node, operationService)
      } else {
        node.transform.transform.update({ position: fixedLoopPosition })
        ctx.document.layout.updateAffectedTransform(node)
        lockLoopChildPositions(ctx, node, operationService)
      }
    })

    if (event.type === 'onDragEnd') {
      lockedLoopPositions.forEach(({ node }) => lockLoopChildPositions(ctx, node, operationService))
      lockedLoopPositions.clear()
    }
  })

  dragService.__awLoopParentPositionGuardInstalled = true
}

function lockAllLoopChildPositions(ctx: FreeLayoutPluginContext) {
  const operationService = ctx.get(WorkflowOperationBaseService) as WorkflowNodePositionService
  ctx.document.getAllNodes()
    .filter((node) => getWorkflowNodeType(node) === 'loop')
    .forEach((loopNode) => lockLoopChildPositions(ctx, loopNode, operationService))
}

type WorkflowNodePositionService = {
  updateNodePosition: (nodeOrId: WorkflowNodeEntity | string, position: { x: number; y: number }) => void
}

function lockLoopChildPositions(
  ctx: FreeLayoutPluginContext,
  loopNode: WorkflowNodeEntity,
  operationService: WorkflowNodePositionService,
) {
  loopNode.blocks?.forEach((block) => {
    if (getWorkflowNodeType(block) === LOOP_CANVAS_ANCHOR_NODE_TYPE) {
      return
    }
    const fixedPosition = clampLoopChildPosition(block)
    if (
      Math.round(block.transform.position.x) === fixedPosition.x
      && Math.round(block.transform.position.y) === fixedPosition.y
    ) {
      return
    }
    operationService.updateNodePosition(block, fixedPosition)
    ;(ctx.document.layout as unknown as { updateAffectedTransform?: (node: WorkflowNodeEntity) => void })
      .updateAffectedTransform?.(block)
  })
  expandLoopCanvasForChildren(ctx, loopNode)
}

function expandLoopCanvasForChildren(ctx: FreeLayoutPluginContext, loopNode: WorkflowNodeEntity) {
  const loopJson = loopNode.toJSON() as WorkflowNodeJSON & { data?: Partial<FlowgramNodeData> }
  const currentData = normalizeNodeData(loopJson.data, 'loop')
  const bodyNodes = loopNode.blocks?.map((block) => {
    const bounds = block.transform.bounds

    return {
      type: getWorkflowNodeType(block),
      position: {
        x: Math.round(block.transform.position.x),
        y: Math.round(block.transform.position.y),
      },
      size: {
        width: bounds?.width,
        height: bounds?.height,
      },
    }
  }) ?? []
  const nextSize = getAutoLoopBodyCanvasSize(bodyNodes)
  if (
    nextSize.width === (currentData.config.loopCanvasWidth ?? DEFAULT_LOOP_CANVAS_WIDTH)
    && nextSize.height === (currentData.config.loopCanvasHeight ?? DEFAULT_LOOP_CANVAS_HEIGHT)
  ) {
    return
  }

  ;(loopNode as unknown as { updateExtInfo?: (data: FlowgramNodeData, fullUpdate?: boolean) => void }).updateExtInfo?.(
    {
      ...currentData,
      config: {
        ...currentData.config,
        loopCanvasWidth: nextSize.width,
        loopCanvasHeight: nextSize.height,
      },
    },
    true,
  )
  ctx.document.layout.updateAffectedTransform(loopNode)
}

function clampLoopChildPosition(node: WorkflowNodeEntity) {
  const limits = getLoopChildPositionLimits(node)

  return {
    x: Math.max(Math.round(node.transform.position.x), limits.minX),
    y: Math.max(Math.round(node.transform.position.y), limits.minY),
  }
}

function getLoopChildPositionLimits(node: WorkflowNodeEntity) {
  const bounds = node.transform.bounds
  const halfWidth = Math.max((bounds?.width ?? 320) / 2, 80)
  const margin = 24
  const leftReserved = 220
  const topReserved = 172

  return {
    minX: Math.max(halfWidth + margin, leftReserved),
    minY: topReserved,
  }
}

function getLoopContainerForNode(node: WorkflowNodeEntity) {
  let parent = node.parent
  while (parent) {
    if (getWorkflowNodeType(parent) === 'loop') {
      return parent
    }
    parent = parent.parent
  }
  return undefined
}

function getDraggedLoopNodeIds(nodes: WorkflowNodeEntity[]) {
  return new Set(
    nodes
      .filter((node) => getWorkflowNodeType(node) === 'loop')
      .map((node) => String(node.id)),
  )
}

function getDragTargetWorkflowNode(ctx: FreeLayoutPluginContext, target: EventTarget | null | undefined) {
  if (!(target instanceof HTMLElement)) {
    return undefined
  }
  const nodeId = target.getAttribute('data-node-id') ?? target.closest('[data-node-id]')?.getAttribute('data-node-id')
  if (!nodeId) {
    return undefined
  }
  return getAllWorkflowNodes(ctx).find((node) => String(node.id) === nodeId)
}

interface LoopDragEvent {
  type: string
  nodes: unknown[]
  startPositions?: Array<{ x: number; y: number }>
  positions?: Array<{ x: number; y: number }>
  dragEvent?: {
    offset?: { x: number; y: number }
  }
  triggerEvent?: {
    target?: EventTarget | null
  }
}

function isWorkflowNodeEntity(node: unknown): node is WorkflowNodeEntity {
  return Boolean(node && typeof node === 'object' && 'id' in node && 'transform' in node)
}

function getAllWorkflowNodes(ctx: FreeLayoutPluginContext) {
  const documentWithNodes = ctx.document as unknown as {
    getAllNodes?: () => WorkflowNodeEntity[]
  }
  return documentWithNodes.getAllNodes?.() ?? []
}

function getWorkflowJSONWithLivePositions(ctx: FreeLayoutPluginContext): WorkflowJSON {
  const entitiesById = new Map(getAllWorkflowNodes(ctx).map((node) => [String(node.id), node]))
  const patchNodePosition = (node: WorkflowJSON['nodes'][number]): WorkflowJSON['nodes'][number] => {
    const entity = entitiesById.get(String(node.id))
    const livePosition = entity?.transform?.position
    const meta = (node.meta ?? {}) as NonNullable<WorkflowJSON['nodes'][number]['meta']>

    return {
      ...node,
      meta: {
        ...meta,
        ...(livePosition
          ? {
            position: {
              x: Math.round(livePosition.x),
              y: Math.round(livePosition.y),
            },
          }
          : {}),
      },
      blocks: node.blocks?.map(patchNodePosition),
    }
  }
  const json = ctx.document.toJSON()

  return {
    ...json,
    nodes: json.nodes.map(patchNodePosition),
  }
}

function installNodeDragEndPersistence(
  ctx: FreeLayoutPluginContext,
  setWorkflowGraph: (nodes: WorkflowNode[], edges: WorkflowEdge[]) => void,
) {
  const dragService = ctx.get(WorkflowDragService) as unknown as {
    __awNodeDragEndPersistenceInstalled?: boolean
    onNodesDrag?: (listener: (event: LoopDragEvent) => void) => { dispose?: () => void }
  }
  if (dragService.__awNodeDragEndPersistenceInstalled || typeof dragService.onNodesDrag !== 'function') {
    return
  }

  dragService.onNodesDrag((event) => {
    if (event.type !== 'onDragEnd') {
      return
    }
    window.setTimeout(() => {
      lockAllLoopChildPositions(ctx)
      const liveJson = getWorkflowJSONWithLivePositions(ctx)
      const nextGraph = fromFlowgramJSON(liveJson)
      setWorkflowGraph(...nextGraph)
    }, 0)
  })
  dragService.__awNodeDragEndPersistenceInstalled = true
}

function getWorkflowNodeType(node: WorkflowNodeEntity) {
  const json = node.toJSON?.() as WorkflowNodeJSON | undefined
  return String(json?.type ?? node.flowNodeType ?? '')
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
    const fields = cached?.fields ?? createSingleNodeTrialFields(targetNode, fallbackPayload, allKnownNodes)
    const combinedJson = cached?.combinedJson ?? JSON.stringify(buildPayloadFromFieldEntries(fields), null, 2)

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
    setTrialRunExecutions((prev) => {
      if (!prev[nodeId]) {
        return prev
      }
      const next = { ...prev }
      delete next[nodeId]
      return next
    })
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
    syncNodeTrialRunExecution,
  ])

  const runSingleNode = useCallback(async (nodeId: string, payloadOverride?: Record<string, unknown>) => {
    clearTrialRunTimers()
    abortTrialRunStream()
    setTrialRunOpen(false)
    setTrialRunExecutions({})
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

    setTrialRunExecutions({ [nodeId]: runningExecution })
    syncNodeTrialRunExecution(nodeId, runningExecution)

    try {
      const abortController = new AbortController()
      runAbortControllerRef.current = abortController
      const payload = payloadOverride ?? (globalDebugJsonMode
        ? buildDebugPayloadFromCombinedJson(globalDebugCombinedJson)
        : buildPayloadFromFieldEntries(globalDebugFields))

      setTrialRunning(true)
      const executions = await streamWorkflow(toSingleNodeTestWorkflow(targetNode, allKnownNodes), payload, {
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
              tokenUsage: execution.tokenUsage ?? prev[nodeId]?.tokenUsage,
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
            tokenUsage: fallbackExecution.tokenUsage ?? prev[nodeId]?.tokenUsage,
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
    clearTrialRunEdgeStyles,
    clearTrialRunTimers,
    globalDebugCombinedJson,
    globalDebugFields,
    globalDebugJsonMode,
    nodes,
    syncNodeTrialRunExecution,
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
      setTrialRunExecutions({})
      clearNodeExecutionPanelExpansion()
      clearTrialRunEdgeStyles()
    },
    onNodeDeleted: (nodeId) => {
      setTrialRunExecutions((prev) => {
        const next = { ...prev }
        delete next[nodeId]
        return next
      })
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
    }
  }, [abortTrialRunStream, clearTrialRunEdgeStyles, clearTrialRunTimers])

  const startTrialRun = useCallback(async () => {
    clearTrialRunTimers()
    abortTrialRunStream()
    clearTrialRunEdgeStyles()
    setTrialRunOpen(true)
    setSingleNodeTrialOpen(false)
    setTrialRunExecutions({})
    clearNodeExecutionPanelExpansion()
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
          setTrialRunExecutions((prev) => {
            const mergedExecution = {
              ...execution,
              timeline: [...(prev[execution.nodeId]?.timeline ?? []), ...(execution.timeline ?? [])].slice(-80),
              degraded: prev[execution.nodeId]?.degraded || execution.degraded,
              tokenUsage: execution.tokenUsage ?? prev[execution.nodeId]?.tokenUsage,
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
    clearNodeExecutionPanelExpansion()
    clearTrialRunEdgeStyles()
    clearAllNodeTrialRunExecutions()
  }, [abortTrialRunStream, clearAllNodeTrialRunExecutions, clearTrialRunEdgeStyles, clearTrialRunTimers])

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
