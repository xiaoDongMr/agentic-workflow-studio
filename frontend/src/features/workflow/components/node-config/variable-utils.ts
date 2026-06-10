import type { WorkflowNode, WorkflowValueType } from '@/types/workflow'
import { createLoopEntryOutputs } from '@/features/workflow/editor/loop-node.utils'

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
  description?: string
  nodeId: string
  nodeTitle: string
  outputName: string
  sourceType: 'node'
  fieldPath: string
  displayLabel: string
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

function formatNodeReferenceLabel(node: WorkflowNode, outputName: string) {
  return `${node.title}.${outputName}`
}

export function getAvailableInputSources(
  currentNode: WorkflowNode,
  nodes: WorkflowNode[] = [],
  edges: { source: string; target: string }[] = [],
): WorkflowVariableSource[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const parentLoopNode = findParentLoopNode(nodes, currentNode.id)
  const incoming = groupIncomingEdges(edges)
  const ancestorIds = collectAncestorIds(currentNode.id, incoming)

  return ancestorIds.flatMap((nodeId) => {
    const node = nodesById.get(nodeId)
    if (!node) {
      return []
    }

    if (parentLoopNode && node.id === parentLoopNode.id) {
      return createLoopEntryOutputs(parentLoopNode).map((output) => {
        const displayLabel = `循环入口.${output.name}`
        return {
          value: `${parentLoopNode.id}.${output.name}`,
          label: `${displayLabel} (${formatValueType(output.type)})`,
          type: output.type,
          description: output.description,
          nodeId: parentLoopNode.id,
          nodeTitle: '循环入口',
          outputName: output.name,
          sourceType: 'node' as const,
          fieldPath: output.name,
          displayLabel,
        }
      })
    }

    return node.outputs
      .filter((output) => output.name)
      .map((output) => {
        const displayLabel = formatNodeReferenceLabel(node, output.name)
        return {
          value: `${node.id}.${output.name}`,
          label: `${displayLabel} (${formatValueType(output.type)})`,
          type: output.type,
          description: output.description,
          nodeId: node.id,
          nodeTitle: node.title,
          outputName: output.name,
          sourceType: 'node' as const,
          fieldPath: output.name,
          displayLabel,
        }
      })
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

function findParentLoopNode(nodes: WorkflowNode[], nodeId: string): WorkflowNode | undefined {
  for (const node of nodes) {
    if ((node.config.loopBodyNodes ?? []).some((bodyNode) => bodyNode.id === nodeId)) {
      return node
    }

    const nested = findParentLoopNode(node.config.loopBodyNodes ?? [], nodeId)
    if (nested) {
      return nested
    }
  }
  return undefined
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
