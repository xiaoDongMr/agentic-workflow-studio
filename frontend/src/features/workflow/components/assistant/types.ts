import type { AIMessage, DefaultToolCall, Message, ToolMessage } from '@langchain/langgraph-sdk'

export type AssistantTimelineItemType =
  | 'human'
  | 'assistant'
  | 'assistant:processing'
  | 'assistant:clarification'
  | 'assistant:subagent'

export interface AssistantTimelineItem {
  id: string
  type: AssistantTimelineItemType
  messages: Message[]
  textContents: string[]
  reasoningContents: string[]
  clarificationText: string | null
  toolCalls: AssistantToolCallWithResult[]
  subagentTasks: AssistantSubagentTask[]
}

export type AssistantMessageGroupType = AssistantTimelineItemType
export type AssistantMessageGroup = AssistantTimelineItem

export interface AssistantToolCallWithResult {
  id: string
  call: DefaultToolCall
  aiMessage: AIMessage<DefaultToolCall>
  index: number
  result?: ToolMessage
  state: 'pending' | 'completed' | 'error'
}

export interface AssistantSubagentTask {
  id: string
  description: string
  prompt: string
  subagentType: string
  result?: string
  status: 'in_progress' | 'completed' | 'failed'
}

export interface AssistantMessageNormalizer {
  clear(): void
  normalizeMessage(rawMessage: unknown, metadata?: Record<string, unknown>): Message | null
  normalizeMessageTuple(data: unknown): Message | null
  normalizeMessageList(data: unknown): Message[]
}

export interface NoticeMessage {
  id: string
  tone: 'error' | 'info'
  content: string
}
