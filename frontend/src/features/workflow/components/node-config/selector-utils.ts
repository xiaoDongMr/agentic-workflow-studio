import type {
  WorkflowNode,
  WorkflowSelectorBranch,
  WorkflowSelectorCondition,
  WorkflowSelectorOperand,
  WorkflowSelectorOperator,
} from '@/types/workflow'

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
    return node.config.selectorBranches.map(normalizeBranch)
  }

  const parsedBranches = parsePromptRules(node.config.prompt)
  if (parsedBranches.length) {
    return parsedBranches
  }

  return [createSelectorBranch(1)]
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
    left: createSelectorOperand('reference', reference),
    right: createSelectorOperand('literal', ''),
  }
}

export function createSelectorOperand(
  sourceType: WorkflowSelectorOperand['sourceType'],
  source: string,
  valueType = 'String',
): WorkflowSelectorOperand {
  return { sourceType, source, valueType }
}

export function serializeSelectorBranches(branches: WorkflowSelectorBranch[]) {
  return branches
    .flatMap((branch) =>
      branch.conditions
        .filter((condition) => condition.left.source.trim() || condition.right.source.trim())
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
        left: createSelectorOperand('reference', ''),
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
  const legacyLeft = condition.left ?? createSelectorOperand('reference', condition.field ?? '')
  const legacyRight = condition.right ?? createSelectorOperand('literal', condition.value ?? '', condition.valueType ?? 'String')
  return {
    id: condition.id || createSelectorId('condition'),
    operator: normalizeOperator(condition.operator),
    left: normalizeOperand(legacyLeft),
    right: normalizeOperand(legacyRight),
  }
}

function normalizeOperand(operand: WorkflowSelectorOperand): WorkflowSelectorOperand {
  return {
    sourceType: operand.sourceType === 'literal' ? 'literal' : 'reference',
    source: operand.source ?? '',
    valueType: operand.valueType || 'String',
  }
}

function normalizeOperator(operator: WorkflowSelectorOperator): WorkflowSelectorOperator {
  return Object.hasOwn(SELECTOR_OPERATOR_LABELS, operator) ? operator : DEFAULT_OPERATOR
}

function formatOperand(operand: WorkflowSelectorOperand) {
  return operand.sourceType === 'reference' ? `{{${operand.source}}}` : operand.source
}

function createSelectorId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}
