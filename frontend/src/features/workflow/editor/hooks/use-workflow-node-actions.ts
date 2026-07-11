import { useCallback, useRef, type RefObject } from 'react'
import type { WorkflowNodeJSON } from '@flowgram.ai/free-layout-core'
import { WorkflowNodePortsData } from '@flowgram.ai/free-layout-core'
import type { FreeLayoutPluginContext } from '@flowgram.ai/free-layout-editor'
import { WorkflowNodePanelService } from '@flowgram.ai/free-node-panel-plugin'

import {
  CANVAS_OFFSET_X,
  CANVAS_OFFSET_Y,
  paletteToNodeType,
} from '@/features/workflow/editor/workflow-editor.config'
import type {
  AddNodeOptions,
  FlowgramNodeData,
  NodePaletteKey,
} from '@/features/workflow/editor/workflow-editor.types'
import {
  buildWorkflowNodePorts,
  createNodeData,
  fromFlowgramJSON,
  getNextNodeCanvasPosition,
  getNodeEntityMeta,
  normalizeNodeData,
  workflowNodeToFlowgramNode,
} from '@/features/workflow/editor/workflow-editor.utils'
import {
  LOOP_CANVAS_ANCHOR_NODE_TYPE,
  normalizeLoopBodyEdges,
} from '@/features/workflow/editor/loop-node.utils'
import type { WorkflowEdge, WorkflowNode } from '@/types/workflow'

const NODE_COPY_OFFSET = 36
const LOOP_CHILD_START_X = 220
const LOOP_CHILD_START_Y = 172
const LOOP_CHILD_GAP_X = 360
const DISALLOWED_LOOP_CHILD_TYPES: WorkflowNode['type'][] = ['start', 'loop', 'loop-start', 'loop-end']

interface UseWorkflowNodeActionsOptions {
  ctxRef: RefObject<FreeLayoutPluginContext | null>
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  selectedNodeId: string
  onSelectNode: (nodeId: string) => void
  setWorkflowGraph: (nodes: WorkflowNode[], edges: WorkflowEdge[]) => void
  onBeforeQuickAdd?: () => void
  onNodeDeleted?: (nodeId: string) => void
}

export function useWorkflowNodeActions({
  ctxRef,
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
  setWorkflowGraph,
  onBeforeQuickAdd,
  onNodeDeleted,
}: UseWorkflowNodeActionsOptions) {
  const nodePanelOpenRef = useRef(false)
  const createNodeByType = useCallback(
    (
      type: WorkflowNode['type'],
      options?: {
        connectFromNodeId?: string
        sourcePortID?: string | number
        parentNodeId?: string
        loopSourceNodeId?: string
        position?: { x: number; y: number }
        selectCreated?: boolean
        ignoreSelectedNode?: boolean
      },
    ) => {
      const ctx = ctxRef.current
      if (!ctx) {
        return
      }

      const allNodes = ctx.document.getAllNodes()
      const selectedNode = selectedNodeId
        ? allNodes.find((node) => String(node.id) === selectedNodeId)
        : undefined
      const selectedNodeType = selectedNode ? getWorkflowNodeType(selectedNode) : ''
      const explicitFromNode = options?.connectFromNodeId
        ? allNodes.find((node) => String(node.id) === options.connectFromNodeId)
        : undefined
      const explicitFromLoopParentId = explicitFromNode ? getLoopParentNodeId(explicitFromNode, allNodes) : undefined
      const parentNodeId = options?.parentNodeId ?? explicitFromLoopParentId
      const parentNode = parentNodeId
        ? allNodes.find((node) => String(node.id) === parentNodeId)
        : undefined
      const shouldIgnoreSelectedNode = options?.ignoreSelectedNode === true

      if (parentNode && DISALLOWED_LOOP_CHILD_TYPES.includes(type)) {
        return
      }

      const fromNodeId = parentNode && selectedNodeType === 'loop' && !options?.connectFromNodeId
        ? undefined
        : options?.connectFromNodeId ?? (parentNode || shouldIgnoreSelectedNode ? undefined : selectedNodeId)
      const fromNode = fromNodeId
        ? allNodes.find((node) => String(node.id) === fromNodeId)
        : undefined

      const fromNodeLike = fromNode ? getNodeEntityMeta(fromNode) : undefined
      const position = parentNode
        ? getNextLoopChildPosition(parentNode, options?.position)
        : options?.position
          ? {
            x: options.position.x + CANVAS_OFFSET_X,
            y: options.position.y + CANVAS_OFFSET_Y,
          }
          : getNextNodeCanvasPosition(fromNodeLike, edges)

      const existingIds = new Set(allNodes.map((node) => String(node.id)))
      const nodeId = createUniqueNodeId(type, existingIds)
      const nodeData = createNodeData(type)
      const existingTitles = new Set(
        allNodes.filter((node) => String(getWorkflowNodeType(node)) !== LOOP_CANVAS_ANCHOR_NODE_TYPE).map((node) => {
          const nodeJson = node.toJSON() as WorkflowNodeJSON & { data?: Partial<FlowgramNodeData> }
          return normalizeNodeData(nodeJson.data, nodeJson.type as WorkflowNode['type']).title
        }),
      )
      nodeData.title = createUniqueNodeTitle(nodeData.title, existingTitles)
      const nodeJson: Partial<WorkflowNodeJSON> = {
        id: nodeId,
        meta: {
          position,
          defaultPorts: buildWorkflowNodePorts(nodeData),
        },
        data: nodeData,
      }
      if (type === 'loop') {
        const loopNode: WorkflowNode = {
          id: nodeId,
          title: nodeData.title,
          type,
          description: nodeData.description,
          position: { x: 0, y: 0 },
          status: nodeData.status,
          inputs: nodeData.inputs,
          outputs: nodeData.outputs,
          config: nodeData.config,
        }
        const loopNodeJson = workflowNodeToFlowgramNode(loopNode, false)
        nodeJson.data = loopNodeJson.data
        nodeJson.blocks = loopNodeJson.blocks
        nodeJson.edges = loopNodeJson.edges
      }
      const createdNode = ctx.document.createWorkflowNodeByType(type, position, nodeJson, parentNodeId)

      if (fromNode) {
        ctx.document.linesManager.createLine({
          from: String(fromNode.id),
          fromPort: options?.sourcePortID,
          to: String(createdNode.id),
        })
      } else if (options?.loopSourceNodeId) {
        appendLoopHomeEdge(parentNode, parentNodeId, options.loopSourceNodeId, String(createdNode.id), options?.sourcePortID)
      }

      const nextDocumentJson = ctx.document.toJSON()
      const [nextNodes, nextEdges] = fromFlowgramJSON(nextDocumentJson)
      if (parentNodeId && parentNode) {
        const parentWorkflowNode = nextNodes.find((node) => node.id === parentNodeId)
        if (parentWorkflowNode) {
          syncNodeData(parentNode, {
            config: {
              loopBodyNodes: parentWorkflowNode.config.loopBodyNodes ?? [],
              loopBodyEdges: parentWorkflowNode.config.loopBodyEdges ?? [],
            },
          })
        }
      }

      const nextSelectedId = String(createdNode.id)
      if (options?.selectCreated !== false) {
        onSelectNode(nextSelectedId)
      }
      setWorkflowGraph(nextNodes, nextEdges)
    },
    [ctxRef, edges, onSelectNode, selectedNodeId, setWorkflowGraph],
  )

  const addNode = useCallback((key: NodePaletteKey, options?: AddNodeOptions) => {
    createNodeByType(paletteToNodeType[key], options)
  }, [createNodeByType])

  const openNodePanel = useCallback(
    async (options?: AddNodeOptions) => {
      const ctx = ctxRef.current
      if (!ctx || nodePanelOpenRef.current) {
        return
      }

      nodePanelOpenRef.current = true

      try {
        const allNodes = ctx.document.getAllNodes()
        const selectedNode = selectedNodeId
          ? allNodes.find((node) => String(node.id) === selectedNodeId)
          : undefined
        const selectedNodeType = selectedNode ? getWorkflowNodeType(selectedNode) : ''
        const explicitFromNode = options?.connectFromNodeId
          ? allNodes.find((node) => String(node.id) === options.connectFromNodeId)
          : undefined
        const explicitFromLoopParentId = explicitFromNode ? getLoopParentNodeId(explicitFromNode, allNodes) : undefined
        const parentNodeId = options?.parentNodeId ?? explicitFromLoopParentId
        const parentNode = parentNodeId
          ? allNodes.find((node) => String(node.id) === parentNodeId)
          : undefined
        const shouldIgnoreSelectedNode = options?.ignoreSelectedNode === true
        const fromNodeId = parentNode && selectedNodeType === 'loop' && !options?.connectFromNodeId
          ? undefined
          : options?.connectFromNodeId ?? (parentNode || shouldIgnoreSelectedNode ? undefined : selectedNodeId)
        const fromNode = fromNodeId
          ? allNodes.find((node) => String(node.id) === fromNodeId)
          : undefined
        const fromNodeLike = fromNode ? getNodeEntityMeta(fromNode) : undefined
        const panelPosition = parentNode
          ? options?.panelPosition ?? getLoopPanelPosition(parentNode)
          : options?.panelPosition
            ?? (options?.position
              ? {
                x: options.position.x + CANVAS_OFFSET_X,
                y: options.position.y + CANVAS_OFFSET_Y,
              }
              : getNextNodeCanvasPosition(fromNodeLike, edges))
        const sourceTitle = parentNodeId
          ? `${nodes.find((node) => node.id === parentNodeId)?.title ?? '循环节点'} · 循环体`
          : fromNodeId
            ? nodes.find((node) => node.id === fromNodeId)?.title ?? ''
            : ''

        const nodePanelService = ctx.get(WorkflowNodePanelService)
        const result = await nodePanelService.singleSelectNodePanel({
          position: panelPosition,
          panelProps: {
            sourceTitle,
            disallowNodeTypes: parentNode ? DISALLOWED_LOOP_CHILD_TYPES : [],
          },
          containerNode: parentNode ?? fromNode,
        })

        if (!result?.nodeType) {
          return
        }

        createNodeByType(result.nodeType as WorkflowNode['type'], {
          connectFromNodeId: fromNodeId,
          parentNodeId,
          loopSourceNodeId: options?.loopSourceNodeId,
          sourcePortID: options?.sourcePortID,
          position: options?.position,
          selectCreated: options?.selectCreated,
          ignoreSelectedNode: options?.ignoreSelectedNode,
        })
      } finally {
        nodePanelOpenRef.current = false
      }
    },
    [createNodeByType, ctxRef, edges, nodes, selectedNodeId],
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

      const nextData = syncNodeData(targetNode, partial)
      targetNode.getData(WorkflowNodePortsData).updateAllPorts(buildWorkflowNodePorts(nextData))

      setWorkflowGraph(...fromFlowgramJSON(ctx.document.toJSON()))
    },
    [ctxRef, selectedNodeId, setWorkflowGraph],
  )

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
            title: `${data.title}副本`,
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
  }, [ctxRef, onSelectNode, setWorkflowGraph])

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
    onNodeDeleted?.(nodeId)
    setWorkflowGraph(...fromFlowgramJSON(ctx.document.toJSON()))
  }, [ctxRef, onNodeDeleted, onSelectNode, selectedNodeId, setWorkflowGraph])

  const openQuickAddPanel = useCallback((
    nodeId: string,
    sourcePortID?: string | number,
    panelPosition?: { x: number; y: number },
    position?: { x: number; y: number },
  ) => {
    onBeforeQuickAdd?.()
    void openNodePanel({ connectFromNodeId: nodeId, sourcePortID, panelPosition, position })
  }, [onBeforeQuickAdd, openNodePanel])

  return {
    addNode,
    copyNode,
    deleteNode,
    openNodePanel,
    openQuickAddPanel,
    updateSelectedNode,
  }
}

function getWorkflowNodeType(node: { toJSON: () => unknown }) {
  const nodeJson = node.toJSON() as WorkflowNodeJSON
  return String(nodeJson.type) as WorkflowNode['type']
}

function syncNodeData(
  node: { toJSON: () => unknown },
  partial: Partial<Omit<WorkflowNode, 'config'>> & {
    config?: Partial<WorkflowNode['config']>
  },
) {
  const nodeJson = node.toJSON() as WorkflowNodeJSON & { data?: Partial<FlowgramNodeData> }
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

  ;(node as unknown as { updateExtInfo?: (data: FlowgramNodeData, fullUpdate?: boolean) => void }).updateExtInfo?.(
    nextData,
    true,
  )
  return nextData
}

function appendLoopHomeEdge(
  parentNode: { toJSON: () => unknown } | undefined,
  loopNodeId: string | undefined,
  sourceNodeId: string,
  targetNodeId: string,
  sourcePortID?: string | number,
) {
  if (!parentNode || !loopNodeId) {
    return
  }

  const parentJson = parentNode.toJSON() as WorkflowNodeJSON & { data?: Partial<FlowgramNodeData> }
  const parentData = normalizeNodeData(parentJson.data, 'loop')
  const hasHomeEdge = parentData.config.loopBodyEdges?.some((edge) => edge.source === sourceNodeId)
  if (hasHomeEdge) {
    return
  }

  const nextEdges = normalizeLoopBodyEdges(loopNodeId, [
    ...(parentData.config.loopBodyEdges ?? []),
    {
      id: `${sourceNodeId}-${targetNodeId}`,
      source: sourceNodeId,
      target: targetNodeId,
      sourcePortID,
    },
  ])

  syncNodeData(parentNode, {
    config: {
      loopBodyEdges: nextEdges,
    },
  })
}

function getNodeCanvasPosition(node: { toJSON: () => unknown }) {
  const nodeJson = node.toJSON() as WorkflowNodeJSON
  const position = (nodeJson.meta as { position?: { x?: number; y?: number } } | undefined)?.position
  return {
    x: position?.x ?? CANVAS_OFFSET_X,
    y: position?.y ?? CANVAS_OFFSET_Y,
  }
}

function getLoopParentNodeId(
  node: { toJSON: () => unknown },
  allNodes: Array<{ id: string | number; toJSON: () => unknown }>,
) {
  const entity = node as {
    parent?: { id?: string | number }
    originParent?: { id?: string | number }
  }
  const nodeJson = node.toJSON() as WorkflowNodeJSON & {
    parentID?: string | number
    parentId?: string | number
  }
  const parentId = entity.parent?.id ?? entity.originParent?.id ?? nodeJson.parentID ?? nodeJson.parentId
  if (!parentId) {
    return undefined
  }

  const parentNode = allNodes.find((item) => String(item.id) === String(parentId))
  return parentNode && getWorkflowNodeType(parentNode) === 'loop' ? String(parentId) : undefined
}

function getLoopPanelPosition(parentNode: { toJSON: () => unknown }) {
  const position = getNodeCanvasPosition(parentNode)
  return {
    x: position.x + 76,
    y: position.y + LOOP_CHILD_START_Y - 12,
  }
}

function getNextLoopChildPosition(parentNode: { toJSON: () => unknown }, explicitPosition?: { x: number; y: number }) {
  if (explicitPosition) {
    return explicitPosition
  }

  const parentJson = parentNode.toJSON() as WorkflowNodeJSON
  const childBlocks = parentJson.blocks?.filter((block) => {
    const blockType = String(block.type)
    return blockType !== 'loop-start'
      && blockType !== 'loop-end'
      && blockType !== LOOP_CANVAS_ANCHOR_NODE_TYPE
  }) ?? []

  if (childBlocks.length > 0) {
    const rightmost = childBlocks.reduce((latest, block) => {
      const latestPosition = (latest.meta as { position?: { x?: number; y?: number } } | undefined)?.position
      const blockPosition = (block.meta as { position?: { x?: number; y?: number } } | undefined)?.position
      return (blockPosition?.x ?? 0) > (latestPosition?.x ?? 0) ? block : latest
    }, childBlocks[0])
    const position = (rightmost.meta as { position?: { x?: number; y?: number } } | undefined)?.position

    return {
      x: (position?.x ?? LOOP_CHILD_START_X) + LOOP_CHILD_GAP_X,
      y: position?.y ?? LOOP_CHILD_START_Y,
    }
  }

  return {
    x: LOOP_CHILD_START_X,
    y: LOOP_CHILD_START_Y,
  }
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

function createUniqueNodeTitle(baseTitle: string, existingTitles: Set<string>) {
  if (!existingTitles.has(baseTitle)) {
    return baseTitle
  }

  let index = 2
  while (existingTitles.has(`${baseTitle}${index}`)) {
    index += 1
  }
  return `${baseTitle}${index}`
}
