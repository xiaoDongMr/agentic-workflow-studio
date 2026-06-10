import type { WorkflowNodeJSON } from '@flowgram.ai/free-layout-core'
import type { WorkflowPorts } from '@flowgram.ai/free-layout-core'
import type { WorkflowJSON } from '@flowgram.ai/free-layout-editor'

import {
  CANVAS_OFFSET_X,
  CANVAS_OFFSET_Y,
  NODE_GAP_X,
  NODE_GAP_Y,
  defaultNodeContent,
} from '@/features/workflow/editor/workflow-editor.config'
import { normalizeSelectorBranches } from '@/features/workflow/components/node-config/selector-utils'
import type {
  FlowgramNodeData,
  GlobalDebugFieldValue,
  TrialRunNodeExecution,
} from '@/features/workflow/editor/workflow-editor.types'
import {
  createLoopCanvasAnchorNode,
  filterLoopEndpointNodes,
  isLoopInternalNodeType,
  loopEdgeFromFlowgramEdge,
  LOOP_CANVAS_ANCHOR_NODE_TYPE,
  LOOP_END_NODE_TYPE,
  LOOP_START_NODE_TYPE,
  normalizeLoopBodyEdges,
  toVisibleLoopBodyEdges,
} from '@/features/workflow/editor/loop-node.utils'
import { trialRunStepTemplates } from '@/features/workflow/mock-data'
import type { WorkflowEdge, WorkflowInputMapping, WorkflowNode } from '@/types/workflow'

export const SELECTOR_ELSE_PORT_ID = 'selector-else'
const DEFAULT_PORT_HIT_SIZE = { width: 34, height: 34 }

export interface SelectorBranchPortInfo {
  portID: string
  label: string
  topPercent: number
  kind: 'branch' | 'else'
}

export function createNodeData(type: WorkflowNode['type'] | typeof LOOP_CANVAS_ANCHOR_NODE_TYPE): FlowgramNodeData {
  if (type === LOOP_CANVAS_ANCHOR_NODE_TYPE) {
    return {
      title: '',
      description: '',
      status: 'idle',
      kind: LOOP_CANVAS_ANCHOR_NODE_TYPE as WorkflowNode['type'],
      config: {
        prompt: '',
        model: '',
        temperature: 0,
        maxTokens: 0,
        enabled: false,
        fallbackToHuman: false,
        responseMode: 'json',
        outputKey: '',
        inputMappings: [],
      },
      inputs: [],
      outputs: [],
    }
  }
  const base = defaultNodeContent[type]

  return {
    title: base.title,
    description: base.description,
    status: base.status,
    kind: type as WorkflowNode['type'],
    config: {
      ...base.config,
      inputMappings: base.config.inputMappings.map((mapping) => ({ ...mapping })),
    },
    inputs: base.inputs.map((item) => ({ ...item })),
    outputs: base.outputs.map((item) => ({ ...item })),
  }
}

export function normalizeNodeData(
  data: Partial<FlowgramNodeData> | undefined,
  type: WorkflowNode['type'] | typeof LOOP_CANVAS_ANCHOR_NODE_TYPE,
): FlowgramNodeData {
  const base = createNodeData(type)
  const config = normalizeNodeConfig(data?.config)

  return {
    ...base,
    ...data,
    kind: type as WorkflowNode['type'],
    config: {
      ...base.config,
      ...config,
      inputMappings: mergeInputMappings(base.config.inputMappings, config?.inputMappings),
    },
    inputs: data?.inputs ?? base.inputs,
    outputs: data?.outputs ?? base.outputs,
  }
}

function normalizeNodeConfig(config: FlowgramNodeData['config'] | undefined): FlowgramNodeData['config'] | undefined {
  if (!config) {
    return config
  }
  const next = { ...config } as FlowgramNodeData['config']
  if (next.selectorBranches) {
    next.selectorBranches = normalizeSelectorBranches(next.selectorBranches)
  }
  if ('thinkingLevel' in config) {
    const legacy = (config as { thinkingLevel?: string }).thinkingLevel
    if (next.thinkingEnabled === undefined) {
      next.thinkingEnabled = legacy !== 'minimal'
    }
    if (next.reasoningEffort === undefined && (legacy === 'low' || legacy === 'medium' || legacy === 'high')) {
      next.reasoningEffort = legacy
    }
    delete (next as { thinkingLevel?: string }).thinkingLevel
  }
  return next
}

export function mergeInputMappings(
  base: WorkflowInputMapping[],
  next: WorkflowInputMapping[] | undefined,
): WorkflowInputMapping[] {
  if (!next || next.length === 0) {
    return base.map((item) => ({ ...item }))
  }

  return next.map((item) => ({ ...item }))
}

export function toFlowgramJSON(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowJSON {
  return {
    nodes: nodes.map((node) => workflowNodeToFlowgramNode(node, true)),
    edges: edges.map((edge) => ({
      sourceNodeID: edge.source,
      targetNodeID: edge.target,
      sourcePortID: edge.sourcePortID,
      targetPortID: edge.targetPortID,
    })),
  }
}

export function workflowNodeToFlowgramNode(node: WorkflowNode, applyCanvasOffset: boolean): WorkflowJSON['nodes'][number] {
  const loopBodyNodes = node.type === 'loop'
    ? filterLoopEndpointNodes(node.config.loopBodyNodes ?? [])
    : undefined
  const loopBodyEdges = node.type === 'loop'
    ? normalizeLoopBodyEdges(node.id, node.config.loopBodyEdges ?? [])
    : undefined
  const offsetX = applyCanvasOffset ? CANVAS_OFFSET_X : 0
  const offsetY = applyCanvasOffset ? CANVAS_OFFSET_Y : 0
  const baseNode = {
    id: node.id,
    type: node.type,
    meta: {
      position: {
        x: node.position.x + offsetX,
        y: node.position.y + offsetY,
      },
      defaultPorts: buildWorkflowNodePorts({
        kind: node.type,
        config: node.config,
      }),
    },
    data: {
      title: node.title,
      description: node.description,
      status: node.status,
      kind: node.type,
      config: {
        ...node.config,
        inputMappings: node.config.inputMappings.map((item) => ({ ...item })),
        ...(loopBodyNodes ? { loopBodyNodes } : {}),
        ...(loopBodyEdges ? { loopBodyEdges } : {}),
      },
      inputs: node.inputs,
      outputs: node.outputs,
    },
  } satisfies WorkflowJSON['nodes'][number]

  if (node.type !== 'loop') {
    return baseNode
  }

  return {
    ...baseNode,
    blocks: [
      createLoopCanvasAnchorNode(node.id),
      ...(loopBodyNodes?.map((bodyNode) => workflowNodeToFlowgramNode(bodyNode, false)) ?? []),
    ],
    edges: (loopBodyEdges ?? []).flatMap((edge) => toVisibleLoopBodyEdges(node.id, edge)).map((edge) => ({
      sourceNodeID: edge.source,
      targetNodeID: edge.target,
      sourcePortID: edge.sourcePortID,
      targetPortID: edge.targetPortID,
    })),
  }
}

export function fromFlowgramJSON(json: WorkflowJSON): [WorkflowNode[], WorkflowEdge[]] {
  return [
    json.nodes.map((node, index) => {
      return flowgramNodeToWorkflowNode(node, index, true)
    }),
    json.edges.map((edge, index) => ({
      id: `${edge.sourceNodeID}-${edge.targetNodeID}-${index + 1}`,
      source: String(edge.sourceNodeID),
      target: String(edge.targetNodeID),
      sourcePortID: edge.sourcePortID,
      targetPortID: edge.targetPortID,
    })),
  ]
}

function flowgramNodeToWorkflowNode(
  node: WorkflowJSON['nodes'][number],
  index: number,
  applyCanvasOffset: boolean,
): WorkflowNode {
  const type = String(node.type) as WorkflowNode['type']
  const data = normalizeNodeData(node.data as Partial<FlowgramNodeData>, type)
  const position = (node.meta as { position?: { x?: number; y?: number } } | undefined)?.position
  const offsetX = applyCanvasOffset ? CANVAS_OFFSET_X : 0
  const offsetY = applyCanvasOffset ? CANVAS_OFFSET_Y : 0
  const rawLoopBodyNodes = type === 'loop' && Array.isArray(node.blocks)
    ? node.blocks
      .filter((block) => !isLoopInternalNodeType(String(block.type)))
      .map((block, blockIndex) => flowgramNodeToWorkflowNode(block, blockIndex, false))
    : data.config.loopBodyNodes
  const loopBodyNodes = type === 'loop'
    ? filterLoopEndpointNodes(rawLoopBodyNodes ?? [])
    : data.config.loopBodyNodes
  const rawLoopBodyEdges = type === 'loop'
    ? Array.isArray(node.edges)
      ? [
        ...(data.config.loopBodyEdges ?? []),
        ...node.edges.map((edge, edgeIndex) => loopEdgeFromFlowgramEdge(
          String(node.id ?? `${type}-${index + 1}`),
          edge,
          edgeIndex,
        )),
      ]
      : data.config.loopBodyEdges
    : data.config.loopBodyEdges
  const loopBodyEdges = type === 'loop'
    ? normalizeLoopBodyEdges(String(node.id ?? `${type}-${index + 1}`), rawLoopBodyEdges ?? [])
    : data.config.loopBodyEdges

  return {
    id: String(node.id ?? `${type}-${index + 1}`),
    title: data.title,
    type,
    description: data.description,
    position: {
      x: (position?.x ?? offsetX) - offsetX,
      y: (position?.y ?? offsetY) - offsetY,
    },
    status: data.status,
    inputs: data.inputs,
    outputs: data.outputs,
    config: {
      ...data.config,
      loopBodyNodes,
      loopBodyEdges,
    },
  }
}

export function normalizeWorkflowNodeForRun(node: WorkflowNode): WorkflowNode {
  return {
    ...node,
    config: normalizeNodeConfig(node.config) ?? node.config,
  }
}

export function buildWorkflowNodePorts(data: Pick<FlowgramNodeData, 'kind' | 'config'>): WorkflowPorts {
  if (data.kind === 'start' || data.kind === LOOP_START_NODE_TYPE) {
    return [{ type: 'output', size: DEFAULT_PORT_HIT_SIZE }]
  }
  if (String(data.kind) === LOOP_CANVAS_ANCHOR_NODE_TYPE) {
    return [{ type: 'output', size: DEFAULT_PORT_HIT_SIZE }]
  }
  if (data.kind === 'end' || data.kind === LOOP_END_NODE_TYPE) {
    return [{ type: 'input', size: DEFAULT_PORT_HIT_SIZE }]
  }
  if (data.kind !== 'selector') {
    return [
      { type: 'input', size: DEFAULT_PORT_HIT_SIZE },
      { type: 'output', size: DEFAULT_PORT_HIT_SIZE },
    ]
  }

  return [
    { type: 'input', size: DEFAULT_PORT_HIT_SIZE },
    ...getSelectorBranchPortInfos(data.config.selectorBranches?.length ?? 1).map((port) => ({
      type: 'output' as const,
      portID: port.portID,
      size: DEFAULT_PORT_HIT_SIZE,
      location: 'right' as const,
      locationConfig: {
        right: 0,
        top: `${port.topPercent}%`,
      },
    })),
  ]
}

export function getSelectorBranchPortInfos(branchCount: number): SelectorBranchPortInfo[] {
  const outputCount = Math.max(branchCount, 1) + 1

  return Array.from({ length: outputCount }, (_, index) => {
    const top = outputCount === 1 ? 58 : 40 + (index * 42) / Math.max(outputCount - 1, 1)
    const isElse = index === outputCount - 1

    return {
      portID: isElse ? SELECTOR_ELSE_PORT_ID : `selector-branch-${index}`,
      label: isElse ? '否则' : `条件${index + 1}`,
      topPercent: top,
      kind: isElse ? 'else' : 'branch',
    }
  })
}

export function getNodeEntityMeta(node: { id: string | number; toJSON: () => unknown }) {
  const json = node.toJSON() as WorkflowNodeJSON
  const position = (json.meta as { position?: { x?: number; y?: number } } | undefined)?.position

  return {
    id: String(node.id),
    position: {
      x: (position?.x ?? CANVAS_OFFSET_X) - CANVAS_OFFSET_X,
      y: (position?.y ?? CANVAS_OFFSET_Y) - CANVAS_OFFSET_Y,
    },
  }
}

export function getNextNodeCanvasPosition(
  fromNode: { id: string; position: { x: number; y: number } } | undefined,
  edges: WorkflowEdge[],
) {
  if (!fromNode) {
    return {
      x: CANVAS_OFFSET_X + 360,
      y: CANVAS_OFFSET_Y + 180,
    }
  }

  const branchCount = edges.filter((edge) => edge.source === fromNode.id).length

  return {
    x: fromNode.position.x + CANVAS_OFFSET_X + NODE_GAP_X,
    y: fromNode.position.y + CANVAS_OFFSET_Y + branchCount * NODE_GAP_Y * 0.65,
  }
}

export function buildTrialRunNodeExecutions(payload: {
  fields: GlobalDebugFieldValue[]
  userInput: string
  userId: string
  channel: string
}): TrialRunNodeExecution[] {
  const summaryInput = buildDebugSummaryInput(payload.fields)

  return trialRunStepTemplates.map((step) => ({
    nodeId: step.nodeId,
    nodeTitle: step.nodeTitle,
    log: step.log,
    input: fillTrialTemplate(step.inputTemplate, payload),
    output: fillTrialTemplate(step.outputTemplate, payload),
    durationMs: step.durationMs,
    status: 'success',
    summaryInput,
    summaryOutput: summarizeOutput(fillTrialTemplate(step.outputTemplate, payload)),
  }))
}

function fillTrialTemplate(
  template: string,
  payload: {
    fields: GlobalDebugFieldValue[]
    userInput: string
    userId: string
    channel: string
  },
) {
  return template
    .replaceAll('{userInput}', payload.userInput)
    .replaceAll('{userId}', payload.userId)
    .replaceAll('{channel}', payload.channel)
}

function buildDebugSummaryInput(fields: GlobalDebugFieldValue[]) {
  return fields
    .map((field) => `${field.name}: ${field.type === 'json' ? 'Object' : 'String'}`)
    .join(' / ')
}

function summarizeOutput(output: string) {
  try {
    const parsed = JSON.parse(output) as Record<string, unknown>
    const keys = Object.keys(parsed)
    return keys.length > 0 ? `输出 ${keys.join(' / ')}` : '输出完成'
  } catch {
    return output.length > 40 ? `${output.slice(0, 40)}...` : output
  }
}
