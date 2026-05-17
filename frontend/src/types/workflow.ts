export type WorkflowNodeType =
  | 'start'
  | 'intent'
  | 'knowledge'
  | 'skill'
  | 'http'
  | 'condition'
  | 'response'

export interface WorkflowNodeIO {
  name: string
  type: string
  description: string
}

export interface WorkflowInputMapping {
  field: string
  sourceType: 'node' | 'context' | 'literal'
  source: string
}

export interface WorkflowNodeConfig {
  prompt: string
  model: string
  temperature: number
  maxTokens: number
  enabled: boolean
  fallbackToHuman: boolean
  responseMode: 'text' | 'json' | 'stream'
  outputKey: string
  inputMappings: WorkflowInputMapping[]
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
