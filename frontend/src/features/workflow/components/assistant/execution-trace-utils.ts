import type {
  WorkflowPlanPreview,
  WorkflowToolActivity,
} from '@/features/workflow/assistant/types'

export function countPlannedNodes(plan: WorkflowPlanPreview) {
  const nodeIds = new Set<string>()
  plan.stages.forEach((stage) => {
    const stageNodeIds = stage.nodeIds ?? []
    stageNodeIds.forEach((nodeId) => {
      if (nodeId.trim()) {
        nodeIds.add(nodeId)
      }
    })
  })
  return nodeIds.size || undefined
}

export function isActivityRepresentedByResult(
  activity: WorkflowToolActivity,
  result: {
    hasClarification: boolean
    hasPlan: boolean
    hasSandboxRequirement: boolean
  },
) {
  if (activity.status === 'failed') {
    return false
  }
  if (activity.toolName === 'workflow_ask_clarification') {
    return result.hasClarification
  }
  if (activity.toolName === 'request_workflow_sandbox') {
    return result.hasSandboxRequirement
  }
  if (activity.toolName === 'return_workflow_plan') {
    return result.hasPlan
  }
  return false
}
