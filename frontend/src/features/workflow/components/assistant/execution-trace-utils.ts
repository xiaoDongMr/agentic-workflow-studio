import type {
  WorkflowToolActivity,
} from '@/features/workflow/assistant/types'

export function compactExecutionActivities(activities: WorkflowToolActivity[]) {
  const hasGraphGeneration = activities.some(
    (activity) => activity.toolName === 'generate_workflow_patch',
  )
  if (!hasGraphGeneration) {
    return {
      activities,
      graphGenerationSteps: [] as string[],
    }
  }

  const graphGenerationSteps = activities
    .filter((activity) => activity.kind === 'model' && activity.actor === 'graph-builder')
    .flatMap((activity) => activity.modelOutput?.split('\n') ?? [])
    .map((step) => step.trim())
    .filter((step, index, steps) => Boolean(step) && steps.indexOf(step) === index)

  return {
    activities: activities.filter((activity) => (
      !(activity.kind === 'model' && activity.actor === 'graph-builder')
      && activity.toolName !== 'frontend.apply_preview_graph'
    )),
    graphGenerationSteps,
  }
}

export function isActivityRepresentedByResult(
  activity: WorkflowToolActivity,
  result: {
    hasClarification: boolean
    hasError: boolean
    hasPlan: boolean
    hasSandboxRequirement: boolean
  },
) {
  if (activity.toolName === 'return_workflow_error' && result.hasError) {
    return true
  }
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
