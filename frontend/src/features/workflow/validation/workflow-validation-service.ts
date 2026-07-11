import type { WorkflowEdge, WorkflowNode } from '@/types/workflow'
import { validateNodeIO } from '@/features/workflow/validation/workflow-io-validation'
import type {
  WorkflowNodeValidationResult,
  WorkflowValidationIssue,
  WorkflowValidationResult,
} from '@/features/workflow/validation/workflow-validation.types'
import { buildWorkflowGraphContext } from '@/features/workflow/validation/workflow-validation-utils'
import { flattenWorkflowNodes } from '@/features/workflow/utils/workflow-document'

export function validateWorkflowGraph(nodes: WorkflowNode[], _edges: WorkflowEdge[] = []): WorkflowValidationResult {
  const graphContext = buildWorkflowGraphContext(nodes)
  const nodeResults: Record<string, WorkflowNodeValidationResult> = {}
  const issues: WorkflowValidationIssue[] = []

  flattenWorkflowNodes(nodes).forEach((node) => {
    const nodeIssues = validateNodeIO(node, graphContext)
    const nodeResult = createNodeValidationResult(node.id, nodeIssues)
    nodeResults[node.id] = nodeResult
    issues.push(...nodeIssues)
  })

  return {
    nodeResults,
    issues,
    errorCount: countSeverity(issues, 'error'),
    warningCount: countSeverity(issues, 'warning'),
  }
}

export function validateWorkflowNode(
  node: WorkflowNode,
  nodes: WorkflowNode[],
  _edges: WorkflowEdge[] = [],
): WorkflowNodeValidationResult {
  const graphContext = buildWorkflowGraphContext(nodes.length > 0 ? nodes : [node])
  const targetNode = graphContext.nodeMap.get(node.id) ?? node
  return createNodeValidationResult(targetNode.id, validateNodeIO(targetNode, graphContext))
}

export function hasBlockingValidationErrors(result: WorkflowValidationResult | WorkflowNodeValidationResult) {
  return result.errorCount > 0
}

export function emptyNodeValidationResult(nodeId: string): WorkflowNodeValidationResult {
  return createNodeValidationResult(nodeId, [])
}

function createNodeValidationResult(nodeId: string, issues: WorkflowValidationIssue[]): WorkflowNodeValidationResult {
  return {
    nodeId,
    issues,
    errorCount: countSeverity(issues, 'error'),
    warningCount: countSeverity(issues, 'warning'),
  }
}

function countSeverity(issues: WorkflowValidationIssue[], severity: WorkflowValidationIssue['severity']) {
  return issues.filter((issue) => issue.severity === severity).length
}
