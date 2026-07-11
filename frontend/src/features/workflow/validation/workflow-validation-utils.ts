import type { WorkflowInputMapping, WorkflowNode, WorkflowNodeIO } from '@/types/workflow'
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

export function buildWorkflowGraphContext(nodes: WorkflowNode[]) {
  const flatNodes = flattenWorkflowNodes(nodes)
  const nodeMap = new Map(flatNodes.map((node) => [node.id, node]))

  return {
    nodes,
    flatNodes,
    nodeMap,
  }
}

export type WorkflowGraphContext = ReturnType<typeof buildWorkflowGraphContext>

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
  const sourceOutput = sourceNode?.outputs.find((output) => normalizeFieldName(output.name) === fieldPath)

  return {
    nodeId,
    fieldPath,
    sourceNode,
    sourceOutput,
  }
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
