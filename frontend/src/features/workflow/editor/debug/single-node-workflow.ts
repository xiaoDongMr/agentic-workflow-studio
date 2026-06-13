import { normalizeWorkflowNodeForRun } from '@/features/workflow/editor/workflow-editor.utils'
import type {
  WorkflowDocument,
  WorkflowInputMapping,
  WorkflowNode,
  WorkflowNodeIO,
  WorkflowSelectorOperand,
} from '@/types/workflow'

export interface SelectorOperandReference {
  name: string
  label: string
  description: string
  group: 'node' | 'context'
  groupLabel: string
  sourceLabel: string
  valueType: string
  usageHints: string[]
}

export type DebugInputDefinition = WorkflowNodeIO & {
  label?: string
  group?: 'node' | 'context' | 'general'
  groupLabel?: string
  sourceLabel?: string
}

export function normalizeWorkflowNodesForRun(nodes: WorkflowNode[]) {
  return nodes.map((node) => normalizeSelectorLabelsForNode(node, nodes))
}

export function normalizeSelectorLabelsForNode(node: WorkflowNode, allNodes: WorkflowNode[] = []): WorkflowNode {
  if (node.type !== 'selector') {
    return normalizeWorkflowNodeForRun(node)
  }

  const nodeById = new Map(allNodes.map((item) => [item.id, item]))
  const normalized = cloneWorkflowNode(normalizeWorkflowNodeForRun(node))
  normalized.config.selectorBranches = normalized.config.selectorBranches?.map((branch) => ({
    ...branch,
    conditions: branch.conditions.map((condition) => ({
      ...condition,
      left: normalizeSelectorOperandDisplayLabel(condition.left, nodeById),
      right: normalizeSelectorOperandDisplayLabel(condition.right, nodeById),
    })),
  }))
  return normalized
}

export function toSingleNodeTestWorkflow(node: WorkflowNode, allNodes: WorkflowNode[] = []): WorkflowDocument {
  const singleNode = cloneWorkflowNode(normalizeSelectorLabelsForNode(node, allNodes))
  const inputDefinitions = getSingleNodeInputDefinitions(singleNode, allNodes)
  singleNode.inputs = inputDefinitions
  const contextMappings = createSingleNodeContextMappings(singleNode, allNodes)

  return {
    id: `single-node-${singleNode.id}`,
    name: `${singleNode.title} 单节点测试`,
    description: '仅执行当前节点，用于快速验证节点配置。',
    version: 'v0.1.0',
    nodes: [
      {
        ...singleNode,
        config: {
          ...singleNode.config,
          inputMappings: contextMappings,
        },
      },
    ],
    edges: [],
  }
}

export function getSingleNodeInputDefinitions(node: WorkflowNode, allNodes: WorkflowNode[] = []): WorkflowNodeIO[] {
  if (node.type === 'selector') {
    return collectSelectorOperandReferences(node, allNodes)
      .map((reference) => ({
        name: reference.name,
        label: reference.label,
        type: reference.valueType,
        description: reference.description,
        group: reference.group,
        groupLabel: reference.groupLabel,
        sourceLabel: reference.sourceLabel,
      }))
  }

  return uniqueDebugInputDefinitions(node.inputs)
}

export function collectSelectorOperandReferences(
  node: WorkflowNode,
  allNodes: WorkflowNode[] = [],
): SelectorOperandReference[] {
  const nodeById = new Map(allNodes.map((item) => [item.id, item]))
  const references = new Map<string, SelectorOperandReference>()

  for (const [branchIndex, branch] of (node.config.selectorBranches ?? []).entries()) {
    for (const [conditionIndex, condition] of branch.conditions.entries()) {
      for (const [operandIndex, operand] of [condition.left, condition.right].entries()) {
        if (!operand || operand.sourceType === 'literal') {
          continue
        }
        const name = getSelectorTrialInputName(operand)
        if (!name) {
          continue
        }
        const usageLabel = `分支 ${branchIndex + 1} / 第 ${conditionIndex + 1} 条 / ${operandIndex === 0 ? '待匹配' : '比较'}`
        const nextGroup = operand.sourceType === 'context' ? 'context' : 'node'
        const sourceNode = operand.nodeId ? nodeById.get(operand.nodeId) : undefined
        const displayLabel = operand.sourceType === 'node' && sourceNode
          ? formatSelectorNodeReferenceLabel(sourceNode, operand.fieldPath || name.split('.').slice(1).join('.'))
          : formatSelectorOperandFallbackLabel(operand, name)
        const next = references.get(name) ?? {
          name,
          label: displayLabel,
          description: operand.sourceType === 'context' ? '来自运行输入，可用于模拟入口参数。' : '来自上游节点输出，可用于模拟引用变量。',
          group: nextGroup,
          groupLabel: operand.sourceType === 'context' ? '运行输入' : '上游引用',
          sourceLabel: operand.sourceType === 'context' ? '运行输入引用' : '上游变量引用',
          valueType: operand.valueType || 'String',
          usageHints: [],
        }
        if (!next.usageHints.includes(usageLabel)) {
          next.usageHints.push(usageLabel)
        }
        references.set(name, next)
      }
    }
  }

  return [...references.values()].sort((left, right) => {
    if (left.group !== right.group) {
      return left.group === 'node' ? -1 : 1
    }
    return left.label.localeCompare(right.label, 'zh-CN')
  })
}

function cloneWorkflowNode(node: WorkflowNode): WorkflowNode {
  return {
    ...node,
    position: { ...node.position },
    inputs: node.inputs.map((item) => ({ ...item })),
    outputs: node.outputs.map((item) => ({ ...item })),
    config: {
      ...node.config,
      inputMappings: node.config.inputMappings.map((item) => ({ ...item })),
      selectorBranches: node.config.selectorBranches?.map((branch) => ({
        ...branch,
        conditions: branch.conditions.map((condition) => ({
          ...condition,
          left: { ...condition.left },
          right: { ...condition.right },
        })),
      })),
    },
  }
}

function normalizeSelectorOperandDisplayLabel(
  operand: WorkflowSelectorOperand,
  nodeById: Map<string, WorkflowNode>,
): WorkflowSelectorOperand {
  if (operand.sourceType !== 'node') {
    return { ...operand }
  }

  const sourceNode = operand.nodeId ? nodeById.get(operand.nodeId) : undefined
  const fieldPath = operand.fieldPath || (operand.source ?? '').split('.').slice(1).join('.')
  return {
    ...operand,
    displayLabel: sourceNode ? formatSelectorNodeReferenceLabel(sourceNode, fieldPath) : operand.displayLabel || operand.source,
  }
}

function uniqueDebugInputDefinitions(definitions: DebugInputDefinition[]): DebugInputDefinition[] {
  const seen = new Set<string>()
  return definitions.filter((definition) => {
    if (!definition.name || seen.has(definition.name)) {
      return false
    }
    seen.add(definition.name)
    return true
  })
}

function createSingleNodeContextMappings(node: WorkflowNode, allNodes: WorkflowNode[] = []): WorkflowInputMapping[] {
  const inputDefinitions = getSingleNodeInputDefinitions(node, allNodes)
  if (inputDefinitions.length > 0) {
    const mappingsByField = new Map(node.config.inputMappings.map((mapping) => [mapping.field, mapping]))
    return inputDefinitions
      .filter((input) => input.name)
      .map((input) => {
        const mapping = mappingsByField.get(input.name)
        if (mapping?.sourceType === 'literal') {
          return { ...mapping }
        }
        return {
          field: input.name,
          sourceType: 'context',
          source: input.name,
          valueType: input.type,
        }
      })
  }

  return node.config.inputMappings.map(normalizeSingleNodeMapping)
}

function normalizeSingleNodeMapping(mapping: WorkflowInputMapping): WorkflowInputMapping {
  if (mapping.sourceType !== 'node') {
    return { ...mapping }
  }

  return {
    ...mapping,
    sourceType: 'context',
    source: mapping.field,
  }
}

function getSelectorTrialInputName(operand: WorkflowSelectorOperand) {
  if (operand.sourceType === 'context') {
    return operand.contextPath ?? operand.source ?? ''
  }
  return operand.source ?? [operand.nodeId, operand.fieldPath].filter(Boolean).join('.')
}

function formatSelectorNodeReferenceLabel(node: WorkflowNode, fieldPath: string) {
  return fieldPath ? `${node.title}.${fieldPath}` : node.title
}

function formatSelectorOperandFallbackLabel(operand: WorkflowSelectorOperand, name: string) {
  if (operand.sourceType === 'context') {
    return operand.displayLabel || operand.contextPath || operand.source || name
  }

  const fieldPath = operand.fieldPath || (operand.source ?? name).split('.').slice(1).join('.')
  if (fieldPath) {
    return operand.displayLabel && operand.displayLabel !== operand.source ? operand.displayLabel : fieldPath
  }
  return operand.displayLabel && operand.displayLabel !== operand.source ? operand.displayLabel : '节点输出'
}
