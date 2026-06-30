export type WorkflowNodeType =
  | 'start'
  | 'llm'
  | 'selector'
  | 'loop'
  | 'loop-start'
  | 'loop-end'
  | 'code'
  | 'end'

export type WorkflowReasoningEffort = 'minimal' | 'low' | 'medium' | 'high'

export type WorkflowSelectorOperator =
  | 'equals'
  | 'not_equals'
  | 'length_gt'
  | 'length_gte'
  | 'length_lt'
  | 'length_lte'
  | 'contains'
  | 'not_contains'

export type WorkflowValueType =
  | 'String'
  | 'Integer'
  | 'Number'
  | 'Boolean'
  | 'Time'
  | 'Object'
  | 'Image'
  | 'Video'
  | 'Array'
  | 'Array<String>'
  | 'Array<Integer>'
  | 'Array<Number>'
  | 'Array<Boolean>'
  | 'Array<Time>'
  | 'Array<Object>'
  | 'Array<Image>'
  | 'Array<Video>'

export interface WorkflowNodeIO {
  name: string
  type: WorkflowValueType | string
  description: string
}

export interface WorkflowInputMapping {
  field: string
  sourceType: 'node' | 'context' | 'literal'
  source: string
  valueType?: WorkflowValueType | string
}

export type WorkflowLoopMode = 'array' | 'count'

export interface WorkflowLoopOutputRef {
  id: string
  name: string
  nodeId: string
  fieldPath: string
  type: WorkflowValueType | string
}

export type WorkflowRuleOperandSourceType = 'literal' | 'context' | 'node'

export interface WorkflowRuleOperand {
  sourceType: WorkflowRuleOperandSourceType
  valueType?: WorkflowValueType | string
  literalValue?: unknown
  contextPath?: string
  nodeId?: string
  fieldPath?: string
  displayLabel?: string
  source?: string
}

export interface WorkflowSelectorOperand extends WorkflowRuleOperand {
  sourceType: WorkflowRuleOperandSourceType
  valueType?: WorkflowValueType | string
}

export interface WorkflowSelectorCondition {
  id: string
  operator: WorkflowSelectorOperator
  left: WorkflowSelectorOperand
  right: WorkflowSelectorOperand
  field?: string
  value?: string
  valueType?: WorkflowValueType | string
}

export interface WorkflowSelectorBranch {
  id: string
  label: string
  conditions: WorkflowSelectorCondition[]
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
  visionInputAsBase64?: boolean
  supportContinuation?: boolean
  thinkingEnabled?: boolean
  reasoningEffort?: WorkflowReasoningEffort
  timeoutSeconds?: number
  retryCount?: number
  errorStrategy?: 'interrupt' | 'fallback' | 'ignore'
  fallbackOutput?: string
  codeLanguage?: 'python'
  codeSource?: 'sandbox_file' | 'sandbox_snippet' | 'inline'
  codeFilePath?: string
  codeEntryFunction?: string
  codeSyncStatus?: 'saved' | 'dirty' | 'saving' | 'failed'
  codeLastSavedSignature?: string
  selectorBranches?: WorkflowSelectorBranch[]
  selectorElseBranch?: string
  loopMode?: WorkflowLoopMode
  loopCount?: number
  loopBodyNodes?: WorkflowNode[]
  loopBodyEdges?: WorkflowEdge[]
  loopOutputs?: WorkflowLoopOutputRef[]
  loopCanvasWidth?: number
  loopCanvasHeight?: number
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
  sourcePortID?: string | number
  targetPortID?: string | number
}

export interface WorkflowDocument {
  id: string
  name: string
  description: string
  version: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}
