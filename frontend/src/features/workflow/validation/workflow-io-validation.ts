import type { WorkflowNode, WorkflowNodeIO, WorkflowSelectorOperand } from '@/types/workflow'
import type { WorkflowValidationIssue, WorkflowValidationScope } from '@/features/workflow/validation/workflow-validation.types'
import {
  findMappingForInput,
  groupDuplicateNames,
  hasOutputName,
  isBlank,
  isDangerousFieldName,
  isRecommendedFieldName,
  isValueTypeCompatible,
  normalizeFieldName,
  resolveMappingSource,
  type WorkflowGraphContext,
} from '@/features/workflow/validation/workflow-validation-utils'

const SELECTOR_ELSE_PORT_ID = 'selector-else'

export function validateNodeIO(node: WorkflowNode, graphContext: WorkflowGraphContext) {
  return [
    ...validateInputItems(node),
    ...validateOutputItems(node),
    ...validateInputMappings(node, graphContext),
    ...validateSelectorConditions(node, graphContext),
    ...validatePromptVariableReferences(node),
    ...validateRequiredOutputs(node),
  ]
}

export function validateInputItems(node: WorkflowNode) {
  if (!shouldValidateInputDefinitions(node)) {
    return []
  }
  return validateIOItems(node, 'input', node.inputs, '输入变量')
}

export function validateOutputItems(node: WorkflowNode) {
  return validateIOItems(node, 'output', node.outputs, '输出变量')
}

export function validateInputMappings(node: WorkflowNode, graphContext: WorkflowGraphContext) {
  if (!shouldValidateInputDefinitions(node)) {
    return []
  }

  const issues: WorkflowValidationIssue[] = []
  const mappings = node.config.inputMappings ?? []

  node.inputs.forEach((input, index) => {
    const inputName = normalizeFieldName(input.name)
    if (!inputName) {
      return
    }

    const mapping = findMappingForInput(input, mappings) ?? mappings[index]
    const fieldPath = `inputs.${index}.mapping`
    if (!mapping || normalizeFieldName(mapping.field) !== inputName) {
      issues.push(createIssue({
        node,
        scope: 'inputMapping',
        fieldPath,
        title: '输入映射缺失',
        message: `输入变量 ${inputName} 还没有配置变量值来源。`,
        suggestion: '请在输入变量行选择一个上游输出，或切换为自定义字符串输入。',
      }))
      return
    }

    if (mapping.sourceType === 'node') {
      if (isBlank(mapping.source)) {
        issues.push(createIssue({
          node,
          scope: 'inputMapping',
          fieldPath,
          title: '上游输出未选择',
          message: `输入变量 ${inputName} 需要选择一个上游输出。`,
          suggestion: '请从“变量值”下拉框中选择可用的前驱节点输出。',
        }))
        return
      }

      const source = resolveMappingSource(mapping, graphContext)
      if (!source?.sourceNode) {
        issues.push(createIssue({
          node,
          scope: 'inputMapping',
          fieldPath,
          title: '引用的上游节点不存在',
          message: `输入变量 ${inputName} 引用了不存在的节点。`,
          suggestion: '请重新选择一个有效的上游输出。',
        }))
        return
      }
      if (!source.sourceOutput) {
        issues.push(createIssue({
          node,
          scope: 'inputMapping',
          fieldPath,
          title: '引用的输出字段不存在',
          message: `输入变量 ${inputName} 引用了 ${source.sourceNode.title} 中不存在的输出。`,
          suggestion: '请重新选择输出字段，或恢复上游节点的输出定义。',
        }))
        return
      }
      if (!isValueTypeCompatible(input.type, source.sourceOutput.type)) {
        issues.push(createIssue({
          node,
          scope: 'inputMapping',
          fieldPath,
          title: '输入类型不匹配',
          message: `输入变量 ${inputName} 需要 ${input.type}，但上游输出是 ${source.sourceOutput.type}。`,
          suggestion: '请调整输入变量类型，或选择类型兼容的上游输出。',
        }))
      }
    }

    if (mapping.sourceType === 'literal' && isBlank(mapping.source)) {
      issues.push(createIssue({
        node,
        scope: 'inputMapping',
        fieldPath,
        title: '自定义输入为空',
        message: `输入变量 ${inputName} 使用自定义输入，但还没有填写值。`,
        suggestion: '请填写自定义字符串，或切换为上游输出。',
      }))
    }
  })

  return issues
}

function shouldValidateInputDefinitions(node: WorkflowNode) {
  if (node.type === 'start' || node.type === 'loop-start' || node.type === 'loop-end' || node.type === 'end') {
    return false
  }
  return node.type !== 'loop' || node.config.loopMode !== 'count'
}

export function validateSelectorConditions(node: WorkflowNode, graphContext: WorkflowGraphContext) {
  if (node.type !== 'selector') {
    return []
  }

  const issues: WorkflowValidationIssue[] = []
  const branches = node.config.selectorBranches ?? []

  if (branches.length === 0) {
    issues.push(createIssue({
      node,
      scope: 'nodeConfig',
      fieldPath: 'config.selectorBranches',
      title: '条件分支缺失',
      message: `${node.title} 至少需要保留一个条件分支。`,
      suggestion: '请添加一个条件分支，并配置选择变量与比较值。',
    }))
    return issues
  }

  branches.forEach((branch, branchIndex) => {
    if (branch.conditions.length === 0) {
      issues.push(createIssue({
        node,
        scope: 'nodeConfig',
        fieldPath: `config.selectorBranches.${branchIndex}.conditions`,
        title: '分支条件缺失',
        message: `条件分支 ${branchIndex + 1} 至少需要保留一个判断条件。`,
        suggestion: '请添加条件，并配置选择变量与比较值。',
      }))
      return
    }

    branch.conditions.forEach((condition, conditionIndex) => {
      const leftPath = `config.selectorBranches.${branchIndex}.conditions.${conditionIndex}.left`
      const rightPath = `config.selectorBranches.${branchIndex}.conditions.${conditionIndex}.right`
      const leftType = validateSelectorOperand({
        node,
        graphContext,
        operand: condition.left,
        fieldPath: leftPath,
        label: '选择变量',
        issues,
      })
      const rightType = validateSelectorOperand({
        node,
        graphContext,
        operand: condition.right,
        fieldPath: rightPath,
        label: '比较值',
        issues,
      })

      if (
        leftType
        && rightType
        && condition.operator !== 'contains'
        && condition.operator !== 'not_contains'
        && !isValueTypeCompatible(leftType, rightType)
        && !isValueTypeCompatible(rightType, leftType)
      ) {
        issues.push(createIssue({
          node,
          scope: 'nodeConfig',
          severity: 'warning',
          fieldPath: rightPath,
          title: '比较类型可能不匹配',
          message: `条件分支 ${branchIndex + 1} 的选择变量类型是 ${leftType}，比较值类型是 ${rightType}。`,
          suggestion: '建议选择类型一致的变量，或调整比较值类型，避免运行时条件判断不符合预期。',
        }))
      }
    })
  })
  issues.push(...validateSelectorBranchConnections(node, graphContext, branches.length))

  return issues
}

function validateSelectorBranchConnections(
  node: WorkflowNode,
  graphContext: WorkflowGraphContext,
  branchCount: number,
) {
  const issues: WorkflowValidationIssue[] = []
  const outgoingEdges = graphContext.outgoingEdges.get(node.id) ?? []

  Array.from({ length: branchCount }, (_, index) => `selector-branch-${index}`).forEach((portID, index) => {
    if (hasEdgeFromSelectorPort(outgoingEdges, portID)) {
      return
    }
    issues.push(createIssue({
      node,
      scope: 'nodeConfig',
      fieldPath: `config.selectorBranches.${index}`,
      title: '条件分支未连接',
      message: `条件分支 ${index + 1} 还没有连接下游节点。`,
      suggestion: '请从该条件分支右侧端口连到后续节点，或连接到结束节点明确结束。',
    }))
  })

  if (!hasEdgeFromSelectorPort(outgoingEdges, SELECTOR_ELSE_PORT_ID)) {
    issues.push(createIssue({
      node,
      scope: 'nodeConfig',
      fieldPath: 'config.selectorElseBranch',
      title: '否则分支未连接',
      message: `${node.title} 的否则分支还没有连接下游节点。`,
      suggestion: '请从“否则”端口连到后续节点，或连接到结束节点明确结束。',
    }))
  }

  return issues
}

function hasEdgeFromSelectorPort(edges: Array<{ sourcePortID?: string | number }>, portID: string) {
  return edges.some((edge) => String(edge.sourcePortID ?? '') === portID)
}

function validateSelectorOperand({
  node,
  graphContext,
  operand,
  fieldPath,
  label,
  issues,
}: {
  node: WorkflowNode
  graphContext: WorkflowGraphContext
  operand: WorkflowSelectorOperand | undefined
  fieldPath: string
  label: '选择变量' | '比较值'
  issues: WorkflowValidationIssue[]
}) {
  if (!operand) {
    issues.push(createSelectorOperandMissingIssue(node, fieldPath, label))
    return undefined
  }

  if (operand.sourceType === 'literal') {
    if (isBlank(getSelectorOperandValue(operand))) {
      issues.push(createSelectorOperandMissingIssue(node, fieldPath, label))
    }
    return operand.valueType
  }

  if (operand.sourceType === 'context') {
    if (isBlank(operand.contextPath ?? operand.source ?? '')) {
      issues.push(createSelectorOperandMissingIssue(node, fieldPath, label))
    }
    return operand.valueType
  }

  const source = normalizeSelectorNodeOperandSource(operand)
  if (isBlank(source)) {
    issues.push(createSelectorOperandMissingIssue(node, fieldPath, label))
    return operand.valueType
  }

  const [sourceNodeId, ...fieldParts] = source.split('.')
  const fieldPathValue = fieldParts.join('.')
  const sourceNode = graphContext.nodeMap.get(sourceNodeId)
  if (!sourceNode) {
    issues.push(createIssue({
      node,
      scope: 'nodeConfig',
      fieldPath,
      title: `${label}引用的节点不存在`,
      message: `${label}引用了不存在的上游节点。`,
      suggestion: '请重新选择一个有效的上游变量。',
    }))
    return operand.valueType
  }

  const sourceOutput = sourceNode.outputs.find((output) => normalizeFieldName(output.name) === normalizeFieldName(fieldPathValue))
  if (!sourceOutput) {
    issues.push(createIssue({
      node,
      scope: 'nodeConfig',
      fieldPath,
      title: `${label}引用的输出不存在`,
      message: `${label}引用了 ${sourceNode.title} 中不存在的输出字段。`,
      suggestion: '请重新选择输出字段，或恢复上游节点的输出定义。',
    }))
    return operand.valueType
  }

  return sourceOutput.type
}

function createSelectorOperandMissingIssue(
  node: WorkflowNode,
  fieldPath: string,
  label: '选择变量' | '比较值',
) {
  return createIssue({
    node,
    scope: 'nodeConfig',
    fieldPath,
    title: `${label}未配置`,
    message: `${node.title} 的${label}还没有配置。`,
    suggestion: label === '选择变量'
      ? '请选择一个上游变量作为待匹配值。'
      : '请填写自定义比较值，或选择一个上游变量作为比较值。',
  })
}

function getSelectorOperandValue(operand: WorkflowSelectorOperand) {
  return String(operand.literalValue ?? operand.source ?? '')
}

function normalizeSelectorNodeOperandSource(operand: WorkflowSelectorOperand) {
  return operand.source ?? [operand.nodeId, operand.fieldPath].filter(Boolean).join('.')
}

export function validatePromptVariableReferences(node: WorkflowNode) {
  if (node.type !== 'llm') {
    return []
  }

  const availableInputs = new Map<string, WorkflowNodeIO>()
  node.inputs.forEach((input) => {
    const name = normalizeFieldName(input.name)
    if (name) {
      availableInputs.set(name, input)
    }
  })

  return [
    ...validatePromptText({
      node,
      label: '系统提示词',
      fieldPath: 'config.systemPrompt',
      text: node.config.systemPrompt ?? node.config.prompt ?? '',
      availableInputs,
      disallowMedia: true,
    }),
    ...validatePromptText({
      node,
      label: '用户提示词',
      fieldPath: 'config.userPrompt',
      text: node.config.userPrompt ?? '',
      availableInputs,
      disallowMedia: false,
    }),
  ]
}

function validatePromptText({
  node,
  label,
  fieldPath,
  text,
  availableInputs,
  disallowMedia,
}: {
  node: WorkflowNode
  label: string
  fieldPath: string
  text: string
  availableInputs: Map<string, WorkflowNodeIO>
  disallowMedia: boolean
}) {
  const issues: WorkflowValidationIssue[] = []
  const references = extractPromptVariableReferences(text)
  const reportedMissing = new Set<string>()
  const reportedMedia = new Set<string>()

  references.forEach((reference) => {
    const input = availableInputs.get(reference.rootName)
    if (!input) {
      if (reportedMissing.has(reference.rootName)) {
        return
      }
      reportedMissing.add(reference.rootName)
      issues.push(createIssue({
        node,
        scope: 'nodeConfig',
        fieldPath,
        title: `${label}变量不存在`,
        message: `${label}引用了不存在的变量 {{${reference.raw}}}。`,
        suggestion: '请从“插入变量”菜单选择当前节点已有输入变量，或先补充对应输入变量。',
      }))
      return
    }

    if (disallowMedia && isMediaValueType(input.type) && !reportedMedia.has(reference.rootName)) {
      reportedMedia.add(reference.rootName)
      issues.push(createIssue({
        node,
        scope: 'nodeConfig',
        severity: 'warning',
        fieldPath,
        title: `${label}引用了视觉变量`,
        message: `${label}引用了 ${input.name}，该变量类型是 ${input.type}。`,
        suggestion: '图片或视频变量建议放在用户提示词中引用，系统提示词保留文本规则说明。',
      }))
    }
  })

  return issues
}

function extractPromptVariableReferences(text: string) {
  const references: Array<{ raw: string; rootName: string }> = []
  const pattern = /\{\{\s*([^{}]+?)\s*\}\}/g
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    const raw = match[1]?.trim() ?? ''
    const rootName = raw.split(/[.[\]\s]/, 1)[0]?.trim() ?? ''
    if (raw && rootName) {
      references.push({ raw, rootName })
    }
  }

  return references
}

function isMediaValueType(type: string) {
  return type === 'Image' || type === 'Video' || type === 'Array<Image>' || type === 'Array<Video>'
}

function validateRequiredOutputs(node: WorkflowNode) {
  const issues: WorkflowValidationIssue[] = []

  if (shouldValidateOutputDefinitions(node) && node.outputs.length === 0) {
    issues.push(createIssue({
      node,
      scope: 'output',
      fieldPath: 'outputs',
      title: '输出变量缺失',
      message: `${node.title} 至少需要保留一个输出变量。`,
      suggestion: '请添加一个输出变量，用于后续节点引用。',
    }))
  }

  if (shouldValidateOutputKey(node) && node.config.outputKey && !hasOutputName(node, node.config.outputKey)) {
    issues.push(createIssue({
      node,
      scope: 'nodeConfig',
      fieldPath: 'config.outputKey',
      title: '输出 Key 不存在',
      message: `配置中的输出 Key ${node.config.outputKey} 不在输出变量列表中。`,
      suggestion: '请将输出 Key 调整为已有输出变量，或补充对应输出变量。',
    }))
  }

  if (shouldValidateReasoningKey(node) && !hasOutputName(node, node.config.reasoningKey)) {
    issues.push(createIssue({
      node,
      scope: 'nodeConfig',
      fieldPath: 'config.reasoningKey',
      title: '思考输出 Key 不存在',
      message: `配置中的思考输出 Key ${node.config.reasoningKey} 不在输出变量列表中。`,
      suggestion: '请关闭思考输出，或补充对应输出变量。',
    }))
  }

  return issues
}

function shouldValidateOutputDefinitions(node: WorkflowNode) {
  return node.type !== 'selector'
    && node.type !== 'loop-start'
    && node.type !== 'loop-end'
    && node.type !== 'end'
}

function shouldValidateOutputKey(node: WorkflowNode) {
  return node.type !== 'start'
    && node.type !== 'selector'
    && node.type !== 'loop'
    && node.type !== 'loop-start'
    && node.type !== 'loop-end'
    && node.type !== 'end'
}

function shouldValidateReasoningKey(node: WorkflowNode) {
  const reasoningKey = node.config.reasoningKey?.trim()
  if (!reasoningKey || node.type !== 'llm') {
    return false
  }
  return Boolean(node.config.thinkingEnabled) || hasOutputName(node, reasoningKey)
}

function validateIOItems(
  node: WorkflowNode,
  scope: Extract<WorkflowValidationScope, 'input' | 'output'>,
  items: WorkflowNodeIO[],
  label: string,
) {
  const issues: WorkflowValidationIssue[] = []
  const duplicateNames = groupDuplicateNames(items)

  items.forEach((item, index) => {
    const name = normalizeFieldName(item.name)
    const fieldPath = `${scope === 'input' ? 'inputs' : 'outputs'}.${index}.name`

    if (!name) {
      issues.push(createIssue({
        node,
        scope,
        fieldPath,
        title: `${label}名未填写`,
        message: `第 ${index + 1} 个${label}缺少变量名。`,
        suggestion: '请填写一个唯一且语义清晰的变量名。',
      }))
      return
    }

    if ((duplicateNames.get(name) ?? 0) > 1) {
      issues.push(createIssue({
        node,
        scope,
        fieldPath,
        title: `${label}名重复`,
        message: `${label} ${name} 在当前节点内重复。`,
        suggestion: '请保持同一节点内变量名唯一。',
      }))
    }

    if (isDangerousFieldName(name)) {
      issues.push(createIssue({
        node,
        scope,
        fieldPath,
        title: `${label}名存在风险`,
        message: `${label} ${name} 是保留字段名，可能带来运行时风险。`,
        suggestion: '请更换为业务语义字段名。',
      }))
      return
    }

    if (!isRecommendedFieldName(name)) {
      issues.push(createIssue({
        node,
        scope,
        severity: 'warning',
        fieldPath,
        title: `${label}名格式不推荐`,
        message: `${label} ${name} 建议仅使用字母、数字和下划线，且不要以数字开头。`,
        suggestion: '建议使用 camelCase 或 snake_case，例如 userInput。',
      }))
    }
  })

  return issues
}

function createIssue({
  node,
  severity = 'error',
  scope,
  fieldPath,
  title,
  message,
  suggestion,
}: {
  node: WorkflowNode
  severity?: WorkflowValidationIssue['severity']
  scope: WorkflowValidationIssue['scope']
  fieldPath?: string
  title: string
  message: string
  suggestion?: string
}): WorkflowValidationIssue {
  return {
    id: `${node.id}:${scope}:${fieldPath ?? title}:${message}`,
    nodeId: node.id,
    severity,
    scope,
    fieldPath,
    title,
    message,
    suggestion,
  }
}
