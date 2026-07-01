import {
  collectSelectorOperandReferences,
  getSingleNodeInputDefinitions,
  type DebugInputDefinition,
} from '@/features/workflow/editor/debug/single-node-workflow'
import type { GlobalDebugFieldValue } from '@/features/workflow/editor/workflow-editor.types'
import type { WorkflowNode } from '@/types/workflow'

type DebugFieldDefinition = DebugInputDefinition & Partial<Omit<GlobalDebugFieldValue, 'type' | 'value' | 'valueType'>>

export function createSingleNodeTrialFields(
  node: WorkflowNode,
  fallbackPayload: Record<string, unknown>,
  allNodes: WorkflowNode[] = [],
) {
  if (node.type === 'selector') {
    return createSelectorTrialFields(node, fallbackPayload, allNodes)
  }
  const definitions = getSingleNodeInputDefinitions(node, allNodes)
  return definitions
    .filter((input) => input.name)
    .map((input) => createDebugFieldFromDefinition(input, fallbackPayload))
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
    return createDebugFieldFromDefinition(definition, previous ? { [definition.name]: parsePreviousFieldValue(previous) } : {})
  })
}

export function formatInputFieldValue(value: unknown, structured: boolean, arrayStructured = false) {
  if (value === undefined) {
    return structured ? (arrayStructured ? '[]' : '{}') : ''
  }
  if (!structured) {
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  }
  return JSON.stringify(coerceStructuredFieldValue(value, arrayStructured), null, 2)
}

export function areDebugFieldsEqual(left: GlobalDebugFieldValue[], right: GlobalDebugFieldValue[]) {
  if (left.length !== right.length) {
    return false
  }
  return left.every((leftField, index) => {
    const rightField = right[index]
    return Boolean(
      rightField &&
      leftField.name === rightField.name &&
      leftField.type === rightField.type &&
      leftField.valueType === rightField.valueType &&
      leftField.value === rightField.value &&
      leftField.label === rightField.label &&
      leftField.description === rightField.description &&
      leftField.group === rightField.group &&
      leftField.groupLabel === rightField.groupLabel &&
      leftField.sourceLabel === rightField.sourceLabel &&
      areStringArraysEqual(leftField.usageHints, rightField.usageHints)
    )
  })
}

function createSelectorTrialFields(
  node: WorkflowNode,
  fallbackPayload: Record<string, unknown>,
  allNodes: WorkflowNode[],
) {
  const references = collectSelectorOperandReferences(node, allNodes)
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
      value: formatInputFieldValue(
        value,
        structured || inputType.endsWith('-array'),
        arrayStructured || inputType.endsWith('-array'),
      ),
    } satisfies GlobalDebugFieldValue
  })
}

function createDebugFieldFromDefinition(
  definition: DebugFieldDefinition,
  fallbackPayload: Record<string, unknown>,
) {
  const value = fallbackPayload[definition.name]
  const inputType = getDebugFieldInputType(definition.type)
  const structured = inputType === 'json'
  const arrayStructured = isArrayWorkflowType(definition.type) && inputType === 'json'
  return {
    name: definition.name,
    label: definition.label,
    description: definition.description,
    group: definition.group,
    groupLabel: definition.groupLabel,
    sourceLabel: definition.sourceLabel,
    type: inputType === 'string' && typeof value === 'object' && value !== null ? 'json' : inputType,
    valueType: definition.type,
    value: formatInputFieldValue(
      value,
      structured || inputType.endsWith('-array'),
      arrayStructured || inputType.endsWith('-array'),
    ),
  } satisfies GlobalDebugFieldValue
}

function parsePreviousFieldValue(field: GlobalDebugFieldValue) {
  if (field.type !== 'json') {
    return field.value
  }
  try {
    return JSON.parse(field.value) as unknown
  } catch {
    return field.value
  }
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

function coerceStructuredFieldValue(value: unknown, arrayStructured: boolean) {
  if (typeof value === 'string') {
    try {
      return coerceStructuredFieldValue(JSON.parse(value) as unknown, arrayStructured)
    } catch {
      return arrayStructured ? [] : {}
    }
  }
  if (arrayStructured) {
    return Array.isArray(value) ? value : []
  }
  return value
}

function areStringArraysEqual(left?: string[], right?: string[]) {
  if (!left?.length && !right?.length) {
    return true
  }
  if (!left || !right || left.length !== right.length) {
    return false
  }
  return left.every((item, index) => item === right[index])
}
