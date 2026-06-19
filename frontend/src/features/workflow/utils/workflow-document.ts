import { mockWorkflow } from '@/features/workflow/mock-data'
import type { WorkflowDocument, WorkflowEdge, WorkflowNode } from '@/types/workflow'

export function findWorkflowNodeById(nodes: WorkflowNode[], nodeId: string): WorkflowNode | undefined {
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

export function flattenWorkflowNodes(nodes: WorkflowNode[]): WorkflowNode[] {
  return nodes.flatMap((node) => [node, ...flattenWorkflowNodes(node.config.loopBodyNodes ?? [])])
}

export function flattenWorkflowEdges(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowEdge[] {
  return [
    ...edges,
    ...nodes.flatMap((node) => [
      ...(node.config.loopBodyEdges ?? []),
      ...flattenWorkflowEdges(node.config.loopBodyNodes ?? [], []),
    ]),
  ]
}

export function createNewWorkflowDocument(): WorkflowDocument {
  const now = Date.now().toString(36)
  const [startNode] = mockWorkflow.nodes

  return {
    id: `workflow-${now}`,
    name: '未命名项目',
    description: '从开始节点出发，继续添加大模型、选择器、循环或代码节点。',
    version: 'v0.1.0',
    nodes: [
      {
        ...startNode,
        id: 'start',
        title: '开始节点',
        status: 'idle',
        position: { x: 80, y: 120 },
        config: {
          ...startNode.config,
          prompt: '用户输入会在这里进入工作流。',
        },
      },
    ],
    edges: [],
  }
}

export function getWorkflowSignature(workflow: WorkflowDocument) {
  return JSON.stringify(workflow)
}
