import type {
  WorkflowNodeJSON,
  WorkflowPortEntity,
} from '@flowgram.ai/free-layout-core'

export type LoopScopedNode = {
  id: string | number
  parent?: LoopScopedNode
  toJSON?: () => unknown
  flowNodeType?: string | number
}

export function getLoopScopeId(node: LoopScopedNode | undefined) {
  let parent = node?.parent
  while (parent) {
    if (getFlowgramNodeType(parent) === 'loop') {
      return String(parent.id)
    }
    parent = parent.parent
  }
  return undefined
}

export function canConnectWithinSameLoopScope(
  fromNode: LoopScopedNode | undefined,
  toNode: LoopScopedNode | undefined,
) {
  if (!fromNode || !toNode) {
    return false
  }
  return getLoopScopeId(fromNode) === getLoopScopeId(toNode)
}

export function canConnectPortsWithinSameLoopScope(fromPort: WorkflowPortEntity, toPort: WorkflowPortEntity) {
  return canConnectWithinSameLoopScope(fromPort.node, toPort.node)
}

function getFlowgramNodeType(node: LoopScopedNode) {
  const nodeJson = node.toJSON?.() as WorkflowNodeJSON | undefined
  return String(nodeJson?.type ?? node.flowNodeType ?? '')
}
