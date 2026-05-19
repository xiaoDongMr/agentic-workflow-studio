import type { AIMessage, DefaultToolCall, Message, ToolMessage } from '@langchain/langgraph-sdk'

export type AssistantMessageGroupType =
  | 'human'
  | 'assistant'
  | 'assistant:processing'
  | 'assistant:clarification'
  | 'assistant:subagent'

export interface AssistantMessageGroup {
  id: string
  type: AssistantMessageGroupType
  messages: Message[]
}

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

const THINK_TAG_RE = /<think>\s*([\s\S]*?)\s*<\/think>/g

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function extractTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim()
  }

  if (!Array.isArray(content)) {
    return ''
  }

  return content
    .map((item) => {
      if (typeof item === 'string') {
        return item
      }

      if (isRecord(item) && typeof item.text === 'string') {
        return item.text
      }

      return ''
    })
    .join('\n')
    .trim()
}

function splitInlineReasoning(content: string) {
  const reasoningParts: string[] = []
  const cleaned = content
    .replace(THINK_TAG_RE, (_, reasoning: string) => {
      const normalized = reasoning.trim()
      if (normalized) {
        reasoningParts.push(normalized)
      }
      return ''
    })
    .trim()

  return {
    content: cleaned,
    reasoning: reasoningParts.length > 0 ? reasoningParts.join('\n\n') : null,
  }
}

export function extractContentFromMessage(message: Message): string {
  if (typeof message.content === 'string') {
    return splitInlineReasoning(message.content).content
  }

  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (part.type === 'text') {
          return part.text
        }

        if (part.type === 'image_url') {
          const imageUrl = typeof part.image_url === 'string' ? part.image_url : part.image_url.url
          return imageUrl ? `![image](${imageUrl})` : ''
        }

        return ''
      })
      .join('\n')
      .trim()
  }

  return ''
}

export function extractReasoningContentFromMessage(message: Message): string | null {
  if (message.type !== 'ai') {
    return null
  }

  const reasoningContent = message.additional_kwargs?.reasoning_content
  if (typeof reasoningContent === 'string' && reasoningContent.trim()) {
    return reasoningContent.trim()
  }

  if (Array.isArray(message.content)) {
    const firstPart = message.content[0]
    const thinking = isRecord(firstPart) ? (firstPart as Record<string, unknown>).thinking : undefined
    if (typeof thinking === 'string' && thinking.trim()) {
      return thinking.trim()
    }
  }

  if (typeof message.content === 'string') {
    return splitInlineReasoning(message.content).reasoning
  }

  return null
}

export function hasContent(message: Message): boolean {
  return extractContentFromMessage(message).length > 0
}

export function hasReasoning(message: Message): boolean {
  return extractReasoningContentFromMessage(message) !== null
}

export function hasToolCalls(message: Message): message is AIMessage<DefaultToolCall> {
  return message.type === 'ai' && Array.isArray(message.tool_calls) && message.tool_calls.length > 0
}

export function hasSubagentToolCalls(message: Message): boolean {
  return message.type === 'ai' && Array.isArray(message.tool_calls) && message.tool_calls.some((toolCall) => toolCall.name === 'task')
}

export function isClarificationToolMessage(message: Message): message is ToolMessage {
  return message.type === 'tool' && message.name === 'ask_clarification'
}

export function isHiddenFromUiMessage(message: Message): boolean {
  const content = extractContentFromMessage(message)
  return (
    message.additional_kwargs?.hide_from_ui === true ||
    message.name === 'summary' ||
    message.name === 'loop_warning' ||
    (message.type === 'human' && content.startsWith('<system-reminder>'))
  )
}

export function getAssistantMessageGroups(messages: Message[]): AssistantMessageGroup[] {
  if (messages.length === 0) {
    return []
  }

  const groups: AssistantMessageGroup[] = []

  function lastOpenGroup() {
    const lastGroup = groups[groups.length - 1]
    if (
      lastGroup &&
      lastGroup.type !== 'human' &&
      lastGroup.type !== 'assistant' &&
      lastGroup.type !== 'assistant:clarification'
    ) {
      return lastGroup
    }

    return null
  }

  for (const message of messages) {
    if (isHiddenFromUiMessage(message) || message.name === 'todo_reminder') {
      continue
    }

    if (message.type === 'human') {
      groups.push({
        id: message.id ?? `human-${groups.length}`,
        type: 'human',
        messages: [message],
      })
      continue
    }

    if (message.type === 'tool') {
      if (isClarificationToolMessage(message)) {
        lastOpenGroup()?.messages.push(message)
        groups.push({
          id: message.id ?? `clarification-${groups.length}`,
          type: 'assistant:clarification',
          messages: [message],
        })
      } else {
        lastOpenGroup()?.messages.push(message)
      }
      continue
    }

    if (message.type !== 'ai') {
      continue
    }

    const aiMessage: AIMessage<DefaultToolCall> = message
    const hasAiToolCalls = Array.isArray(aiMessage.tool_calls) && aiMessage.tool_calls.length > 0

    if (hasSubagentToolCalls(aiMessage)) {
      groups.push({
        id: aiMessage.id ?? `subagent-${groups.length}`,
        type: 'assistant:subagent',
        messages: [aiMessage],
      })
    } else if (hasReasoning(aiMessage) || hasAiToolCalls) {
      const lastGroup = groups[groups.length - 1]
      if (lastGroup?.type !== 'assistant:processing') {
        groups.push({
          id: aiMessage.id ?? `processing-${groups.length}`,
          type: 'assistant:processing',
          messages: [aiMessage],
        })
      } else {
        lastGroup.messages.push(aiMessage)
      }
    }

    if (hasContent(aiMessage) && !hasAiToolCalls) {
      groups.push({
        id: aiMessage.id ?? `assistant-${groups.length}`,
        type: 'assistant',
        messages: [aiMessage],
      })
    }
  }

  return groups
}

export function findToolResult(toolCallId: string, messages: Message[]): ToolMessage | undefined {
  return messages.find(
    (message): message is ToolMessage => message.type === 'tool' && message.tool_call_id === toolCallId,
  )
}

export function getToolCallsWithResults(messages: Message[]): AssistantToolCallWithResult[] {
  const results: AssistantToolCallWithResult[] = []

  for (const message of messages) {
    if (!hasToolCalls(message)) {
      continue
    }

    const toolCalls = message.tool_calls ?? []

    toolCalls.forEach((toolCall, index) => {
      const fallbackId = `${message.id ?? 'ai'}-${index}`
      const toolCallId = toolCall.id ?? fallbackId
      const resultMessage = toolCall.id ? findToolResult(toolCall.id, messages) : undefined
      const state = resultMessage ? (resultMessage.status === 'error' ? 'error' : 'completed') : 'pending'

      results.push({
        id: toolCallId,
        call: toolCall,
        aiMessage: message,
        index,
        result: resultMessage,
        state,
      })
    })
  }

  return results
}

function extractToolMessageText(message?: ToolMessage): string | undefined {
  if (!message) {
    return undefined
  }

  const text = extractTextContent(message.content)
  return text || undefined
}

function parseSubagentTaskStatus(result?: string): AssistantSubagentTask['status'] {
  if (!result) {
    return 'in_progress'
  }

  if (result.startsWith('Task Succeeded. Result:')) {
    return 'completed'
  }

  if (result.startsWith('Task failed.') || result.startsWith('Task timed out')) {
    return 'failed'
  }

  return 'in_progress'
}

function normalizeSubagentTaskResult(result?: string): string | undefined {
  if (!result) {
    return undefined
  }

  if (result.startsWith('Task Succeeded. Result:')) {
    return result.split('Task Succeeded. Result:')[1]?.trim() || undefined
  }

  if (result.startsWith('Task failed.')) {
    return result.split('Task failed.')[1]?.trim() || undefined
  }

  return result
}

export function getSubagentTasks(messages: Message[]): AssistantSubagentTask[] {
  const tasks: AssistantSubagentTask[] = []

  for (const message of messages) {
    if (!hasToolCalls(message)) {
      continue
    }

    const toolCalls = message.tool_calls ?? []

    toolCalls.forEach((toolCall, index) => {
      if (toolCall.name !== 'task') {
        return
      }

      const fallbackId = `${message.id ?? 'task'}-${index}`
      const taskId = toolCall.id ?? fallbackId
      const resultMessage = toolCall.id ? findToolResult(toolCall.id, messages) : undefined
      const resultText = extractToolMessageText(resultMessage)

      tasks.push({
        id: taskId,
        description: typeof toolCall.args.description === 'string' ? toolCall.args.description : '子任务',
        prompt: typeof toolCall.args.prompt === 'string' ? toolCall.args.prompt : '',
        subagentType: typeof toolCall.args.subagent_type === 'string' ? toolCall.args.subagent_type : 'general',
        result: normalizeSubagentTaskResult(resultText),
        status: parseSubagentTaskStatus(resultText),
      })
    })
  }

  return tasks
}

export function formatStructuredData(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (value === null || value === undefined) {
    return ''
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
