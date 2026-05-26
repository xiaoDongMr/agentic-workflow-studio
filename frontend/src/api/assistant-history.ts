import type { Message } from '@langchain/langgraph-sdk'

import { http } from './http'

export interface AssistantThreadSummary {
  thread_id: string
  assistant_id?: string | null
  display_name?: string | null
  status?: string | null
  metadata?: Record<string, unknown>
  values?: {
    title?: string
    [key: string]: unknown
  }
  created_at?: string
  updated_at?: string
}

export interface AssistantThreadRun {
  run_id: string
  thread_id: string
  assistant_id?: string | null
  status?: string | null
  metadata?: Record<string, unknown>
  kwargs?: Record<string, unknown>
  created_at?: string
  updated_at?: string
}

export interface AssistantThreadMessageRecord {
  thread_id: string
  run_id: string
  event_type: string
  category: string
  content: Message
  metadata: Record<string, unknown>
  seq: number
  created_at: string
}

export interface AssistantThreadMessagesResponse {
  data: AssistantThreadMessageRecord[]
  has_more: boolean
}

export interface AssistantRunFeedback {
  feedback_id?: string
  thread_id: string
  run_id: string
  rating: 1 | -1
  comment?: string | null
  created_at?: string
}

export async function listAssistantThreads(limit = 50): Promise<AssistantThreadSummary[]> {
  const response = await http.post<AssistantThreadSummary[]>('/threads/search', {
    limit,
    offset: 0,
  })
  return response.data
}

export async function listAssistantThreadRuns(threadId: string): Promise<AssistantThreadRun[]> {
  const response = await http.get<AssistantThreadRun[]>(`/threads/${encodeURIComponent(threadId)}/runs`)
  return response.data
}

export async function getAssistantThreadRunMessages(
  threadId: string,
  runId: string,
  beforeSeq?: number,
): Promise<AssistantThreadMessagesResponse> {
  const response = await http.get<AssistantThreadMessagesResponse>(
    `/threads/${encodeURIComponent(threadId)}/runs/${encodeURIComponent(runId)}/messages`,
    {
      params: {
        limit: 100,
        before_seq: beforeSeq,
      },
    },
  )
  return response.data
}

export async function renameAssistantThread(threadId: string, title: string): Promise<void> {
  await http.post(`/threads/${encodeURIComponent(threadId)}/state`, {
    values: {
      title,
    },
  })
}

export async function deleteAssistantThread(threadId: string): Promise<void> {
  await http.delete(`/threads/${encodeURIComponent(threadId)}`)
}

export async function listAssistantThreadFeedback(threadId: string): Promise<Record<string, AssistantRunFeedback>> {
  const response = await http.get<Record<string, AssistantRunFeedback>>(`/threads/${encodeURIComponent(threadId)}/feedback`)
  return response.data
}

export async function upsertAssistantRunFeedback(
  threadId: string,
  runId: string,
  rating: 1 | -1,
): Promise<AssistantRunFeedback> {
  const response = await http.put<AssistantRunFeedback>(
    `/threads/${encodeURIComponent(threadId)}/runs/${encodeURIComponent(runId)}/feedback`,
    {
      rating,
    },
  )
  return response.data
}

export async function deleteAssistantRunFeedback(threadId: string, runId: string): Promise<void> {
  await http.delete(`/threads/${encodeURIComponent(threadId)}/runs/${encodeURIComponent(runId)}/feedback`)
}
