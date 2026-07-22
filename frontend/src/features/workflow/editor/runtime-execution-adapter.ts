import type {
  TrialRunLoopIterationExecution,
  TrialRunNodeExecution,
  TrialRunTimelineItem,
  WorkflowRuntimeEvent,
  WorkflowTokenUsage,
} from '@/features/workflow/editor/workflow-editor.types'
import type { WorkflowNode } from '@/types/workflow'

type LoopStepRecord = {
  nodeId?: string
  nodeTitle?: string
  log?: string
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  durationMs?: number
  status?: TrialRunNodeExecution['status']
  error?: string
}

export function executionFromRuntimeEvent(
  event: WorkflowRuntimeEvent,
  current?: TrialRunNodeExecution,
  fallbackNode?: WorkflowNode,
): TrialRunNodeExecution {
  const status = statusFromRuntimeEvent(event, current)
  const nodeTitle = event.nodeTitle || current?.nodeTitle || fallbackNode?.title || event.nodeId || '节点'
  const message = event.message || eventTitle(event)
  const strategyHandled = event.type === 'node_log' && ['使用兜底输出', '忽略模型错误'].includes(event.title ?? '')
  const degraded = current?.degraded || strategyHandled
  const tokenUsage = readTokenUsage(event.data) ?? current?.tokenUsage
  return {
    nodeId: event.nodeId || current?.nodeId || fallbackNode?.id || '',
    nodeTitle,
    log: message,
    input: current?.input ?? '{}',
    output: current?.output ?? '{}',
    durationMs: event.durationMs ?? current?.durationMs ?? 0,
    status,
    error: event.error ?? current?.error,
    degraded,
    tokenUsage,
    timeline: mergeTimelineItem(current?.timeline, timelineItemFromRuntimeEvent(event)),
    summaryInput: current?.summaryInput ?? '执行事件',
    summaryOutput: tokenUsage && event.type === 'llm_completed'
      ? formatRuntimeTokenUsage(tokenUsage)
      : event.type === 'llm_token'
        ? '模型正在输出...'
        : degraded && event.type === 'node_completed'
          ? '已按异常策略降级完成'
          : message,
  }
}

export function executionFromLoopRuntimeEvent(
  event: WorkflowRuntimeEvent,
  current?: TrialRunNodeExecution,
  fallbackNode?: WorkflowNode,
): TrialRunNodeExecution {
  const iterationIndex = readLoopIterationIndex(event)
  if (iterationIndex === undefined) {
    return executionFromRuntimeEvent(event, current, fallbackNode)
  }

  const iterationsByIndex = { ...(current?.iterationsByIndex ?? iterationsArrayToMap(current?.loopIterations)) }
  const iterationOrder = mergeIterationOrder(current?.iterationOrder, current?.loopIterations, iterationIndex)
  const currentIteration = iterationsByIndex[iterationIndex]
  const currentIterationExecution = currentIteration
    ? loopIterationToNodeExecution(currentIteration, current, fallbackNode)
    : undefined
  const baseExecution = executionFromRuntimeEvent(event, currentIterationExecution, fallbackNode)
  const iterationExecution = loopIterationExecutionFromEvent(
    event,
    iterationIndex,
    currentIteration,
    fallbackNode,
    baseExecution,
  )
  iterationsByIndex[iterationIndex] = iterationExecution
  const loopIterations = iterationOrder
    .map((index) => iterationsByIndex[index])
    .filter((item): item is TrialRunLoopIterationExecution => Boolean(item))
  const failedIteration = loopIterations.find((item) => item.status === 'error')
  const loopTitle = `第 ${iterationIndex + 1} 轮`
  const errorSummary = failedIteration
    ? `第 ${failedIteration.iterationIndex + 1} 轮 / ${failedIteration.nodeTitle} 失败`
    : undefined

  return {
    ...iterationExecution,
    nodeId: iterationExecution.nodeId,
    nodeTitle: iterationExecution.nodeTitle,
    log: `${loopTitle} · ${iterationExecution.log}`,
    summaryInput: errorSummary ?? `${loopTitle}输入：${iterationExecution.summaryInput ?? '查看详情'}`,
    summaryOutput: errorSummary ?? `${loopTitle}输出：${iterationExecution.summaryOutput ?? '查看详情'}`,
    loopNodeId: readLoopNodeId(event),
    latestIterationIndex: iterationIndex,
    iterationsByIndex,
    iterationOrder,
    loopIterations,
  }
}

export function isLoopBodyRuntimeEvent(event: WorkflowRuntimeEvent) {
  return event.data?.scope === 'loop-body' && readLoopIterationIndex(event) !== undefined
}

export function readLoopNodeId(event: WorkflowRuntimeEvent) {
  const value = event.data?.loopNodeId
  return typeof value === 'string' ? value : undefined
}

export function readLoopBodyNodeId(event: WorkflowRuntimeEvent) {
  const value = event.data?.bodyNodeId
  return typeof value === 'string' ? value : undefined
}

export function getLoopExecutionIterations(execution: TrialRunNodeExecution) {
  const iterationsByIndex = execution.iterationsByIndex
  if (iterationsByIndex) {
    const order = execution.iterationOrder ?? Object.keys(iterationsByIndex).map((key) => Number(key))
    return order
      .map((index) => iterationsByIndex[index])
      .filter((item): item is TrialRunLoopIterationExecution => Boolean(item))
  }
  return execution.loopIterations ?? []
}

function loopIterationToNodeExecution(
  iteration: TrialRunLoopIterationExecution,
  base?: TrialRunNodeExecution,
  fallbackNode?: WorkflowNode,
): TrialRunNodeExecution {
  return {
    nodeId: iteration.nodeId || base?.nodeId || fallbackNode?.id || '',
    nodeTitle: iteration.nodeTitle || base?.nodeTitle || fallbackNode?.title || iteration.nodeId || '循环体节点',
    log: iteration.log,
    input: iteration.input,
    output: iteration.output,
    durationMs: iteration.durationMs,
    status: iteration.status,
    error: iteration.error,
    degraded: iteration.degraded,
    tokenUsage: iteration.tokenUsage,
    timeline: iteration.timeline,
    summaryInput: iteration.summaryInput,
    summaryOutput: iteration.summaryOutput,
    loopNodeId: base?.loopNodeId,
    latestIterationIndex: base?.latestIterationIndex,
    loopIterations: base?.loopIterations,
  }
}

function loopIterationExecutionFromEvent(
  event: WorkflowRuntimeEvent,
  iterationIndex: number,
  current?: TrialRunLoopIterationExecution,
  fallbackNode?: WorkflowNode,
  baseExecution?: TrialRunNodeExecution,
): TrialRunLoopIterationExecution {
  const step = readLoopStep(event)
  const nodeId = baseExecution?.nodeId || readLoopBodyNodeId(event) || event.nodeId || current?.nodeId || fallbackNode?.id || ''
  const nodeTitle = baseExecution?.nodeTitle || event.nodeTitle || current?.nodeTitle || fallbackNode?.title || nodeId || '循环体节点'
  const timeline = baseExecution?.timeline ?? mergeTimelineItem(current?.timeline, timelineItemFromRuntimeEvent(event))
  const tokenUsage = baseExecution?.tokenUsage ?? readTokenUsage(event.data) ?? current?.tokenUsage
  if (!step) {
    return {
      iterationIndex,
      nodeId,
      nodeTitle,
      log: baseExecution?.log ?? event.message ?? eventTitle(event),
      input: baseExecution?.input ?? current?.input ?? '{}',
      output: baseExecution?.output ?? current?.output ?? '{}',
      durationMs: baseExecution?.durationMs ?? event.durationMs ?? current?.durationMs ?? 0,
      status: baseExecution?.status ?? statusFromRuntimeEvent(event, current),
      error: baseExecution?.error ?? event.error ?? current?.error,
      degraded: baseExecution?.degraded ?? current?.degraded,
      tokenUsage,
      timeline,
      summaryInput: baseExecution?.summaryInput ?? current?.summaryInput ?? '执行事件',
      summaryOutput: baseExecution?.summaryOutput
        ?? (tokenUsage && event.type === 'llm_completed' ? formatRuntimeTokenUsage(tokenUsage) : event.message || eventTitle(event)),
    }
  }

  const status = step.status ?? 'success'
  const input = step.input ?? {}
  const output = step.output ?? {}
  const error = step.error || undefined
  return {
    iterationIndex,
    nodeId: step.nodeId || nodeId,
    nodeTitle: step.nodeTitle || nodeTitle,
    log: step.log || event.message || '循环体节点执行完成',
    input: stringifyExecutionValue(input),
    output: stringifyExecutionValue(output),
    durationMs: step.durationMs ?? event.durationMs ?? 0,
    status,
    error,
    degraded: baseExecution?.degraded ?? current?.degraded,
    tokenUsage,
    timeline,
    summaryInput: summarizeExecutionInput(input),
    summaryOutput: status === 'error' ? error || '运行失败' : summarizeExecutionOutput(output),
  }
}

function readLoopStep(event: WorkflowRuntimeEvent): LoopStepRecord | undefined {
  const value = event.data?.loopStep
  if (!isRecord(value)) {
    return undefined
  }

  return {
    nodeId: readString(value.nodeId),
    nodeTitle: readString(value.nodeTitle),
    log: readString(value.log),
    input: isRecord(value.input) ? value.input : {},
    output: isRecord(value.output) ? value.output : {},
    durationMs: readDurationMs(value.durationMs),
    status: readStepStatus(value.status),
    error: readString(value.error),
  }
}

function eventTitle(event: WorkflowRuntimeEvent) {
  if (event.title) {
    return event.title
  }
  const titles: Record<WorkflowRuntimeEvent['type'], string> = {
    node_started: '节点开始执行',
    node_completed: '节点执行完成',
    node_failed: '节点执行失败',
    node_log: '节点日志',
    llm_started: '模型调用开始',
    llm_token: '模型输出片段',
    llm_completed: '模型调用完成',
    llm_retry: '模型调用重试',
    llm_failed: '模型调用失败',
    tool_started: '工具调用开始',
    tool_completed: '工具调用完成',
    tool_failed: '工具调用失败',
  }
  return titles[event.type]
}

function readTokenUsage(data?: Record<string, unknown>): WorkflowTokenUsage | undefined {
  const usage = data?.tokenUsage
  if (!isRecord(usage)) {
    return undefined
  }
  const inputTokens = readTokenCount(usage.inputTokens)
  const outputTokens = readTokenCount(usage.outputTokens)
  const totalTokens = readTokenCount(usage.totalTokens) || inputTokens + outputTokens
  if (totalTokens <= 0) {
    return undefined
  }
  return { inputTokens, outputTokens, totalTokens }
}

function readTokenCount(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(Math.trunc(value), 0)
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.max(Math.trunc(parsed), 0) : 0
  }
  return 0
}

function formatRuntimeTokenUsage(usage: WorkflowTokenUsage) {
  return `Token ${usage.totalTokens} · 输入 ${usage.inputTokens} / 输出 ${usage.outputTokens}`
}

function timelineItemFromRuntimeEvent(event: WorkflowRuntimeEvent): TrialRunTimelineItem {
  const tokenUsage = readTokenUsage(event.data)
  return {
    id: event.id,
    type: event.type,
    level: event.level ?? 'info',
    title: eventTitle(event),
    message: event.token ?? (tokenUsage && event.type === 'llm_completed' ? formatRuntimeTokenUsage(tokenUsage) : event.message),
    timestamp: event.timestamp,
    data: event.data,
  }
}

function mergeTimelineItem(
  timeline: TrialRunTimelineItem[] | undefined,
  item: TrialRunTimelineItem,
): TrialRunTimelineItem[] {
  const items = timeline ? [...timeline] : []
  const last = items.at(-1)
  if (item.type === 'llm_token' && last?.type === 'llm_token') {
    items[items.length - 1] = {
      ...last,
      id: item.id,
      message: `${last.message}${item.message}`.slice(-600),
      timestamp: item.timestamp,
    }
    return items
  }
  if (items.some((existing) => existing.id === item.id)) {
    return items
  }
  return [...items, item].slice(-80)
}

function statusFromRuntimeEvent(event: WorkflowRuntimeEvent, current?: Pick<TrialRunNodeExecution, 'status'>) {
  if (event.type === 'node_failed' || event.type === 'llm_failed' || event.type === 'tool_failed') {
    return 'error' as const
  }
  if (event.type === 'node_completed') {
    return 'success' as const
  }
  if (event.type === 'node_started') {
    return 'running' as const
  }
  return current?.status ?? 'running'
}

function iterationsArrayToMap(iterations: TrialRunLoopIterationExecution[] | undefined) {
  return Object.fromEntries((iterations ?? []).map((iteration) => [iteration.iterationIndex, iteration]))
}

function mergeIterationOrder(
  order: number[] | undefined,
  iterations: TrialRunLoopIterationExecution[] | undefined,
  iterationIndex: number,
) {
  return [...new Set([...(order ?? []), ...(iterations ?? []).map((item) => item.iterationIndex), iterationIndex])]
    .sort((left, right) => left - right)
}

function readLoopIterationIndex(event: WorkflowRuntimeEvent) {
  const value = event.data?.iterationIndex
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(Math.trunc(value), 0)
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.max(Math.trunc(parsed), 0) : undefined
  }
  return undefined
}

function stringifyExecutionValue(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2)
}

function summarizeExecutionOutput(output: unknown) {
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    return previewExecutionValue(output) || '输出完成'
  }
  const record = output as Record<string, unknown>
  const preferredValue = record.output ?? record.result ?? record.answer ?? record.content ?? record.text
  const preferredPreview = previewExecutionValue(preferredValue)
  if (preferredPreview) {
    return preferredPreview
  }
  const firstValuePreview = Object.entries(record)
    .filter(([key]) => key !== 'reasoning_content')
    .map(([, value]) => previewExecutionValue(value))
    .find(Boolean)
  if (firstValuePreview) {
    return firstValuePreview
  }
  const keys = Object.keys(record)
  return keys.length > 0 ? `输出 ${keys.join(' / ')}` : '输出完成'
}

function summarizeExecutionInput(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return previewExecutionValue(input) || '无输入'
  }
  const record = input as Record<string, unknown>
  const preferredValue = record.input ?? record.item ?? record.query ?? record.prompt ?? record.content
  const preferredPreview = previewExecutionValue(preferredValue)
  if (preferredPreview) {
    return preferredPreview
  }
  const firstValuePreview = Object.values(record)
    .map((value) => previewExecutionValue(value))
    .find(Boolean)
  return firstValuePreview || Object.keys(record).join(' / ') || '无输入'
}

function previewExecutionValue(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return ''
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text.replace(/\s+/g, ' ').trim().slice(0, 160)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function readDurationMs(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(Math.round(value), 0)
  }
  return undefined
}

function readStepStatus(value: unknown): TrialRunNodeExecution['status'] | undefined {
  return value === 'error' ? 'error' : value === 'running' ? 'running' : value === 'success' ? 'success' : undefined
}
