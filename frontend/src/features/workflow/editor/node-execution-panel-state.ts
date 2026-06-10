const executionPanelExpandedByNodeId = new Map<string, boolean>()

export function isNodeExecutionPanelExpanded(nodeId: string) {
  return executionPanelExpandedByNodeId.get(nodeId) === true
}

export function setNodeExecutionPanelExpanded(nodeId: string, expanded: boolean) {
  if (expanded) {
    executionPanelExpandedByNodeId.set(nodeId, true)
    return
  }

  executionPanelExpandedByNodeId.delete(nodeId)
}

export function clearNodeExecutionPanelExpansion(nodeId?: string) {
  if (nodeId) {
    executionPanelExpandedByNodeId.delete(nodeId)
    return
  }

  executionPanelExpandedByNodeId.clear()
}
