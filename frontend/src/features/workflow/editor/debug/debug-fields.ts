import { collectSelectorOperandReferences, getSingleNodeInputDefinitions } from '@/features/workflow/editor/debug/single-node-workflow'
import type { GlobalDebugFieldValue } from '@/features/workflow/editor/workflow-editor.types'
import type { WorkflowNode } from '@/types/workflow'

export function createSingleNodeTrialFields(
  node: WorkflowNode,
  fallbackPayload: Record<string, unknown>,
  allNodes: WorkflowNode[] = [],
) {
  if (node.type === 'selector') {
    return createSelectorTrialFields(node, fallbackPayload, allNodes)
  }
  return getSingleNodeInputDefinitions(node)
    .filter((input) => input.name)
    .map((input) => {
      const value = fallbackPayload[input.name]
      const inputType = getDebugFieldInputType(input.type)
      const structured = inputType === 'json'
      const arrayStructured = isArrayWorkflowType(input.type) && inputType === 'json'
      return {
        name: input.name,
        type: inputType === 'string' && typeof value === 'object' && value !== null ? 'json' : inputType,
        valueType: input.type,
        value: formatInputFieldValue(value, structured || inputType.endsWith('-array'), arrayStructured),
      } satisfies GlobalDebugFieldValue
    })
}

export function createGlobalDebugFields(nodes: WorkflowNode[], previousFields: GlobalDebugFieldValue[]) {
  const startNode = nodes.find((node) => node.type === 'start')
  const definitions = startNode?.outputs.filter((output) => output.name) ?? []
  if (definitions.length === 0) {
    return previousFields
  }
  const previousByName = new Map(previousFields.map((field) => [field.name, field]))
  return definitions.map((definition) => {
    const previous = previousByName.get(definition.name)
    const type = getDebugFieldInputType(definition.type)
    return {
      name: definition.name,
      type,
      valueType: definition.type,
      value: previous?.value ?? formatInputFieldValue(
        undefined,
        type === 'json' || type.endsWith('-array'),
        isArrayWorkflowType(definition.type) && type === 'json',
      ),
    } satisfies GlobalDebugFieldValue
  })
}

export function formatInputFieldValue(value: unknown, structured: boolean, arrayStructured = false) {
  if (value === undefined) {
    return structured ? (arrayStructured ? '[]' : '{}') : ''
  }
  if (typeof value === 'string') {
    return structured ? value : value
  }
  return JSON.stringify(value, null, 2)
}

function createSelectorTrialFields(
  node: WorkflowNode,
  fallbackPayload: Record<string, unknown>,
  allNodes: WorkflowNode[],
) {
  const references = collectSelectorOperandReferences(node, allNodes).filter((reference) => reference.group === 'context')
  return references.map((reference) => {
    const value = fallbackPayload[reference.name]
    const inputType = getDebugFieldInputType(reference.valueType)
    const structured = inputType === 'json'
    const arrayStructured = isArrayWorkflowType(reference.valueType) && inputType === 'json'
    return {
      name: reference.name,
      label: reference.label,
      description: reference.description,
      group: reference.group,
      groupLabel: reference.groupLabel,
      sourceLabel: reference.sourceLabel,
      usageHints: reference.usageHints,
      type: inputType === 'string' && typeof value === 'object' && value !== null ? 'json' : inputType,
      valueType: reference.valueType,
      value: formatInputFieldValue(value, structured || inputType.endsWith('-array'), arrayStructured),
    } satisfies GlobalDebugFieldValue
  })
}

function getDebugFieldInputType(type: string): GlobalDebugFieldValue['type'] {
  const normalized = type.trim().toLowerCase()
  if (normalized === 'image') {
    return 'image'
  }
  if (normalized === 'video') {
    return 'video'
  }
  if (normalized === 'array<image>') {
    return 'image-array'
  }
  if (normalized === 'array<video>') {
    return 'video-array'
  }
  return isStructuredWorkflowType(type) ? 'json' : 'string'
}

function isStructuredWorkflowType(type: string) {
  const normalized = type.toLowerCase()
  return normalized.includes('object') || normalized.includes('array') || normalized.includes('json')
}

function isArrayWorkflowType(type?: string) {
  return Boolean(type?.trim().toLowerCase().startsWith('array'))
}
