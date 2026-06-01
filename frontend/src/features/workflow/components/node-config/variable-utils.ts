import type { WorkflowNode, WorkflowValueType } from '@/types/workflow'

export const WORKFLOW_VALUE_TYPES: WorkflowValueType[] = [
  'String',
  'Integer',
  'Number',
  'Boolean',
  'Time',
  'Object',
  'Image',
  'Video',
  'Array',
  'Array<String>',
  'Array<Integer>',
  'Array<Number>',
  'Array<Boolean>',
  'Array<Time>',
  'Array<Object>',
  'Array<Image>',
  'Array<Video>',
]

export const BASE_VALUE_TYPES: WorkflowValueType[] = ['String', 'Integer', 'Number', 'Boolean', 'Time', 'Object', 'Image', 'Video']

export const ARRAY_VALUE_TYPES: WorkflowValueType[] = [
  'Array<String>',
  'Array<Integer>',
  'Array<Number>',
  'Array<Boolean>',
  'Array<Time>',
  'Array<Object>',
  'Array<Image>',
  'Array<Video>',
]

const WORKFLOW_VALUE_TYPE_LABELS: Record<WorkflowValueType, string> = {
  String: 'str. String',
  Integer: 'int. Integer',
  Number: 'num. Number',
  Boolean: 'bool. Boolean',
  Time: 'time. Time',
  Object: 'obj. Object',
  Image: 'img. Image',
  Video: 'vid. Video',
  Array: 'arr. Array',
  'Array<String>': 'arr. Array<String>',
  'Array<Integer>': 'arr. Array<Integer>',
  'Array<Number>': 'arr. Array<Number>',
  'Array<Boolean>': 'arr. Array<Boolean>',
  'Array<Time>': 'arr. Array<Time>',
  'Array<Object>': 'arr. Array<Object>',
  'Array<Image>': 'arr. Array<Image>',
  'Array<Video>': 'arr. Array<Video>',
}

export interface WorkflowVariableSource {
  value: string
  label: string
  type: string
  nodeId: string
  nodeTitle: string
  outputName: string
}

export function normalizeValueType(type: string): WorkflowValueType {
  const normalized = type.trim().toLowerCase()
  const matched = WORKFLOW_VALUE_TYPES.find((item) => item.toLowerCase() === normalized)
  return matched ?? 'String'
}

export function formatValueType(type: string) {
  return WORKFLOW_VALUE_TYPE_LABELS[normalizeValueType(type)]
}

export function getValueTypeName(type: string) {
  return normalizeValueType(type).replace('Array<', '').replace('>', '')
}

export function getAvailableInputSources(
  currentNode: WorkflowNode,
  nodes: WorkflowNode[] = [],
  edges: { source: string; target: string }[] = [],
): WorkflowVariableSource[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const incoming = groupIncomingEdges(edges)
  const ancestorIds = collectAncestorIds(currentNode.id, incoming)

  return ancestorIds.flatMap((nodeId) => {
    const node = nodesById.get(nodeId)
    if (!node) {
      return []
    }

    return node.outputs
      .filter((output) => output.name)
      .map((output) => ({
        value: `${node.id}.${output.name}`,
        label: `${node.title}.${output.name} (${formatValueType(output.type)})`,
        type: output.type,
        nodeId: node.id,
        nodeTitle: node.title,
        outputName: output.name,
      }))
  })
}

export function groupVariableSources(options: WorkflowVariableSource[]) {
  const groups = new Map<string, { title: string; options: WorkflowVariableSource[] }>()

  for (const option of options) {
    const nodeId = option.nodeId || option.value.split('.')[0] || 'unknown'
    const title = option.nodeTitle || nodeId
    const group = groups.get(nodeId) ?? { title, options: [] }
    group.options.push(option)
    groups.set(nodeId, group)
  }

  return [...groups.values()]
}

function groupIncomingEdges(edges: { source: string; target: string }[]) {
  const incoming = new Map<string, string[]>()
  for (const edge of edges) {
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source])
  }
  return incoming
}

function collectAncestorIds(nodeId: string, incoming: Map<string, string[]>) {
  const ancestorIds: string[] = []
  const visited = new Set<string>()
  const queue = [...(incoming.get(nodeId) ?? [])]

  while (queue.length > 0) {
    const currentNodeId = queue.shift()
    if (!currentNodeId || visited.has(currentNodeId)) {
      continue
    }
    visited.add(currentNodeId)
    ancestorIds.push(currentNodeId)
    queue.push(...(incoming.get(currentNodeId) ?? []))
  }

  return ancestorIds
}
