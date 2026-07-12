import type { WorkflowEdge, WorkflowInputMapping, WorkflowNode, WorkflowNodeIO } from '@/types/workflow'
import { createLoopEntryOutputs } from '@/features/workflow/editor/loop-node.utils'
import { flattenWorkflowNodes } from '@/features/workflow/utils/workflow-document'

const FIELD_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
const DANGEROUS_FIELD_NAMES = new Set(['__proto__', 'constructor', 'prototype'])

export function isBlank(value: unknown) {
  return typeof value !== 'string' || value.trim().length === 0
}

export function normalizeFieldName(value: string) {
  return value.trim()
}

export function isRecommendedFieldName(value: string) {
  return FIELD_NAME_PATTERN.test(value)
}

export function isDangerousFieldName(value: string) {
  return DANGEROUS_FIELD_NAMES.has(value)
}

export function groupDuplicateNames(items: WorkflowNodeIO[]) {
  const counts = new Map<string, number>()
  items.forEach((item) => {
    const name = normalizeFieldName(item.name)
    if (!name) {
      return
    }
    counts.set(name, (counts.get(name) ?? 0) + 1)
  })
  return counts
}

export function buildWorkflowGraphContext(nodes: WorkflowNode[], edges: WorkflowEdge[] = []) {
  const flatNodes = flattenWorkflowNodes(nodes)
  const rootNodeIds = new Set(nodes.map((node) => node.id))
  const { loopBodyNodeIds, parentLoopByNodeId } = collectLoopBodyRelations(nodes)
  const nodeMap = new Map(flatNodes.map((node) => [node.id, node]))
  const flatEdges = [
    ...edges,
    ...flatNodes.flatMap((node) => node.type === 'loop' ? node.config.loopBodyEdges ?? [] : []),
  ]
  const outgoingEdges = flatEdges.reduce((edgeMap, edge) => {
    const sourceEdges = edgeMap.get(edge.source) ?? []
    sourceEdges.push(edge)
    edgeMap.set(edge.source, sourceEdges)
    return edgeMap
  }, new Map<string, WorkflowEdge[]>())
  const rootOutgoingEdges = edges.reduce((edgeMap, edge) => {
    const sourceEdges = edgeMap.get(edge.source) ?? []
    sourceEdges.push(edge)
    edgeMap.set(edge.source, sourceEdges)
    return edgeMap
  }, new Map<string, WorkflowEdge[]>())

  return {
    nodes,
    edges: flatEdges,
    rootEdges: edges,
    flatNodes,
    rootNodeIds,
    loopBodyNodeIds,
    parentLoopByNodeId,
    nodeMap,
    outgoingEdges,
    rootOutgoingEdges,
  }
}

export type WorkflowGraphContext = ReturnType<typeof buildWorkflowGraphContext>

function collectLoopBodyRelations(nodes: WorkflowNode[]) {
  const loopBodyNodeIds = new Set<string>()
  const parentLoopByNodeId = new Map<string, WorkflowNode>()

  nodes.forEach((node) => {
    if (node.type === 'loop') {
      collectLoopBodyNodeRelations(node, loopBodyNodeIds, parentLoopByNodeId)
    }
  })

  return {
    loopBodyNodeIds,
    parentLoopByNodeId,
  }
}

function collectLoopBodyNodeRelations(
  loopNode: WorkflowNode,
  loopBodyNodeIds: Set<string>,
  parentLoopByNodeId: Map<string, WorkflowNode>,
) {
  loopNode.config.loopBodyNodes?.forEach((bodyNode) => {
    loopBodyNodeIds.add(bodyNode.id)
    parentLoopByNodeId.set(bodyNode.id, loopNode)
    if (bodyNode.type === 'loop') {
      collectLoopBodyNodeRelations(bodyNode, loopBodyNodeIds, parentLoopByNodeId)
    }
  })
}

export function findMappingForInput(input: WorkflowNodeIO, mappings: WorkflowInputMapping[]) {
  const inputName = normalizeFieldName(input.name)
  return mappings.find((mapping) => normalizeFieldName(mapping.field) === inputName)
}

export function resolveMappingSource(mapping: WorkflowInputMapping, graphContext: WorkflowGraphContext) {
  if (mapping.sourceType !== 'node') {
    return undefined
  }

  const [nodeId, ...fieldParts] = mapping.source.split('.')
  const fieldPath = fieldParts.join('.')
  if (!nodeId || !fieldPath) {
    return undefined
  }

  const sourceNode = graphContext.nodeMap.get(nodeId)
  const sourceOutput = resolveNodeOutput(sourceNode, fieldPath)

  return {
    nodeId,
    fieldPath,
    sourceNode,
    sourceOutput,
  }
}

function resolveNodeOutput(node: WorkflowNode | undefined, fieldPath: string) {
  if (!node) {
    return undefined
  }

  const outputs = node.type === 'loop'
    ? [...node.outputs, ...createLoopEntryOutputs(node)]
    : node.outputs
  return outputs.find((output) => normalizeFieldName(output.name) === fieldPath)
}

export function isValueTypeCompatible(expectedType: string | undefined, actualType: string | undefined) {
  const expected = normalizeValueTypeName(expectedType)
  const actual = normalizeValueTypeName(actualType)
  if (!expected || !actual) {
    return true
  }
  if (expected === actual) {
    return true
  }
  if (expected === 'Number' && actual === 'Integer') {
    return true
  }
  if (expected === 'Array' && actual.startsWith('Array')) {
    return true
  }
  return false
}

export function normalizeValueTypeName(value: string | undefined) {
  return value?.trim() ?? ''
}

export function hasOutputName(node: WorkflowNode, outputName: string | undefined) {
  const name = normalizeFieldName(outputName ?? '')
  return Boolean(name && node.outputs.some((output) => normalizeFieldName(output.name) === name))
}
