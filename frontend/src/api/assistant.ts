import { Client } from '@langchain/langgraph-sdk/client'

export interface AssistantStreamEvent {
  event: string
  data: unknown
  id?: string
}

interface StreamAssistantOptions {
  message: string
  threadId?: string
  signal?: AbortSignal
  onThreadId?: (threadId: string) => void
  onEvent?: (event: AssistantStreamEvent) => void
}

interface AssistantRunsStreamPayload {
  input: {
    messages: Array<{
      role: 'user'
      content: string
    }>
  }
  config?: {
    configurable: {
      thread_id: string
    }
  }
  streamMode: Array<'messages' | 'values'>
  onDisconnect: 'cancel'
  signal?: AbortSignal
  onRunCreated?: (metadata: { thread_id?: string; run_id: string }) => void
}

const DEFAULT_API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

let cachedClient: Client | null = null

function getAssistantClient(): Client {
  if (cachedClient) {
    return cachedClient
  }

  const normalizedBase = DEFAULT_API_BASE_URL.endsWith('/')
    ? DEFAULT_API_BASE_URL
    : `${DEFAULT_API_BASE_URL}/`

  cachedClient = new Client({
    apiUrl: new URL(normalizedBase, window.location.origin).toString(),
  })
  return cachedClient
}

export async function streamAssistantMessage({
  message,
  threadId,
  signal,
  onThreadId,
  onEvent,
}: StreamAssistantOptions): Promise<void> {
  const client = getAssistantClient()
  const payload: AssistantRunsStreamPayload = {
    input: {
      messages: [
        {
          role: 'user',
          content: message,
        },
      ],
    },
    config: threadId
      ? {
          configurable: {
            thread_id: threadId,
          },
        }
      : undefined,
    streamMode: ['messages', 'values'],
    onDisconnect: 'cancel',
    signal,
    onRunCreated: (metadata) => {
      if (metadata.thread_id) {
        onThreadId?.(metadata.thread_id)
      }
    },
  }

  const stream = threadId
    ? client.runs.stream(threadId, 'lead_agent', payload)
    : client.runs.stream(null, 'lead_agent', payload)

  for await (const chunk of stream) {
    onEvent?.({
      event: chunk.event,
      data: chunk.data,
      id: 'id' in chunk && typeof chunk.id === 'string' ? chunk.id : undefined,
    })
  }
}
