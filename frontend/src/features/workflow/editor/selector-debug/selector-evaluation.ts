import { SELECTOR_OPERATOR_LABELS } from '@/features/workflow/components/node-config/selector-utils'
import type { WorkflowNode, WorkflowSelectorOperand } from '@/types/workflow'

export function buildSelectorEvaluation(
  node: WorkflowNode,
  input: Record<string, unknown>,
  output: Record<string, unknown>,
) {
  const outputKey = node.config.outputKey || 'branch'
  const branchOutput = String(output[outputKey] ?? output.branch ?? node.config.selectorElseBranch ?? 'else')

  const branchResults = (node.config.selectorBranches ?? []).map((branch, branchIndex) => {
    const conditions = branch.conditions.map((condition) => {
      const leftValue = resolveSelectorPreviewOperand(condition.left, input)
      const rightValue = resolveSelectorPreviewOperand(condition.right, input)
      const leftLabel = formatSelectorPreviewOperand(condition.left)
      const rightLabel = formatSelectorPreviewOperand(condition.right)
      return {
        id: condition.id,
        leftLabel,
        rightLabel,
        leftValueLabel: leftLabel,
        rightValueLabel: rightLabel,
        leftValue,
        rightValue,
        operatorLabel: SELECTOR_OPERATOR_LABELS[condition.operator] || condition.operator,
        matched: compareSelectorPreviewValues(leftValue, condition.operator, rightValue),
      }
    })
    const rawLabel = branch.label?.trim()
    const branchDisplayLabel = rawLabel && !/^branch_\d+$/i.test(rawLabel) ? rawLabel : `条件 ${branchIndex + 1}`
    const matched = conditions.length > 0 && conditions.every((condition) => condition.matched)
    return {
      id: branch.id,
      label: rawLabel || branchDisplayLabel,
      displayLabel: branchDisplayLabel,
      matched,
      summary: `${conditions.length} 条条件`,
      conditions,
    }
  })

  const matchedBranch = branchResults.find((branch) => branch.label === branchOutput || branch.displayLabel === branchOutput)
    ?? branchResults.find((branch) => branch.matched)
  const elseMatched = !matchedBranch && ['否则', node.config.selectorElseBranch || 'else', 'else'].includes(branchOutput)
  const matchedExpression = matchedBranch
    ? matchedBranch.conditions
      .map((condition) => `${condition.leftLabel} ${condition.operatorLabel} ${condition.rightLabel}`.trim())
      .join(' && ')
    : (typeof output.matched === 'string' ? output.matched : '')

  return {
    outputKey,
    branchOutput,
    branchOutputLabel: matchedBranch?.displayLabel || (elseMatched ? '否则' : branchOutput),
    matchedExpression,
    matchedBranchLabel: matchedBranch?.displayLabel || (elseMatched ? '否则' : branchOutput),
    branchResults,
    elseMatched,
  }
}

function resolveSelectorPreviewOperand(operand: WorkflowSelectorOperand, input: Record<string, unknown>) {
  if (operand.sourceType === 'literal') {
    return operand.literalValue ?? operand.source ?? ''
  }
  if (operand.sourceType === 'context') {
    return getByPath(input, operand.contextPath ?? operand.source ?? '')
  }
  const source = operand.source ?? [operand.nodeId, operand.fieldPath].filter(Boolean).join('.')
  if (source && source in input) {
    return input[source]
  }
  const nestedNodeValue = operand.nodeId ? input[operand.nodeId] : undefined
  if (nestedNodeValue && typeof nestedNodeValue === 'object' && !Array.isArray(nestedNodeValue)) {
    return getByPath(nestedNodeValue as Record<string, unknown>, operand.fieldPath ?? '')
  }
  return undefined
}

function formatSelectorPreviewOperand(operand: WorkflowSelectorOperand) {
  if (operand.sourceType === 'literal') {
    return '自定义值'
  }
  return operand.displayLabel || operand.source || [operand.nodeId, operand.fieldPath].filter(Boolean).join('.')
}

function compareSelectorPreviewValues(left: unknown, operator: string, right: unknown) {
  if (operator === 'equals') {
    return left === right
  }
  if (operator === 'not_equals') {
    return left !== right
  }
  if (operator === 'length_gt') {
    return selectorValueLength(left) > selectorValueNumber(right)
  }
  if (operator === 'length_gte') {
    return selectorValueLength(left) >= selectorValueNumber(right)
  }
  if (operator === 'length_lt') {
    return selectorValueLength(left) < selectorValueNumber(right)
  }
  if (operator === 'length_lte') {
    return selectorValueLength(left) <= selectorValueNumber(right)
  }
  if (operator === 'not_contains') {
    return selectorValueToString(left).includes(selectorValueToString(right)) === false
  }
  return selectorValueToString(left).includes(selectorValueToString(right))
}

function selectorValueLength(value: unknown) {
  if (value == null) {
    return 0
  }
  if (typeof value === 'string' || Array.isArray(value)) {
    return value.length
  }
  if (typeof value === 'object') {
    return Object.keys(value).length
  }
  return String(value).length
}

function selectorValueNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function selectorValueToString(value: unknown) {
  if (value == null) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  return formatResolvedValue(value)
}

export function formatResolvedValue(value: unknown) {
  if (value === undefined) {
    return '未提供'
  }
  if (value === null) {
    return 'null'
  }
  if (typeof value === 'string') {
    return value || '""'
  }
  return JSON.stringify(value, null, 2)
}

function getByPath(value: Record<string, unknown>, path: string) {
  if (!path) {
    return value
  }
  if (Object.prototype.hasOwnProperty.call(value, path)) {
    return value[path]
  }
  return path.split('.').reduce<unknown>((current, part) => {
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      return (current as Record<string, unknown>)[part]
    }
    return undefined
  }, value)
}
