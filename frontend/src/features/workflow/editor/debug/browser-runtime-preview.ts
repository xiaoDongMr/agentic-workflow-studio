import type {
  BrowserRuntimePreview,
  TrialRunNodeExecution,
} from '@/features/workflow/editor/workflow-editor.types'
import { flattenWorkflowNodes } from '@/features/workflow/utils/workflow-document'
import type { WorkflowNode } from '@/types/workflow'

interface ResolveBrowserRuntimePreviewOptions {
  previewUrl: string
  nodes: WorkflowNode[]
  executions: Record<string, TrialRunNodeExecution>
}

interface BrowserRuntimeExecutionCandidate {
  execution: TrialRunNodeExecution
  node: WorkflowNode
  latestTimestamp: number
}

export function resolveBrowserRuntimePreview({
  previewUrl,
  nodes,
  executions,
}: ResolveBrowserRuntimePreviewOptions): BrowserRuntimePreview | undefined {
  if (!previewUrl) {
    return undefined
  }

  const nodeMap = new Map(flattenWorkflowNodes(nodes).map((node) => [String(node.id), node]))
  const browserExecutions = Object.values(executions)
    .map((execution) => ({
      execution,
      node: nodeMap.get(String(execution.nodeId)),
      latestTimestamp: execution.timeline?.at(-1)?.timestamp ?? 0,
    }))
    .filter(isBrowserRuntimeExecutionCandidate)

  if (browserExecutions.length === 0) {
    return undefined
  }

  const running = browserExecutions.find((item) => item.execution.status === 'running')
  const latest = running ?? getLatestBrowserExecution(browserExecutions)
  return {
    previewUrl,
    nodeId: latest.execution.nodeId,
    nodeTitle: latest.execution.nodeTitle || latest.node.title,
    status: latest.execution.status,
  }
}

function isBrowserRuntimeExecutionCandidate(
  item: {
    execution: TrialRunNodeExecution
    node?: WorkflowNode
    latestTimestamp: number
  },
): item is BrowserRuntimeExecutionCandidate {
  return item.node?.config.codeCapability === 'browser'
}

function getLatestBrowserExecution(candidates: BrowserRuntimeExecutionCandidate[]) {
  return candidates.reduce((latest, current) =>
    current.latestTimestamp > latest.latestTimestamp ? current : latest,
  )
}
