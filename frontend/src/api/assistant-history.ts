import type { Message } from '@langchain/langgraph-sdk'

import { http } from './http'

export interface AssistantThreadSummary {
  thread_id: string
  assistant_id?: string | null
  display_name?: string | null
  status?: string | null
  metadata?: Record<string, unknown>
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

export async function listAssistantThreads(limit = 50): Promise<AssistantThreadSummary[]> {
  const response = await http.get<{ data: AssistantThreadSummary[] }>('/threads', {
    params: {
      limit,
      offset: 0,
    },
  })
  return response.data.data
}

export async function getAssistantThreadMessages(
  threadId: string,
  beforeSeq?: number,
): Promise<AssistantThreadMessagesResponse> {
  const response = await http.get<AssistantThreadMessagesResponse>(`/threads/${encodeURIComponent(threadId)}/messages`, {
    params: {
      limit: 100,
      before_seq: beforeSeq,
    },
  })
  return response.data
}
