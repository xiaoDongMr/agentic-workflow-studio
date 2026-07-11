import type { WorkflowEdge, WorkflowNode } from '@/types/workflow'

type WorkflowGraph = [WorkflowNode[], WorkflowEdge[]]

export function sanitizeWorkflowGraph(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowGraph {
  const nodeScopes = buildNodeScopeMap(nodes)
  const rootEdges = edges.filter((edge) => validateWorkflowEdge(edge, nodeScopes, undefined))

  return [nodes.map((node) => sanitizeWorkflowNode(node, nodeScopes)), rootEdges]
}

export function isWorkflowGraphEqual(
  currentNodes: WorkflowNode[],
  currentEdges: WorkflowEdge[],
  nextNodes: WorkflowNode[],
  nextEdges: WorkflowEdge[],
) {
  return JSON.stringify(currentNodes) === JSON.stringify(nextNodes)
    && JSON.stringify(currentEdges) === JSON.stringify(nextEdges)
}

export function buildNodeScopeMap(nodes: WorkflowNode[]) {
  const nodeScopes = new Map<string, string | undefined>()

  const registerNodeScopes = (items: WorkflowNode[], loopScope?: string) => {
    items.forEach((node) => {
      nodeScopes.set(node.id, loopScope)
      if (node.type === 'loop') {
        registerNodeScopes(node.config.loopBodyNodes ?? [], node.id)
      }
    })
  }

  registerNodeScopes(nodes)
  return nodeScopes
}

export function validateWorkflowEdge(
  edge: WorkflowEdge,
  nodeScopes: Map<string, string | undefined>,
  loopScope: string | undefined,
) {
  return Boolean(edge.source)
    && Boolean(edge.target)
    && edge.source !== edge.target
    && nodeScopes.has(edge.source)
    && nodeScopes.has(edge.target)
    && resolveEdgeScope(edge.source, nodeScopes, loopScope) === loopScope
    && resolveEdgeScope(edge.target, nodeScopes, loopScope) === loopScope
}

function sanitizeWorkflowNode(node: WorkflowNode, nodeScopes: Map<string, string | undefined>): WorkflowNode {
  if (node.type !== 'loop') {
    return node
  }

  const loopScope = node.id
  const loopBodyEdges = (node.config.loopBodyEdges ?? []).filter((edge) => {
    return validateWorkflowEdge(edge, nodeScopes, loopScope) && edge.target !== loopScope
  })
  const loopBodyNodes = (node.config.loopBodyNodes ?? []).map((bodyNode) => {
    return sanitizeWorkflowNode(bodyNode, nodeScopes)
  })

  return {
    ...node,
    config: {
      ...node.config,
      loopBodyEdges,
      loopBodyNodes,
    },
  }
}

function resolveEdgeScope(
  nodeId: string,
  nodeScopes: Map<string, string | undefined>,
  loopScope: string | undefined,
) {
  return nodeId === loopScope ? loopScope : nodeScopes.get(nodeId)
}
