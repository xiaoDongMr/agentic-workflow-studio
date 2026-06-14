import type { WorkflowNode } from '@/types/workflow'

export interface FixedWorkflowNodeDisplay {
  title: string
  description: string
}

export const WORKFLOW_END_NODE_DISPLAY: FixedWorkflowNodeDisplay = {
  title: '结束节点',
  description: '工作流执行到此结束，无需配置输入变量或输出变量。',
}

export const LOOP_BODY_END_NODE_DISPLAY: FixedWorkflowNodeDisplay = {
  title: '本轮结束',
  description: '当前轮循环体执行到此结束，无需配置输入变量或输出变量。',
}

export function getEndNodeDisplay(isInsideLoop: boolean, fallbackDescription?: string): FixedWorkflowNodeDisplay {
  if (isInsideLoop) {
    return LOOP_BODY_END_NODE_DISPLAY
  }

  return {
    ...WORKFLOW_END_NODE_DISPLAY,
    description: fallbackDescription || WORKFLOW_END_NODE_DISPLAY.description,
  }
}

export function isWorkflowNodeInsideLoop(nodeId: string, nodes: WorkflowNode[] = []) {
  return nodes.some((node) => (
    node.type === 'loop' && containsWorkflowNode(node.config.loopBodyNodes ?? [], nodeId)
  ))
}

function containsWorkflowNode(nodes: WorkflowNode[], nodeId: string): boolean {
  return nodes.some((node) => (
    node.id === nodeId || containsWorkflowNode(node.config.loopBodyNodes ?? [], nodeId)
  ))
}
