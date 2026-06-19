import type { WorkflowProjectSummary } from '@/api/workflow'
import type { WorkflowDocument } from '@/types/workflow'

export interface WorkflowProjectMetadata {
  name: string
  description: string
}

export interface WorkflowProjectActionTarget extends WorkflowProjectMetadata {
  id: string
  source: 'local' | 'server'
}

export interface WorkflowProjectCardActionProps {
  onDelete: () => void
  onDuplicate: () => void
  onEdit: () => void
}

export interface LocalWorkflowProjectCardProps extends WorkflowProjectCardActionProps {
  workflow: WorkflowDocument
  badge?: string
  statusText?: string
  onOpen: () => void
}

export interface SavedWorkflowProjectCardProps extends WorkflowProjectCardActionProps {
  project: WorkflowProjectSummary
  opening: boolean
  onOpen: () => void
  busy?: boolean
}
