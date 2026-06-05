import { useCallback, useState, type RefObject } from 'react'
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
} from '@/features/workflow/editor/workflow-editor.utils'
import type { WorkflowEdge, WorkflowNode } from '@/types/workflow'

const NODE_COPY_OFFSET = 36

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
  const [quickAddNodeId, setQuickAddNodeId] = useState('')

  const createNodeByType = useCallback(
    (
      type: WorkflowNode['type'],
      options?: {
        connectFromNodeId?: string
        sourcePortID?: string | number
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
      const nodeData = createNodeData(type)
      const existingTitles = new Set(
        ctx.document.getAllNodes().map((node) => {
          const nodeJson = node.toJSON() as WorkflowNodeJSON & { data?: Partial<FlowgramNodeData> }
          return normalizeNodeData(nodeJson.data, nodeJson.type as WorkflowNode['type']).title
        }),
      )
      nodeData.title = createUniqueNodeTitle(nodeData.title, existingTitles)
      const createdNode = ctx.document.createWorkflowNodeByType(type, position, {
        id: nodeId,
        meta: {
          defaultPorts: buildWorkflowNodePorts(nodeData),
        },
        data: nodeData,
      })

      if (fromNode) {
        ctx.document.linesManager.createLine({
          from: String(fromNode.id),
          fromPort: options?.sourcePortID,
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
    [ctxRef, edges, onSelectNode, selectedNodeId, setWorkflowGraph],
  )

  const addNode = useCallback((key: NodePaletteKey, options?: AddNodeOptions) => {
    createNodeByType(paletteToNodeType[key], options)
  }, [createNodeByType])

  const openNodePanel = useCallback(
    async (options?: AddNodeOptions) => {
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
          sourcePortID: options?.sourcePortID,
          selectCreated: options?.selectCreated,
        })
      } finally {
        setQuickAddNodeId('')
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

  const openQuickAddPanel = useCallback((nodeId: string, sourcePortID?: string | number) => {
    onBeforeQuickAdd?.()
    void openNodePanel({ connectFromNodeId: nodeId, sourcePortID })
  }, [onBeforeQuickAdd, openNodePanel])

  const closeQuickAddPanel = useCallback(() => {
    setQuickAddNodeId('')
  }, [])

  return {
    addNode,
    closeQuickAddPanel,
    copyNode,
    deleteNode,
    openNodePanel,
    openQuickAddPanel,
    quickAddNodeId,
    updateSelectedNode,
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
