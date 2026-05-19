import type { AIMessage, DefaultToolCall, Message, ToolMessage } from '@langchain/langgraph-sdk'

import {
  extractContentFromMessage,
  extractReasoningContentFromMessage,
  extractTextContent,
  hasContent,
  hasReasoning,
  isRecord,
} from './message-content'
import type {
  AssistantMessageGroup,
  AssistantSubagentTask,
  AssistantTimelineItem,
  AssistantTimelineItemType,
  AssistantToolCallWithResult,
} from './types'

export function hasToolCalls(message: Message): message is AIMessage<DefaultToolCall> {
  return message.type === 'ai' && Array.isArray(message.tool_calls) && message.tool_calls.length > 0
}

export function hasSubagentToolCalls(message: Message): boolean {
  return message.type === 'ai' && Array.isArray(message.tool_calls) && message.tool_calls.some((toolCall) => toolCall.name === 'task')
}

export function hasOnlyClarificationToolCalls(message: Message): boolean {
  return (
    message.type === 'ai' &&
    Array.isArray(message.tool_calls) &&
    message.tool_calls.length > 0 &&
    message.tool_calls.every((toolCall) => toolCall.name === 'ask_clarification')
  )
}

export function isClarificationToolMessage(message: Message): message is ToolMessage {
  return message.type === 'tool' && message.name === 'ask_clarification'
}

export function extractClarificationText(message: Message): string | null {
  if (isClarificationToolMessage(message)) {
    const content = extractContentFromMessage(message)
    return content || null
  }

  if (!hasOnlyClarificationToolCalls(message)) {
    return null
  }

  const aiMessage = message as AIMessage<DefaultToolCall>

  for (const toolCall of aiMessage.tool_calls ?? []) {
    if (!isRecord(toolCall.args)) {
      continue
    }

    const question = toolCall.args.question
    if (typeof question === 'string' && question.trim()) {
      return question.trim()
    }
  }

  return null
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

function buildTimelineItem(
  type: AssistantTimelineItemType,
  id: string,
  messages: Message[],
): AssistantTimelineItem {
  const textContents = messages.map(extractContentFromMessage).filter((content) => content.length > 0)
  const reasoningContents = messages
    .map(extractReasoningContentFromMessage)
    .filter((content): content is string => Boolean(content))
  const clarificationText =
    type === 'assistant:clarification'
      ? messages.map(extractClarificationText).find((content): content is string => Boolean(content)) ?? null
      : null
  const toolCalls =
    type === 'assistant:processing'
      ? getToolCallsWithResults(messages).filter(
          (toolCall) => toolCall.call.name !== 'task' && toolCall.call.name !== 'ask_clarification',
        )
      : []
  const subagentTasks = type === 'assistant:subagent' ? getSubagentTasks(messages) : []

  return {
    id,
    type,
    messages,
    textContents,
    reasoningContents,
    clarificationText,
    toolCalls,
    subagentTasks,
  }
}

export function getAssistantTimelineItems(messages: Message[]): AssistantTimelineItem[] {
  const items: AssistantTimelineItem[] = []

  function lastOpenItem() {
    const lastItem = items[items.length - 1]
    if (
      lastItem &&
      lastItem.type !== 'human' &&
      lastItem.type !== 'assistant' &&
      lastItem.type !== 'assistant:clarification'
    ) {
      return lastItem
    }

    return null
  }

  function refreshLastOpenItem(nextMessage: Message) {
    const lastItem = lastOpenItem()
    if (!lastItem) {
      return
    }

    lastItem.messages.push(nextMessage)
    items[items.length - 1] = buildTimelineItem(lastItem.type, lastItem.id, [...lastItem.messages])
  }

  for (const message of messages) {
    if (isHiddenFromUiMessage(message) || message.name === 'todo_reminder') {
      continue
    }

    if (message.type === 'human') {
      items.push(buildTimelineItem('human', message.id ?? `human-${items.length}`, [message]))
      continue
    }

    if (message.type === 'tool') {
      if (isClarificationToolMessage(message)) {
        refreshLastOpenItem(message)
        items.push(buildTimelineItem('assistant:clarification', message.id ?? `clarification-${items.length}`, [message]))
      } else {
        refreshLastOpenItem(message)
      }
      continue
    }

    if (message.type !== 'ai') {
      continue
    }

    const aiMessage: AIMessage<DefaultToolCall> = message
    const hasAiToolCalls = Array.isArray(aiMessage.tool_calls) && aiMessage.tool_calls.length > 0
    const clarificationOnly = hasOnlyClarificationToolCalls(aiMessage)

    if (hasSubagentToolCalls(aiMessage)) {
      items.push(buildTimelineItem('assistant:subagent', aiMessage.id ?? `subagent-${items.length}`, [aiMessage]))
    } else if (clarificationOnly) {
      items.push(
        buildTimelineItem('assistant:clarification', aiMessage.id ?? `clarification-call-${items.length}`, [aiMessage]),
      )
    } else if (hasReasoning(aiMessage) || hasAiToolCalls) {
      const lastItem = items[items.length - 1]
      if (lastItem?.type === 'assistant:processing') {
        refreshLastOpenItem(aiMessage)
      } else {
        items.push(buildTimelineItem('assistant:processing', aiMessage.id ?? `processing-${items.length}`, [aiMessage]))
      }
    }

    if (hasContent(aiMessage) && !hasAiToolCalls) {
      items.push(buildTimelineItem('assistant', aiMessage.id ?? `assistant-${items.length}`, [aiMessage]))
    }
  }

  return items
}

export function getAssistantMessageGroups(messages: Message[]): AssistantMessageGroup[] {
  return getAssistantTimelineItems(messages)
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

    message.tool_calls?.forEach((toolCall, index) => {
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

    message.tool_calls?.forEach((toolCall, index) => {
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
