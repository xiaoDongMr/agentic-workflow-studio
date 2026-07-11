export type WorkflowValidationSeverity = 'error' | 'warning'

export type WorkflowValidationScope =
  | 'node'
  | 'input'
  | 'output'
  | 'inputMapping'
  | 'nodeConfig'

export interface WorkflowValidationIssue {
  id: string
  nodeId: string
  severity: WorkflowValidationSeverity
  scope: WorkflowValidationScope
  fieldPath?: string
  title: string
  message: string
  suggestion?: string
}

export interface WorkflowNodeValidationResult {
  nodeId: string
  issues: WorkflowValidationIssue[]
  errorCount: number
  warningCount: number
}

export interface WorkflowValidationResult {
  nodeResults: Record<string, WorkflowNodeValidationResult>
  issues: WorkflowValidationIssue[]
  errorCount: number
  warningCount: number
}
