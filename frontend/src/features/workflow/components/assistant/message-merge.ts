import type { AIMessage, DefaultToolCall, Message } from '@langchain/langgraph-sdk'

function extractTextFromContent(content: Message['content']) {
  if (typeof content === 'string') {
    return content
  }

  return content
    .map((item) => {
      if (item.type === 'text') {
        return item.text
      }

      if (item.type === 'image_url') {
        return typeof item.image_url === 'string' ? item.image_url : item.image_url.url
      }

      return ''
    })
    .join('\n')
}

function mergeMessageContent(existing: Message['content'], incoming: Message['content']) {
  if (typeof existing === 'string' && typeof incoming === 'string') {
    return `${existing}${incoming}`
  }

  if (Array.isArray(existing) && Array.isArray(incoming)) {
    return [...existing, ...incoming]
  }

  return `${extractTextFromContent(existing)}${extractTextFromContent(incoming)}`
}

function mergeToolCalls(
  existing: AIMessage<DefaultToolCall>['tool_calls'],
  incoming: AIMessage<DefaultToolCall>['tool_calls'],
) {
  const merged = [...(existing ?? [])]

  for (const toolCall of incoming ?? []) {
    const index = merged.findIndex((candidate) =>
      toolCall.id ? candidate.id === toolCall.id : candidate.name === toolCall.name,
    )

    if (index === -1) {
      merged.push(toolCall)
      continue
    }

    merged[index] = {
      ...merged[index],
      ...toolCall,
      args: {
        ...merged[index].args,
        ...toolCall.args,
      },
    }
  }

  return merged.length > 0 ? merged : undefined
}

export function mergePartialMessage(existing: Message | undefined, incoming: Message): Message {
  if (!existing || existing.type !== 'ai' || incoming.type !== 'ai') {
    return incoming
  }

  return {
    ...existing,
    ...incoming,
    additional_kwargs: {
      ...(existing.additional_kwargs ?? {}),
      ...(incoming.additional_kwargs ?? {}),
    },
    content: mergeMessageContent(existing.content, incoming.content),
    tool_calls: mergeToolCalls(existing.tool_calls, incoming.tool_calls),
    invalid_tool_calls: incoming.invalid_tool_calls ?? existing.invalid_tool_calls,
    usage_metadata: incoming.usage_metadata ?? existing.usage_metadata,
  }
}
