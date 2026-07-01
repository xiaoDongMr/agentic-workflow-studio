import type { WorkflowInputMapping, WorkflowNodeIO } from '@/types/workflow'
import { normalizeValueType, type WorkflowVariableSource } from '@/features/workflow/components/node-config/variable-utils'

export function createEmptyIOItem(sourceOption?: WorkflowVariableSource): WorkflowNodeIO {
  return {
    name: sourceOption?.value.split('.').at(-1) ?? '',
    type: sourceOption ? normalizeValueType(sourceOption.type) : 'String',
    description: '',
  }
}

export function syncMappingAtIndex(
  mappings: WorkflowInputMapping[],
  index: number,
  nextMapping: WorkflowInputMapping,
) {
  if (index < mappings.length) {
    return mappings.map((mapping, mappingIndex) => (mappingIndex === index ? { ...mapping, ...nextMapping } : mapping))
  }
  return [...mappings, nextMapping]
}
