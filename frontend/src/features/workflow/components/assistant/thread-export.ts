import type { Message } from '@langchain/langgraph-sdk'

import type { AssistantThreadSummary } from '@/api/assistant-history'

import { extractContentFromMessage, extractReasoningContentFromMessage, hasContent } from './message-content'
import { hasToolCalls } from './timeline'
import { getThreadSummaryTitle } from './thread-utils'

function formatToolCalls(message: Message) {
  if (message.type !== 'ai' || !hasToolCalls(message)) {
    return ''
  }

  return (message.tool_calls ?? []).map((call) => `- **Tool:** \`${call.name}\``).join('\n')
}

function sanitizeFilename(name: string) {
  return name.replace(/[^\w\u4e00-\u9fa5 -]/g, '').trim() || 'conversation'
}

function downloadAsFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function formatThreadAsMarkdown(thread: AssistantThreadSummary, messages: Message[]) {
  const title = getThreadSummaryTitle(thread)
  const createdAt = thread.created_at ? new Date(thread.created_at).toLocaleString() : 'Unknown'
  const lines = [`# ${title}`, '', `*Exported on ${new Date().toLocaleString()} · Created ${createdAt}*`, '', '---', '']

  for (const message of messages) {
    if (message.type === 'human') {
      const content = extractContentFromMessage(message)
      if (content) {
        lines.push('## User', '', content, '', '---', '')
      }
      continue
    }

    if (message.type !== 'ai') {
      continue
    }

    const reasoning = extractReasoningContentFromMessage(message)
    const content = extractContentFromMessage(message)
    const toolCalls = formatToolCalls(message)
    if (!content && !toolCalls && !reasoning) {
      continue
    }

    lines.push('## Assistant')
    if (reasoning) {
      lines.push('', '<details>', '<summary>Thinking</summary>', '', reasoning, '', '</details>')
    }
    if (toolCalls) {
      lines.push('', toolCalls)
    }
    if (content && hasContent(message)) {
      lines.push('', content)
    }
    lines.push('', '---', '')
  }

  return `${lines.join('\n').trimEnd()}\n`
}

export function exportThreadAsMarkdown(thread: AssistantThreadSummary, messages: Message[]) {
  downloadAsFile(formatThreadAsMarkdown(thread, messages), `${sanitizeFilename(getThreadSummaryTitle(thread))}.md`, 'text/markdown;charset=utf-8')
}

export function exportThreadAsJSON(thread: AssistantThreadSummary, messages: Message[]) {
  const payload = {
    title: getThreadSummaryTitle(thread),
    thread_id: thread.thread_id,
    created_at: thread.created_at,
    exported_at: new Date().toISOString(),
    messages,
  }
  downloadAsFile(JSON.stringify(payload, null, 2), `${sanitizeFilename(getThreadSummaryTitle(thread))}.json`, 'application/json;charset=utf-8')
}
