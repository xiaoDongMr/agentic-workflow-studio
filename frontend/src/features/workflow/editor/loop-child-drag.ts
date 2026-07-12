import type { MouseEvent as ReactMouseEvent } from 'react'
import type { FreeLayoutPluginContext, WorkflowJSON } from '@flowgram.ai/free-layout-editor'
import {
  WorkflowDragService,
  WorkflowOperationBaseService,
  WorkflowSelectService,
  type WorkflowNodeEntity,
  type WorkflowNodeJSON,
} from '@flowgram.ai/free-layout-core'

import {
  DEFAULT_LOOP_CANVAS_HEIGHT,
  DEFAULT_LOOP_CANVAS_WIDTH,
  getAutoLoopBodyCanvasSize,
  LOOP_CANVAS_ANCHOR_NODE_TYPE,
} from '@/features/workflow/editor/loop-node.utils'
import type { FlowgramNodeData } from '@/features/workflow/editor/workflow-editor.types'
import {
  fromFlowgramJSON,
  normalizeNodeData,
} from '@/features/workflow/editor/workflow-editor.utils'
import type { WorkflowEdge, WorkflowNode } from '@/types/workflow'

const LOOP_CHILD_LEFT_RESERVED = 220
const LOOP_CHILD_TOP_RESERVED = 172

type PatchCleanupHost = {
  __awLoopPatchCleanups?: Array<() => void>
}

export function flattenFlowgramNodes(nodes: WorkflowNodeEntity[]): WorkflowNodeEntity[] {
  return nodes.flatMap((node) => [
    node,
    ...flattenFlowgramNodes([...(node.blocks ?? [])]),
  ])
}

export function findFlowgramNodeById(ctx: FreeLayoutPluginContext, nodeId: string) {
  return flattenFlowgramNodes(ctx.document.getAllNodes()).find((node) => String(node.id) === nodeId)
}

export function patchLoopChildDragIsolation(ctx: FreeLayoutPluginContext) {
  const dragService = ctx.get(WorkflowDragService) as unknown as {
    __awLoopChildDragPatched?: boolean
    __awLoopChildDragStartPatched?: boolean
    resetContainerInternalPosition?: (nodes: WorkflowNodeEntity[]) => void
    startDragSelectedNodes?: (event: MouseEvent | ReactMouseEvent) => Promise<boolean>
    onNodesDrag?: (listener: (event: LoopDragEvent) => void) => { dispose?: () => void }
  }
  const selectService = ctx.get(WorkflowSelectService) as unknown as {
    selectNode?: (node: WorkflowNodeEntity) => void
  }
  if (!dragService.__awLoopChildDragStartPatched && typeof dragService.startDragSelectedNodes === 'function') {
    const startDragSelectedNodes = dragService.startDragSelectedNodes.bind(dragService)
    dragService.startDragSelectedNodes = (event: MouseEvent | ReactMouseEvent) => {
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
    registerPatchCleanup(dragService, () => {
      dragService.startDragSelectedNodes = startDragSelectedNodes
      dragService.__awLoopChildDragStartPatched = false
    })
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
    registerPatchCleanup(dragService, () => {
      dragService.resetContainerInternalPosition = resetContainerInternalPosition
      dragService.__awLoopChildDragPatched = false
    })
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
  registerPatchCleanup(layout, () => {
    layout.updateAffectedTransform = updateAffectedTransform
    layout.__awLoopChildTransformPatched = false
  })
}

export function disposeLoopChildEditorPatches(ctx: FreeLayoutPluginContext) {
  const dragService = ctx.get(WorkflowDragService) as unknown as PatchCleanupHost
  const layout = ctx.document.layout as unknown as PatchCleanupHost
  runPatchCleanups(dragService)
  runPatchCleanups(layout)
}

export function lockAllLoopChildPositions(ctx: FreeLayoutPluginContext) {
  const operationService = ctx.get(WorkflowOperationBaseService) as WorkflowNodePositionService
  ctx.document.getAllNodes()
    .filter((node) => getWorkflowNodeType(node) === 'loop')
    .forEach((loopNode) => lockLoopChildPositions(ctx, loopNode, operationService))
}

export function syncLoopChildLayout(ctx: FreeLayoutPluginContext, loopNodeId: string) {
  const loopNode = findFlowgramNodeById(ctx, loopNodeId)
  if (!loopNode || getWorkflowNodeType(loopNode) !== 'loop') {
    return
  }
  const operationService = ctx.get(WorkflowOperationBaseService) as WorkflowNodePositionService
  lockLoopChildPositions(ctx, loopNode, operationService)
}

export function getWorkflowJSONWithLivePositions(ctx: FreeLayoutPluginContext): WorkflowJSON {
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

export function installNodeDragEndPersistence(
  ctx: FreeLayoutPluginContext,
  commitWorkflowGraph: (nodes: WorkflowNode[], edges: WorkflowEdge[]) => void,
) {
  const dragService = ctx.get(WorkflowDragService) as unknown as {
    __awNodeDragEndPersistenceInstalled?: boolean
    onNodesDrag?: (listener: (event: LoopDragEvent) => void) => { dispose?: () => void }
  }
  if (dragService.__awNodeDragEndPersistenceInstalled || typeof dragService.onNodesDrag !== 'function') {
    return
  }

  const disposable = dragService.onNodesDrag((event) => {
    if (event.type !== 'onDragEnd') {
      return
    }
    window.setTimeout(() => {
      lockAllLoopChildPositions(ctx)
      const liveJson = getWorkflowJSONWithLivePositions(ctx)
      const nextGraph = fromFlowgramJSON(liveJson)
      commitWorkflowGraph(...nextGraph)
    }, 0)
  })
  dragService.__awNodeDragEndPersistenceInstalled = true
  registerPatchCleanup(dragService, () => {
    disposable?.dispose?.()
    dragService.__awNodeDragEndPersistenceInstalled = false
  })
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

  const disposable = dragService.onNodesDrag((event) => {
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
  registerPatchCleanup(dragService, () => {
    disposable?.dispose?.()
    dragService.__awLoopParentPositionGuardInstalled = false
  })
}

function registerPatchCleanup(host: object, cleanup: () => void) {
  const cleanupHost = host as PatchCleanupHost
  cleanupHost.__awLoopPatchCleanups = cleanupHost.__awLoopPatchCleanups ?? []
  cleanupHost.__awLoopPatchCleanups.push(cleanup)
}

function runPatchCleanups(host: object) {
  const cleanupHost = host as PatchCleanupHost
  const cleanups = cleanupHost.__awLoopPatchCleanups ?? []
  cleanupHost.__awLoopPatchCleanups = []
  cleanups.slice().reverse().forEach((cleanup) => cleanup())
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
  syncLoopCanvasSizeForChildren(ctx, loopNode)
}

function syncLoopCanvasSizeForChildren(ctx: FreeLayoutPluginContext, loopNode: WorkflowNodeEntity) {
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

  return {
    minX: Math.max(halfWidth + margin, LOOP_CHILD_LEFT_RESERVED),
    minY: LOOP_CHILD_TOP_RESERVED,
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

function getWorkflowNodeType(node: WorkflowNodeEntity) {
  const json = node.toJSON?.() as WorkflowNodeJSON | undefined
  return String(json?.type ?? node.flowNodeType ?? '')
}
