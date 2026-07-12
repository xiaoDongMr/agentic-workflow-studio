import type { WorkflowEdge, WorkflowNode } from '@/types/workflow'
import type { WorkflowValidationIssue } from '@/features/workflow/validation/workflow-validation.types'
import type { WorkflowGraphContext } from '@/features/workflow/validation/workflow-validation-utils'

const MAIN_TERMINAL_WARNING_NODE_TYPES = new Set<WorkflowNode['type']>(['llm', 'code', 'loop'])
const LOOP_BODY_ENTRY_NODE_TYPES = new Set<WorkflowNode['type']>(['llm', 'code', 'selector'])
const LOOP_BODY_TERMINAL_WARNING_NODE_TYPES = new Set<WorkflowNode['type']>(['llm', 'code'])
const LOOP_BODY_END_NODE_TYPES = new Set<WorkflowNode['type']>(['end', 'loop-end'])

export function validateNodeStructure(node: WorkflowNode, graphContext: WorkflowGraphContext) {
  return [
    ...validateMainCanvasEndNodeCount(node, graphContext),
    ...validateMainCanvasTerminal(node, graphContext),
    ...validateLoopBodyStructure(node),
  ]
}

function validateMainCanvasEndNodeCount(node: WorkflowNode, graphContext: WorkflowGraphContext) {
  if (!graphContext.rootNodeIds.has(node.id)) {
    return []
  }

  const endNodes = graphContext.nodes.filter((item) => item.type === 'end')
  if (endNodes.length === 0 && node.type === 'start') {
    return [createStructureIssue({
      node,
      title: '结束节点缺失',
      message: '主画布需要保留一个结束节点，用于明确工作流最终出口。',
      suggestion: '请添加一个结束节点，并将最终路径连接到该节点。',
    })]
  }

  const [firstEndNode] = endNodes
  if (node.type === 'end' && endNodes.length > 1 && firstEndNode?.id !== node.id) {
    return [createStructureIssue({
      node,
      title: '结束节点重复',
      message: '主画布建议只保留一个结束节点，避免多个终点造成流程语义分散。',
      suggestion: '请删除重复的结束节点，并将需要结束的路径汇聚到同一个结束节点。',
    })]
  }

  return []
}

function validateMainCanvasTerminal(node: WorkflowNode, graphContext: WorkflowGraphContext) {
  if (!graphContext.rootNodeIds.has(node.id) || !MAIN_TERMINAL_WARNING_NODE_TYPES.has(node.type)) {
    return []
  }

  const outgoingEdges = graphContext.rootOutgoingEdges.get(node.id) ?? []
  if (outgoingEdges.length > 0) {
    return []
  }

  return [createStructureIssue({
    node,
    severity: 'warning',
    title: '路径会隐式结束',
    message: `${node.title} 没有连接下游节点，运行时会在这里隐式结束。`,
    suggestion: '建议连接到结束节点，让流程终点在画布上更明确。',
  })]
}

function validateLoopBodyStructure(loopNode: WorkflowNode) {
  if (loopNode.type !== 'loop') {
    return []
  }

  const bodyNodes = loopNode.config.loopBodyNodes ?? []
  const bodyEdges = loopNode.config.loopBodyEdges ?? []
  const entryNodes = bodyNodes.filter(isLoopBodyEntryNode)
  if (entryNodes.length === 0) {
    return []
  }

  return [
    ...validateLoopBodyEntry(loopNode, entryNodes, bodyEdges),
    ...validateLoopBodyTerminals(loopNode, bodyNodes.filter(isLoopBodyTerminalWarningNode), bodyEdges),
  ]
}

function validateLoopBodyEntry(
  loopNode: WorkflowNode,
  executableNodes: WorkflowNode[],
  bodyEdges: WorkflowEdge[],
) {
  const executableNodeIds = new Set(executableNodes.map((node) => node.id))
  const hasEntryEdge = bodyEdges.some((edge) => edge.source === loopNode.id && executableNodeIds.has(edge.target))
  if (hasEntryEdge) {
    return []
  }

  return [createStructureIssue({
    node: loopNode,
    title: '循环体缺少开始连线',
    message: `${loopNode.title} 的循环体还没有从循环开始连接到第一个执行节点。`,
    suggestion: '请从循环入口连接到循环体中的第一个业务节点，避免系统按默认顺序推断入口。',
  })]
}

function validateLoopBodyTerminals(
  loopNode: WorkflowNode,
  executableNodes: WorkflowNode[],
  bodyEdges: WorkflowEdge[],
) {
  const endNodeIds = new Set(
    (loopNode.config.loopBodyNodes ?? [])
      .filter((node) => LOOP_BODY_END_NODE_TYPES.has(node.type))
      .map((node) => node.id),
  )

  return executableNodes.flatMap((bodyNode) => {
    const outgoingEdges = bodyEdges.filter((edge) => edge.source === bodyNode.id)
    if (
      outgoingEdges.length > 0
      && outgoingEdges.some((edge) => edge.target === loopNode.id || endNodeIds.has(edge.target))
    ) {
      return []
    }
    if (outgoingEdges.length > 0) {
      return []
    }

    return [createStructureIssue({
      node: loopNode,
      severity: 'warning',
      fieldPath: `config.loopBodyNodes.${bodyNode.id}`,
      title: '循环路径未连接本轮结束',
      message: `${bodyNode.title} 没有连接后续节点，系统会在这里隐式结束本轮循环。`,
      suggestion: '建议将该路径连接到本轮结束节点，让循环体有明确终点。',
    })]
  })
}

function isLoopBodyEntryNode(node: WorkflowNode) {
  return LOOP_BODY_ENTRY_NODE_TYPES.has(node.type)
}

function isLoopBodyTerminalWarningNode(node: WorkflowNode) {
  return LOOP_BODY_TERMINAL_WARNING_NODE_TYPES.has(node.type)
}

function createStructureIssue({
  node,
  severity = 'error',
  fieldPath = 'structure',
  title,
  message,
  suggestion,
}: {
  node: WorkflowNode
  severity?: WorkflowValidationIssue['severity']
  fieldPath?: string
  title: string
  message: string
  suggestion?: string
}): WorkflowValidationIssue {
  return {
    id: `${node.id}:nodeConfig:${fieldPath}:${message}`,
    nodeId: node.id,
    severity,
    scope: 'nodeConfig',
    fieldPath,
    title,
    message,
    suggestion,
  }
}
