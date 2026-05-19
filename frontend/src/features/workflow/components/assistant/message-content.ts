import type { Message } from '@langchain/langgraph-sdk'

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
