import type { WorkflowJSON } from '@flowgram.ai/free-layout-editor'

import type { WorkflowEdge, WorkflowNode, WorkflowNodeIO, WorkflowValueType } from '@/types/workflow'

export const LOOP_START_NODE_TYPE = 'loop-start'
export const LOOP_END_NODE_TYPE = 'loop-end'
export const LOOP_CANVAS_ANCHOR_NODE_TYPE = 'loop-canvas-anchor'

const LOOP_START_NODE_SUFFIX = '__loop_start'
const LOOP_END_NODE_SUFFIX = '__loop_end'
const LOOP_CANVAS_ANCHOR_SUFFIX = '__canvas_anchor'
export const DEFAULT_LOOP_CANVAS_WIDTH = 760
export const DEFAULT_LOOP_CANVAS_HEIGHT = 400
const LOOP_NODE_WIDTH = 230
const LOOP_NODE_HEIGHT = 190
const LOOP_CANVAS_CONTENT_PADDING_X = 112
const LOOP_CANVAS_CONTENT_PADDING_Y = 96
const LOOP_CANVAS_ROW_START_X = 180
const LOOP_CANVAS_ROW_GAP_X = 240
const LOOP_INDEX_OUTPUT_NAME = 'index'

export type LoopBodyNodeLayout = {
  type: string
  position: { x: number; y: number }
  size?: { width?: number; height?: number }
}

export function getLoopStartNodeId(loopNodeId: string) {
  return `${loopNodeId}${LOOP_START_NODE_SUFFIX}`
}

export function getLoopEndNodeId(loopNodeId: string) {
  return `${loopNodeId}${LOOP_END_NODE_SUFFIX}`
}

export function getLoopCanvasAnchorNodeId(loopNodeId: string) {
  return `${loopNodeId}${LOOP_CANVAS_ANCHOR_SUFFIX}`
}

export function isLoopInternalNodeType(type: string) {
  return type === LOOP_START_NODE_TYPE
    || type === LOOP_END_NODE_TYPE
    || type === LOOP_CANVAS_ANCHOR_NODE_TYPE
}

export function filterLoopEndpointNodes(bodyNodes: WorkflowNode[]): WorkflowNode[] {
  return bodyNodes.filter((node) => !isLoopInternalNodeType(node.type))
}

export function createLoopEntryOutputs(loopNode: WorkflowNode): WorkflowNodeIO[] {
  const loopMode = loopNode.config.loopMode ?? 'array'
  const arrayInput = loopNode.inputs[0]
  const outputs: WorkflowNodeIO[] = loopMode === 'array'
    ? [{
        name: 'item',
        type: getArrayElementType(arrayInput?.type ?? 'Array'),
        description: '当前元素：数组每一项的值，子图中固定引用 item',
      }]
    : []

  outputs.push({
    name: LOOP_INDEX_OUTPUT_NAME,
    type: 'Integer',
    description: loopMode === 'array' ? 'index 下标：当前元素在数组中的位置，从 0 开始' : 'index 下标：当前循环轮次，从 0 开始',
  })

  return outputs
}

function getArrayElementType(type: string): WorkflowValueType | string {
  const matched = type.match(/^Array<(.+)>$/)
  if (matched?.[1]) {
    return matched[1]
  }
  return type === 'Array' ? 'Object' : type
}

export function getLoopBodyCanvasSize(
  config: Pick<WorkflowNode['config'], 'loopCanvasWidth' | 'loopCanvasHeight'>,
  bodyNodes: LoopBodyNodeLayout[] = [],
) {
  const baseWidth = config.loopCanvasWidth ?? DEFAULT_LOOP_CANVAS_WIDTH
  const baseHeight = config.loopCanvasHeight ?? DEFAULT_LOOP_CANVAS_HEIGHT
  const flowNodes = bodyNodes.filter((node) => !isLoopInternalNodeType(node.type))
  const contentRight = Math.max(
    0,
    ...flowNodes.map((node) => getLoopNodeRight(node)),
  )
  const contentBottom = Math.max(
    0,
    ...flowNodes.map((node) => getLoopNodeBottom(node)),
  )

  if (flowNodes.length === 0) {
    return {
      width: baseWidth,
      height: baseHeight,
    }
  }

  return {
    width: Math.max(
      baseWidth,
      contentRight + LOOP_CANVAS_CONTENT_PADDING_X,
      flowNodes.length > 3 ? LOOP_CANVAS_ROW_START_X + flowNodes.length * LOOP_CANVAS_ROW_GAP_X : baseWidth,
    ),
    height: Math.max(baseHeight, contentBottom + LOOP_CANVAS_CONTENT_PADDING_Y),
  }
}

export function getAutoLoopBodyCanvasSize(bodyNodes: LoopBodyNodeLayout[] = []) {
  const flowNodes = bodyNodes.filter((node) => !isLoopInternalNodeType(node.type))
  const contentRight = Math.max(0, ...flowNodes.map(getLoopNodeRight))
  const contentBottom = Math.max(0, ...flowNodes.map(getLoopNodeBottom))
  const contentWidth = contentRight + LOOP_CANVAS_CONTENT_PADDING_X
  const contentHeight = contentBottom + LOOP_CANVAS_CONTENT_PADDING_Y

  return {
    width: Math.max(
      DEFAULT_LOOP_CANVAS_WIDTH,
      Math.ceil(contentWidth),
      flowNodes.length > 3 ? LOOP_CANVAS_ROW_START_X + flowNodes.length * LOOP_CANVAS_ROW_GAP_X : DEFAULT_LOOP_CANVAS_WIDTH,
    ),
    height: Math.max(DEFAULT_LOOP_CANVAS_HEIGHT, Math.ceil(contentHeight)),
  }
}

export function getLoopNodeRenderSize(canvasSize: { width: number; height: number }) {
  return {
    width: canvasSize.width + 32,
    height: canvasSize.height + 142,
  }
}

function getLoopNodeRight(node: LoopBodyNodeLayout) {
  return node.position.x + (node.size?.width ?? LOOP_NODE_WIDTH) / 2
}

function getLoopNodeBottom(node: LoopBodyNodeLayout) {
  return node.position.y + (node.size?.height ?? LOOP_NODE_HEIGHT) / 2
}

export function createLoopCanvasAnchorNode(loopNode: WorkflowNode): WorkflowJSON['nodes'][number] {
  const loopNodeId = loopNode.id

  return {
    id: getLoopCanvasAnchorNodeId(loopNodeId),
    type: LOOP_CANVAS_ANCHOR_NODE_TYPE,
    meta: {
      position: {
        x: 58,
        y: 64,
      },
      size: {
        width: 58,
        height: 58,
      },
      defaultPorts: [{ type: 'output' }],
    },
    data: {
      title: '循环入口',
      description: '添加循环体节点',
      status: 'idle',
      kind: LOOP_CANVAS_ANCHOR_NODE_TYPE,
      config: {
        inputMappings: [],
      },
      inputs: [],
      outputs: createLoopEntryOutputs(loopNode),
    },
  } as WorkflowJSON['nodes'][number]
}

export function loopEdgeFromFlowgramEdge(
  loopNodeId: string,
  edge: WorkflowJSON['edges'][number],
  edgeIndex: number,
): WorkflowEdge {
  const anchorNodeId = getLoopCanvasAnchorNodeId(loopNodeId)

  return {
    id: `${edge.sourceNodeID}-${edge.targetNodeID}-${edgeIndex + 1}`,
    source: String(edge.sourceNodeID) === anchorNodeId ? loopNodeId : String(edge.sourceNodeID),
    target: String(edge.targetNodeID) === anchorNodeId ? loopNodeId : String(edge.targetNodeID),
    sourcePortID: edge.sourcePortID,
    targetPortID: edge.targetPortID,
  }
}

export function toVisibleLoopBodyEdges(loopNodeId: string, edge: WorkflowEdge): WorkflowEdge[] {
  if (edge.target === loopNodeId || isLoopInternalNodeId(edge.target, loopNodeId)) {
    return []
  }

  if (edge.source === loopNodeId) {
    return [{
      ...edge,
      source: getLoopCanvasAnchorNodeId(loopNodeId),
    }]
  }

  if (isLoopInternalNodeId(edge.source, loopNodeId)) {
    return []
  }

  return [edge]
}

export function normalizeLoopBodyEdges(loopNodeId: string, bodyEdges: WorkflowEdge[]): WorkflowEdge[] {
  const seen = new Set<string>()

  return bodyEdges.flatMap((edge, index) => {
    const source = getCanonicalLoopEdgeEndpoint(edge.source, loopNodeId, 'source')
    const target = getCanonicalLoopEdgeEndpoint(edge.target, loopNodeId, 'target')

    if (isInvalidLoopEdge(loopNodeId, source, target)) {
      return []
    }

    const nextEdge: WorkflowEdge = {
      id: `${source}-${target}-${index + 1}`,
      source,
      target,
      sourcePortID: edge.sourcePortID,
      targetPortID: edge.targetPortID,
    }
    const key = `${nextEdge.source}:${nextEdge.sourcePortID ?? ''}->${nextEdge.target}:${nextEdge.targetPortID ?? ''}`
    if (seen.has(key)) {
      return []
    }
    seen.add(key)
    return [nextEdge]
  })
}

function getCanonicalLoopEdgeEndpoint(
  nodeId: string,
  loopNodeId: string,
  direction: 'source' | 'target',
) {
  if (
    direction === 'source'
    && (
      nodeId === LOOP_START_NODE_TYPE
      || nodeId === getLoopStartNodeId(loopNodeId)
      || nodeId === getLoopCanvasAnchorNodeId(loopNodeId)
    )
  ) {
    return loopNodeId
  }

  if (
    direction === 'target'
    && (
      nodeId === LOOP_END_NODE_TYPE
      || nodeId === getLoopEndNodeId(loopNodeId)
    )
  ) {
    return loopNodeId
  }

  return nodeId
}

function isInvalidLoopEdge(loopNodeId: string, source: string, target: string) {
  return source === target
    || source === LOOP_END_NODE_TYPE
    || target === LOOP_START_NODE_TYPE
    || source === getLoopEndNodeId(loopNodeId)
    || target === getLoopStartNodeId(loopNodeId)
    || isLoopInternalNodeId(source, loopNodeId)
    || isLoopInternalNodeId(target, loopNodeId)
}

function isLoopInternalNodeId(nodeId: string, loopNodeId: string) {
  return nodeId === getLoopCanvasAnchorNodeId(loopNodeId)
    || nodeId === getLoopStartNodeId(loopNodeId)
    || nodeId === getLoopEndNodeId(loopNodeId)
}
