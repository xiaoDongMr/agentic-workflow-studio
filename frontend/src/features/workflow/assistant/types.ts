import type { WorkflowDocument, WorkflowEdge, WorkflowNode } from '@/types/workflow'
import type { WorkflowValidationResult } from '@/features/workflow/validation/workflow-validation.types'

export type WorkflowAssistantClientEvent =
  | 'user_message'
  | 'confirm_plan'
  | 'revise_plan'
  | 'cancel_plan'
  | 'stage_validated'
  | 'validation_failed'
  | 'sandbox_bound'

export interface WorkflowAssistantStreamRequest {
  threadId?: string
  message: string
  workflow: WorkflowDocument
  selectedNodeId?: string
  sandboxId?: string
  sandboxBindingStatus?: 'unbound' | 'bound' | 'unavailable'
  clientEvent?: WorkflowAssistantClientEvent
  validation?: WorkflowValidationResult
}

export interface WorkflowPlanStage {
  stageId: string
  sequence: number
  title: string
  instruction: string
  final: boolean
}

export interface WorkflowPlanPreview {
  type: 'plan_preview'
  summary: string
  mermaid: string
  assumptions: string[]
  stages: WorkflowPlanStage[]
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

export interface WorkflowSandboxRequirement {
  type: 'workflow.sandboxRequired'
  workflowId: string
  reason: string
  requestedCapabilities: string[]
}

export interface WorkflowPatchStage {
  stageId: string
  sequence: number
  title: string
  status: 'running' | 'completed' | 'fixing' | 'failed'
  final: boolean
}

export type WorkflowPatchOperation =
  | { op: 'add_node'; node: WorkflowNode }
  | { op: 'update_node'; nodeId: string; partial: Partial<WorkflowNode> }
  | { op: 'delete_node'; nodeId: string }
  | { op: 'add_edge'; edge: WorkflowEdge }
  | { op: 'delete_edge'; edgeId: string }
  | { op: 'update_metadata'; name?: string; description?: string }
  | { op: 'replace_workflow'; workflow: WorkflowDocument }

export interface WorkflowPatch {
  operations: WorkflowPatchOperation[]
}

export interface WorkflowPatchResult {
  type: 'workflow_patch'
  summary: string
  patch: WorkflowPatch
  stage: WorkflowPatchStage
  repair?: boolean
}

export interface WorkflowAssistantMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  tone?: 'default' | 'error' | 'success'
}
