export type WorkflowNodeType =
  | 'start'
  | 'llm'
  | 'selector'
  | 'loop'
  | 'code'
  | 'end'

export type WorkflowValueType =
  | 'String'
  | 'Integer'
  | 'Number'
  | 'Boolean'
  | 'Time'
  | 'Object'
  | 'Array'
  | 'Array<String>'
  | 'Array<Integer>'
  | 'Array<Number>'
  | 'Array<Boolean>'
  | 'Array<Time>'
  | 'Array<Object>'

export interface WorkflowNodeIO {
  name: string
  type: WorkflowValueType | string
  description: string
}

export interface WorkflowInputMapping {
  field: string
  sourceType: 'node' | 'context' | 'literal'
  source: string
}

export interface WorkflowNodeConfig {
  prompt: string
  systemPrompt?: string
  userPrompt?: string
  model: string
  modelProvider?: 'deerflow' | 'labelgpt'
  temperature: number
  maxTokens: number
  enabled: boolean
  fallbackToHuman: boolean
  responseMode: 'text' | 'json' | 'stream'
  outputKey: string
  reasoningKey?: string
  inputMappings: WorkflowInputMapping[]
  visionInputMappings?: WorkflowInputMapping[]
  supportContinuation?: boolean
  timeoutSeconds?: number
  firstTokenTimeoutEnabled?: boolean
  retryCount?: number
  errorStrategy?: 'interrupt' | 'fallback' | 'ignore'
  fallbackOutput?: string
}

export interface WorkflowNode {
  id: string
  title: string
  type: WorkflowNodeType
  description: string
  position: {
    x: number
    y: number
  }
  status: 'idle' | 'active' | 'success'
  inputs: WorkflowNodeIO[]
  outputs: WorkflowNodeIO[]
  config: WorkflowNodeConfig
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
}

export interface WorkflowDocument {
  id: string
  name: string
  description: string
  version: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}
