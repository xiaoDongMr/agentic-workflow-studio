import type { WorkflowDocument, WorkflowEdge, WorkflowNode } from '@/types/workflow'

export type WorkflowAssistantClientEvent =
  | 'user_message'
  | 'clarification_response'
  | 'confirm_plan'
  | 'revise_plan'
  | 'cancel_plan'
  | 'sandbox_bound'

export interface WorkflowAssistantStreamRequest {
  threadId?: string
  workflowId: string
  message: string
  workflow: WorkflowDocument
  selectedNodeId?: string
  sandboxId?: string
  sandboxBindingStatus?: 'unbound' | 'bound' | 'unavailable'
  clientEvent?: WorkflowAssistantClientEvent
}

export interface WorkflowPlanPreview {
  type: 'plan_preview'
  summary: string
  mermaid: string
}

export interface WorkflowClarification {
  type: 'clarification'
  summary: string
  questions: Array<{
    id: string
    question: string
    reason: string
    required: boolean
    inputType: 'single' | 'multiple' | 'text'
    options: Array<{
      label: string
      value: string
    }>
    allowOther: boolean
  }>
}

export interface WorkflowClarificationAnswer {
  questionId: string
  answers: string[]
  other?: string
}

export interface WorkflowConfirmedClarification {
  clarification: WorkflowClarification
  answers: WorkflowClarificationAnswer[]
  timestamp: number
}

export interface WorkflowSandboxRequirement {
  type: 'workflow.sandboxRequired'
  workflowId: string
  reason: string
  requestedCapabilities: string[]
}

export type WorkflowGraphNode = Omit<WorkflowNode, 'position' | 'status'> & {
  position?: WorkflowNode['position']
  status?: WorkflowNode['status']
}

export interface WorkflowGraphResult {
  type: 'workflow_graph'
  summary: string
  graph: {
    nodes: WorkflowGraphNode[]
    edges: WorkflowEdge[]
  }
}

export interface WorkflowMetadataResult {
  name: string
  description: string
}

export interface WorkflowToolActivity {
  id: string
  toolName: string
  label: string
  category: string
  actor: 'main-agent' | 'graph-builder' | 'frontend' | 'system'
  actorLabel: string
  kind: 'tool' | 'skill' | 'subagent' | 'model' | 'validation' | 'canvas'
  groupId: string
  parentId?: string
  status: 'running' | 'completed' | 'blocked' | 'failed' | 'cancelled'
  detail?: string
  modelOutput?: string
  modelOutputId?: string
  previewGraphSummary?: WorkflowPreviewGraphSummary
  capabilities: string[]
  timestamp: number
}

export interface WorkflowPreviewGraphSummary {
  syncIndex: number
  nodeCount: number
  edgeCount: number
  nodeChangeCount: number
  edgeChangeCount: number
  addedNodes: WorkflowPreviewGraphNodeChange[]
  updatedNodes: WorkflowPreviewGraphNodeChange[]
  removedNodes: WorkflowPreviewGraphNodeChange[]
  addedEdges: WorkflowPreviewGraphEdgeChange[]
  removedEdges: WorkflowPreviewGraphEdgeChange[]
  positionedNodeCount: number
}

export interface WorkflowPreviewGraphNodeChange {
  id: string
  title: string
  type: WorkflowNode['type']
}

export interface WorkflowPreviewGraphEdgeChange {
  id: string
  sourceTitle: string
  targetTitle: string
}

export interface WorkflowAssistantMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  tone?: 'default' | 'warning' | 'error' | 'success'
  timestamp?: number
}
