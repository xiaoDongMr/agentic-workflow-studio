import type {
  WorkflowNode,
  WorkflowSelectorBranch,
  WorkflowSelectorCondition,
  WorkflowSelectorOperand,
  WorkflowSelectorOperator,
} from '@/types/workflow'

type RawSelectorOperand = Partial<WorkflowSelectorOperand> & {
  sourceType?: WorkflowSelectorOperand['sourceType'] | 'reference' | string
}

export const SELECTOR_OPERATOR_LABELS: Record<WorkflowSelectorOperator, string> = {
  equals: '等于',
  not_equals: '不等于',
  length_gt: '长度大于',
  length_gte: '长度大于等于',
  length_lt: '长度小于',
  length_lte: '长度小于等于',
  contains: '包含',
  not_contains: '不包含',
}

export const SELECTOR_IF_BRANCH = 'if'
export const SELECTOR_ELSE_BRANCH = 'else'

const DEFAULT_OPERATOR: WorkflowSelectorOperator = 'equals'

export function getSelectorBranches(node: WorkflowNode): WorkflowSelectorBranch[] {
  if (node.config.selectorBranches?.length) {
    return normalizeSelectorBranches(node.config.selectorBranches)
  }

  const parsedBranches = parsePromptRules(node.config.prompt)
  if (parsedBranches.length) {
    return parsedBranches
  }

  return [createSelectorBranch(1)]
}

export function normalizeSelectorBranches(branches: WorkflowSelectorBranch[] | undefined): WorkflowSelectorBranch[] {
  return branches?.length ? branches.map(normalizeBranch) : [createSelectorBranch(1)]
}

export function getSelectorElseBranch(node: WorkflowNode) {
  return node.config.selectorElseBranch?.trim() || SELECTOR_ELSE_BRANCH
}

export function createSelectorBranch(index: number): WorkflowSelectorBranch {
  return {
    id: createSelectorId('branch'),
    label: index === 1 ? SELECTOR_IF_BRANCH : `branch_${index}`,
    conditions: [createSelectorCondition()],
  }
}

export function createSelectorCondition(reference = ''): WorkflowSelectorCondition {
  return {
    id: createSelectorId('condition'),
    operator: DEFAULT_OPERATOR,
    left: reference ? createSelectorOperandFromNodeSource(reference) : createSelectorOperand('node', ''),
    right: createSelectorOperand('literal', ''),
  }
}

export function createSelectorOperand(
  sourceType: WorkflowSelectorOperand['sourceType'],
  source: string,
  valueType = 'String',
): WorkflowSelectorOperand {
  if (sourceType === 'literal') {
    return { sourceType, source, literalValue: source, valueType }
  }
  if (sourceType === 'context') {
    return { sourceType, source, contextPath: source, displayLabel: source, valueType }
  }
  return createSelectorOperandFromNodeSource(source, valueType)
}

export function createSelectorOperandFromVariable(source: {
  nodeId: string
  fieldPath: string
  type: string
  displayLabel: string
  value: string
}): WorkflowSelectorOperand {
  return {
    sourceType: 'node',
    source: source.value,
    nodeId: source.nodeId,
    fieldPath: source.fieldPath,
    displayLabel: source.displayLabel,
    valueType: source.type,
  }
}

export function serializeSelectorBranches(branches: WorkflowSelectorBranch[]) {
  return branches
    .flatMap((branch) =>
      branch.conditions
        .filter((condition) => getOperandSource(condition.left).trim() || getOperandSource(condition.right).trim())
        .map((condition) => `${formatOperand(condition.left)} ${SELECTOR_OPERATOR_LABELS[condition.operator]} ${formatOperand(condition.right)}=>${branch.label.trim() || branch.id}`),
    )
    .join('\n')
}

function parsePromptRules(prompt: string): WorkflowSelectorBranch[] {
  const branches = new Map<string, WorkflowSelectorBranch>()

  prompt
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes('=>'))
    .forEach((line) => {
      const [conditionValue, branchLabel] = line.split('=>', 2).map((part) => part.trim())
      if (!conditionValue || !branchLabel) {
        return
      }
      const branch = branches.get(branchLabel) ?? {
        id: createSelectorId('branch'),
        label: branchLabel,
        conditions: [],
      }
      branch.conditions.push({
        ...createSelectorCondition(),
        operator: 'contains',
        left: createSelectorOperand('node', ''),
        right: createSelectorOperand('literal', conditionValue),
      })
      branches.set(branchLabel, branch)
    })

  return [...branches.values()]
}

function normalizeBranch(branch: WorkflowSelectorBranch): WorkflowSelectorBranch {
  return {
    id: branch.id || createSelectorId('branch'),
    label: branch.label || 'branch',
    conditions: branch.conditions.length ? branch.conditions.map(normalizeCondition) : [createSelectorCondition()],
  }
}

function normalizeCondition(condition: WorkflowSelectorCondition): WorkflowSelectorCondition {
  return {
    id: condition.id || createSelectorId('condition'),
    operator: normalizeOperator(condition.operator),
    left: normalizeOperand(condition.left ?? createSelectorOperand('node', '')),
    right: normalizeOperand(condition.right ?? createSelectorOperand('literal', '')),
  }
}

function normalizeOperand(operand: RawSelectorOperand): WorkflowSelectorOperand {
  const sourceType = String(operand.sourceType || 'literal')
  if (sourceType === 'literal') {
    const literalValue = operand.literalValue ?? operand.source ?? ''
    return {
      sourceType: 'literal',
      source: String(literalValue),
      literalValue,
      valueType: operand.valueType || 'String',
    }
  }
  if (sourceType === 'context') {
    const contextPath = operand.contextPath ?? operand.source ?? ''
    return {
      sourceType: 'context',
      source: contextPath,
      contextPath,
      displayLabel: operand.displayLabel || contextPath,
      valueType: operand.valueType || 'String',
    }
  }
  if (sourceType === 'reference') {
    const source = operand.source ?? ''
    return createSelectorOperandFromNodeSource(source, operand.valueType || 'String', operand.displayLabel || source)
  }
  const nodeId = operand.nodeId ?? ''
  const fieldPath = operand.fieldPath ?? ''
  const source = operand.source ?? [nodeId, fieldPath].filter(Boolean).join('.')
  return {
    sourceType: 'node',
    source,
    nodeId: nodeId || source.split('.')[0] || '',
    fieldPath: fieldPath || source.split('.').slice(1).join('.'),
    displayLabel: operand.displayLabel || source,
    valueType: operand.valueType || 'String',
  }
}

function normalizeOperator(operator: WorkflowSelectorOperator): WorkflowSelectorOperator {
  return Object.hasOwn(SELECTOR_OPERATOR_LABELS, operator) ? operator : DEFAULT_OPERATOR
}

function formatOperand(operand: WorkflowSelectorOperand) {
  if (operand.sourceType === 'literal') {
    return String(operand.literalValue ?? operand.source ?? '')
  }
  return `{{${operand.displayLabel || getOperandSource(operand)}}}`
}

function createSelectorId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function createSelectorOperandFromNodeSource(source: string, valueType = 'String', displayLabel?: string): WorkflowSelectorOperand {
  const [nodeId, ...pathParts] = source.split('.')
  const fieldPath = pathParts.join('.')
  return {
    sourceType: 'node',
    source,
    nodeId: nodeId || '',
    fieldPath,
    displayLabel: displayLabel || source,
    valueType,
  }
}

function getOperandSource(operand: WorkflowSelectorOperand) {
  if (operand.sourceType === 'literal') {
    return String(operand.literalValue ?? operand.source ?? '')
  }
  if (operand.sourceType === 'context') {
    return operand.contextPath ?? operand.source ?? ''
  }
  return operand.source ?? [operand.nodeId, operand.fieldPath].filter(Boolean).join('.')
}
