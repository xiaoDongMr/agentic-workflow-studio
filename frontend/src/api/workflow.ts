import { http } from '@/api/http'
import { postSseStream, type SseStreamEvent } from '@/api/sse'
import type { TrialRunNodeExecution } from '@/features/workflow/editor/workflow-editor.types'
import type { WorkflowDocument } from '@/types/workflow'

interface WorkflowRunStep {
  nodeId: string
  nodeTitle: string
  log: string
  input: Record<string, unknown>
  output: Record<string, unknown>
  durationMs: number
  status: 'success' | 'error'
}

interface WorkflowRunResponse {
  output: Record<string, unknown>
  state: Record<string, unknown>
  steps: WorkflowRunStep[]
}

interface WorkflowStreamOptions {
  signal?: AbortSignal
  onStep?: (execution: TrialRunNodeExecution) => void
  onEvent?: (event: WorkflowStreamEvent) => void
}

interface WorkflowStreamEvent extends SseStreamEvent {
  event: 'metadata' | 'step' | 'final' | 'error'
}

const DEFAULT_API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

function stringify(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function summarizeOutput(output: Record<string, unknown>) {
  const keys = Object.keys(output)
  return keys.length > 0 ? `输出 ${keys.join(' / ')}` : '输出完成'
}

function toTrialRunExecution(step: WorkflowRunStep): TrialRunNodeExecution {
  return {
    nodeId: step.nodeId,
    nodeTitle: step.nodeTitle,
    log: step.log,
    input: stringify(step.input),
    output: stringify(step.output),
    durationMs: step.durationMs,
    status: step.status,
    summaryInput: Object.keys(step.input).join(' / ') || '无输入',
    summaryOutput: summarizeOutput(step.output),
  }
}

function workflowApiUrl(path: string) {
  const normalizedBase = DEFAULT_API_BASE_URL.endsWith('/')
    ? DEFAULT_API_BASE_URL
    : `${DEFAULT_API_BASE_URL}/`
  return new URL(`${normalizedBase}${path.replace(/^\//, '')}`, window.location.origin).toString()
}

function parseStepEvent(data: unknown): WorkflowRunStep {
  return data as WorkflowRunStep
}

function normalizeWorkflowStreamEvent(event: SseStreamEvent): WorkflowStreamEvent {
  return {
    event: event.event as WorkflowStreamEvent['event'],
    data: event.data,
  }
}

export async function runWorkflow(
  workflow: WorkflowDocument,
  input: Record<string, unknown>,
): Promise<TrialRunNodeExecution[]> {
  const { data } = await http.post<WorkflowRunResponse>('/workflows/run', {
    workflow,
    input,
  })

  return data.steps.map(toTrialRunExecution)
}

export async function streamWorkflow(
  workflow: WorkflowDocument,
  input: Record<string, unknown>,
  options: WorkflowStreamOptions = {},
): Promise<TrialRunNodeExecution[]> {
  const executions: TrialRunNodeExecution[] = []

  await postSseStream({
    url: workflowApiUrl('/workflows/stream'),
    body: {
      workflow,
      input,
    },
    signal: options.signal,
    onEvent: (rawEvent) => {
      const event = normalizeWorkflowStreamEvent(rawEvent)
      if (event.event === 'error') {
        const errorData = event.data as { message?: string }
        throw new Error(errorData.message || '工作流流式运行失败')
      }
      options.onEvent?.(event)
      if (event.event === 'step') {
        const execution = toTrialRunExecution(parseStepEvent(event.data))
        executions.push(execution)
        options.onStep?.(execution)
      }
    },
  })

  return executions
}
