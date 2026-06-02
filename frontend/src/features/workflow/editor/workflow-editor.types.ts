import { nodePalette } from '@/features/workflow/mock-data'
import type { WorkflowNode } from '@/types/workflow'

export type NodePaletteKey = (typeof nodePalette)[number]['key']

export interface AddNodeOptions {
  connectFromNodeId?: string
  position?: { x: number; y: number }
  selectCreated?: boolean
}

export type FlowgramNodeData = {
  title: string
  description: string
  status: WorkflowNode['status']
  kind: WorkflowNode['type']
  config: WorkflowNode['config']
  inputs: WorkflowNode['inputs']
  outputs: WorkflowNode['outputs']
  trialRunExecution?: TrialRunNodeExecution
}

export type TrialRunNodeState = 'running' | 'success' | 'error'

export interface TrialRunNodeExecution {
  nodeId: string
  nodeTitle: string
  log: string
  input: string
  output: string
  durationMs: number
  status: TrialRunNodeState
  summaryInput?: string
  summaryOutput?: string
}

export interface GlobalDebugFieldValue {
  name: string
  type: 'json' | 'string' | 'image' | 'video' | 'image-array' | 'video-array'
  valueType?: string
  value: string
}
