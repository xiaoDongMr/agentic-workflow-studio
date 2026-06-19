import { http } from '@/api/http'
import { postSseStream, type SseStreamEvent } from '@/api/sse'
import type {
  TrialRunNodeExecution,
  WorkflowRuntimeEvent,
} from '@/features/workflow/editor/workflow-editor.types'
import type { WorkflowDocument } from '@/types/workflow'

export interface WorkflowProjectPreviewNode {
  id: string
  title: string
  type: WorkflowDocument['nodes'][number]['type']
  position: {
    x: number
    y: number
  }
}

export interface WorkflowProjectPreviewEdge {
  id: string
  source: string
  target: string
}

export interface WorkflowProjectPreview {
  nodes: WorkflowProjectPreviewNode[]
  edges: WorkflowProjectPreviewEdge[]
}

export interface WorkflowProjectSummary {
  id: string
  name: string
  description: string
  status: string
  currentDraftVersionId: string | null
  latestPublishedVersionId: string | null
  nodeCount: number
  edgeCount: number
  updatedAt: string
  preview: WorkflowProjectPreview
}

export interface WorkflowProjectPage {
  items: WorkflowProjectSummary[]
  page: number
  pageSize: number
  total: number
}

export type WorkflowProjectFilter = 'all' | 'simple' | 'complex'

export interface WorkflowProjectListParams {
  page?: number
  pageSize?: number
  query?: string
  filter?: WorkflowProjectFilter
}

export interface WorkflowVersionSummary {
  id: string
  version: string
  name: string
  description: string
  nodeCount: number
  edgeCount: number
  createdAt: string
  updatedAt: string
  isCurrent: boolean
}

interface WorkflowSaveDraftResponse {
  project: WorkflowProjectSummary
  workflow: WorkflowDocument
}

interface WorkflowRunStep {
  nodeId: string
  nodeTitle: string
  log: string
  input: Record<string, unknown>
  output: Record<string, unknown>
  durationMs: number
  status: 'running' | 'success' | 'error'
  error?: string | null
}

interface WorkflowRunResponse {
  output: Record<string, unknown>
  state: Record<string, unknown>
  steps: WorkflowRunStep[]
}

interface WorkflowStreamOptions {
  signal?: AbortSignal
  onStep?: (execution: TrialRunNodeExecution) => void
  onWorkflowEvent?: (event: WorkflowRuntimeEvent) => void
  onEvent?: (event: WorkflowStreamEvent) => void
}

interface WorkflowStreamEvent extends SseStreamEvent {
  event: 'metadata' | 'workflow_event' | 'step' | 'final' | 'error'
}

const DEFAULT_API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'
const MAX_WORKFLOW_LOOP_CANVAS_WIDTH = 1200

function stringify(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function summarizeOutput(output: Record<string, unknown>) {
  const keys = Object.keys(output)
  return keys.length > 0 ? `输出 ${keys.join(' / ')}` : '输出完成'
}

function toTrialRunExecution(step: WorkflowRunStep): TrialRunNodeExecution {
  const error = step.error ?? undefined
  const summaryOutput =
    step.status === 'error'
      ? error || '运行失败'
      : step.status === 'running'
        ? '执行中…'
        : summarizeOutput(step.output)
  return {
    nodeId: step.nodeId,
    nodeTitle: step.nodeTitle,
    log: step.log,
    input: stringify(step.input),
    output: stringify(step.output),
    durationMs: step.durationMs,
    status: step.status,
    error,
    summaryInput: Object.keys(step.input).join(' / ') || '无输入',
    summaryOutput,
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

function parseWorkflowRuntimeEvent(data: unknown): WorkflowRuntimeEvent {
  return data as WorkflowRuntimeEvent
}

function normalizeWorkflowStreamEvent(event: SseStreamEvent): WorkflowStreamEvent {
  return {
    event: event.event as WorkflowStreamEvent['event'],
    data: event.data,
  }
}

function sanitizeLoopCanvasWidth(width?: number) {
  if (typeof width !== 'number' || !Number.isFinite(width)) {
    return width
  }
  return Math.min(Math.max(Math.round(width), 0), MAX_WORKFLOW_LOOP_CANVAS_WIDTH)
}

function sanitizeWorkflowDocument(workflow: WorkflowDocument): WorkflowDocument {
  return {
    ...workflow,
    nodes: workflow.nodes.map(sanitizeWorkflowNode),
  }
}

function sanitizeWorkflowNode(node: WorkflowDocument['nodes'][number]): WorkflowDocument['nodes'][number] {
  const loopBodyNodes = node.config.loopBodyNodes?.map(sanitizeWorkflowNode)

  return {
    ...node,
    config: {
      ...node.config,
      loopCanvasWidth: sanitizeLoopCanvasWidth(node.config.loopCanvasWidth),
      loopBodyNodes,
    },
  }
}

export async function runWorkflow(
  workflow: WorkflowDocument,
  input: Record<string, unknown>,
): Promise<TrialRunNodeExecution[]> {
  const normalizedWorkflow = sanitizeWorkflowDocument(workflow)
  const { data } = await http.post<WorkflowRunResponse>('/workflows/run', {
    workflow: normalizedWorkflow,
    input,
  })

  return data.steps.map(toTrialRunExecution)
}

export async function listWorkflowProjects(params: WorkflowProjectListParams = {}): Promise<WorkflowProjectPage> {
  const { data } = await http.get<WorkflowProjectPage>('/workflows', {
    params: {
      page: params.page,
      pageSize: params.pageSize,
      q: params.query,
      filter: params.filter,
    },
  })
  return data
}

export async function getWorkflowDraft(workflowId: string): Promise<WorkflowDocument> {
  const { data } = await http.get<WorkflowDocument>(`/workflows/${workflowId}/draft`)
  return sanitizeWorkflowDocument(data)
}

export async function listWorkflowVersions(workflowId: string): Promise<WorkflowVersionSummary[]> {
  const { data } = await http.get<WorkflowVersionSummary[]>(`/workflows/${workflowId}/versions`)
  return data
}

export async function getWorkflowVersion(workflowId: string, versionId: string): Promise<WorkflowDocument> {
  const { data } = await http.get<WorkflowDocument>(`/workflows/${workflowId}/versions/${versionId}`)
  return sanitizeWorkflowDocument(data)
}

export async function saveWorkflowDraft(workflow: WorkflowDocument): Promise<WorkflowSaveDraftResponse> {
  const normalizedWorkflow = sanitizeWorkflowDocument(workflow)
  const { data } = await http.post<WorkflowSaveDraftResponse>('/workflows/draft', {
    workflow: normalizedWorkflow,
  })
  return {
    project: data.project,
    workflow: sanitizeWorkflowDocument(data.workflow),
  }
}

export async function updateWorkflowProject(
  workflowId: string,
  payload: { name: string; description: string },
): Promise<WorkflowProjectSummary> {
  const { data } = await http.patch<WorkflowProjectSummary>(`/workflows/${workflowId}`, payload)
  return data
}

export async function deleteWorkflowProject(workflowId: string): Promise<void> {
  await http.delete(`/workflows/${workflowId}`)
}

export async function duplicateWorkflowProject(workflowId: string, name?: string): Promise<WorkflowSaveDraftResponse> {
  const { data } = await http.post<WorkflowSaveDraftResponse>(`/workflows/${workflowId}/duplicate`, {
    name,
  })
  return {
    project: data.project,
    workflow: sanitizeWorkflowDocument(data.workflow),
  }
}

export async function streamWorkflow(
  workflow: WorkflowDocument,
  input: Record<string, unknown>,
  options: WorkflowStreamOptions = {},
): Promise<TrialRunNodeExecution[]> {
  const executions: TrialRunNodeExecution[] = []
  const normalizedWorkflow = sanitizeWorkflowDocument(workflow)

  await postSseStream({
    url: workflowApiUrl('/workflows/stream'),
    body: {
      workflow: normalizedWorkflow,
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
      } else if (event.event === 'workflow_event') {
        options.onWorkflowEvent?.(parseWorkflowRuntimeEvent(event.data))
      }
    },
  })

  return executions
}
