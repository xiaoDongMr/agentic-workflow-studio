import type { WorkflowDocument, WorkflowNode } from '@/types/workflow'
import type { WorkflowPatch } from '@/features/workflow/assistant/types'

export function applyWorkflowPatch(
  workflow: WorkflowDocument,
  patch: WorkflowPatch,
): WorkflowDocument {
  let next = structuredClone(workflow)

  patch.operations.forEach((operation) => {
    if (operation.op === 'replace_workflow') {
      next = structuredClone(operation.workflow)
      return
    }

    if (operation.op === 'add_node') {
      if (next.nodes.some((node) => node.id === operation.node.id)) {
        throw new Error(`节点 ID 已存在：${operation.node.id}`)
      }
      next.nodes.push(structuredClone(operation.node))
      return
    }

    if (operation.op === 'update_node') {
      let updated = false
      next.nodes = updateNodeTree(next.nodes, operation.nodeId, (node) => {
        updated = true
        return {
          ...node,
          ...operation.partial,
          config: operation.partial.config
            ? { ...node.config, ...operation.partial.config }
            : node.config,
        }
      })
      if (!updated) {
        throw new Error(`找不到待更新节点：${operation.nodeId}`)
      }
      return
    }

    if (operation.op === 'delete_node') {
      next.nodes = next.nodes.filter((node) => node.id !== operation.nodeId)
      next.edges = next.edges.filter(
        (edge) => edge.source !== operation.nodeId && edge.target !== operation.nodeId,
      )
      return
    }

    if (operation.op === 'add_edge') {
      if (next.edges.some((edge) => edge.id === operation.edge.id)) {
        throw new Error(`连线 ID 已存在：${operation.edge.id}`)
      }
      next.edges.push(structuredClone(operation.edge))
      return
    }

    if (operation.op === 'update_metadata') {
      next = {
        ...next,
        name: operation.name ?? next.name,
        description: operation.description ?? next.description,
      }
      return
    }

    next.edges = next.edges.filter((edge) => edge.id !== operation.edgeId)
  })

  assertWorkflowReferences(next)
  return next
}

function updateNodeTree(
  nodes: WorkflowNode[],
  nodeId: string,
  updater: (node: WorkflowNode) => WorkflowNode,
): WorkflowNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return updater(node)
    }
    const bodyNodes = node.config.loopBodyNodes ?? []
    if (bodyNodes.length === 0) {
      return node
    }
    return {
      ...node,
      config: {
        ...node.config,
        loopBodyNodes: updateNodeTree(bodyNodes, nodeId, updater),
      },
    }
  })
}

function assertWorkflowReferences(workflow: WorkflowDocument) {
  const nodeIds = new Set(workflow.nodes.map((node) => node.id))
  if (nodeIds.size !== workflow.nodes.length) {
    throw new Error('工作流存在重复节点 ID')
  }
  workflow.edges.forEach((edge) => {
    if (!nodeIds.has(edge.source)) {
      throw new Error(`连线起点不存在：${edge.source}`)
    }
    if (!nodeIds.has(edge.target)) {
      throw new Error(`连线终点不存在：${edge.target}`)
    }
  })
}
