import { nodePalette } from '@/features/workflow/mock-data'
import type { WorkflowNode } from '@/types/workflow'

export type NodePaletteKey = (typeof nodePalette)[number]['key']

export interface AddNodeOptions {
  connectFromNodeId?: string
  parentNodeId?: string
  loopSourceNodeId?: string
  sourcePortID?: string | number
  panelPosition?: { x: number; y: number }
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

export type WorkflowRuntimeEventType =
  | 'node_started'
  | 'node_completed'
  | 'node_failed'
  | 'node_log'
  | 'llm_started'
  | 'llm_token'
  | 'llm_completed'
  | 'llm_retry'
  | 'llm_failed'
  | 'tool_started'
  | 'tool_completed'
  | 'tool_failed'

export type WorkflowRuntimeEventLevel = 'debug' | 'info' | 'warning' | 'error'

export interface WorkflowRuntimeEvent {
  id: string
  type: WorkflowRuntimeEventType
  level: WorkflowRuntimeEventLevel
  timestamp: number
  nodeId?: string
  nodeTitle?: string
  title?: string
  message: string
  token?: string
  durationMs?: number
  error?: string
  data?: Record<string, unknown>
}

export interface WorkflowTokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface TrialRunTimelineItem {
  id: string
  type: WorkflowRuntimeEventType | 'step'
  level: WorkflowRuntimeEventLevel
  title: string
  message: string
  timestamp: number
  data?: Record<string, unknown>
}

export interface TrialRunLoopIterationExecution {
  iterationIndex: number
  nodeId: string
  nodeTitle: string
  log: string
  input: string
  output: string
  durationMs: number
  status: TrialRunNodeState
  error?: string
  degraded?: boolean
  tokenUsage?: WorkflowTokenUsage
  timeline?: TrialRunTimelineItem[]
  summaryInput?: string
  summaryOutput?: string
}

export interface TrialRunNodeExecution {
  nodeId: string
  nodeTitle: string
  log: string
  input: string
  output: string
  durationMs: number
  status: TrialRunNodeState
  error?: string
  degraded?: boolean
  tokenUsage?: WorkflowTokenUsage
  timeline?: TrialRunTimelineItem[]
  summaryInput?: string
  summaryOutput?: string
  loopNodeId?: string
  latestIterationIndex?: number
  iterationsByIndex?: Record<number, TrialRunLoopIterationExecution>
  iterationOrder?: number[]
  loopIterations?: TrialRunLoopIterationExecution[]
}

export interface BrowserRuntimePreview {
  previewUrl: string
  nodeId: string
  nodeTitle: string
  status: TrialRunNodeState
}

export interface GlobalDebugFieldValue {
  name: string
  type: 'json' | 'string' | 'image' | 'video' | 'image-array' | 'video-array'
  valueType?: string
  value: string
  label?: string
  description?: string
  group?: 'node' | 'context' | 'general'
  groupLabel?: string
  sourceLabel?: string
  usageHints?: string[]
}
