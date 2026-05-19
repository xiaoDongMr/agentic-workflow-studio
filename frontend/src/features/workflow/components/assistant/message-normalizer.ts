import type { Message } from '@langchain/langgraph-sdk'
import { MessageTupleManager, toMessageDict } from '@langchain/langgraph-sdk/ui'

import { isRecord } from './message-content'
import type { AssistantMessageNormalizer } from './types'

function isMessageLike(value: unknown): value is Message {
  return isRecord(value) && typeof value.type === 'string' && 'content' in value
}

function isChunkMessageLike(value: unknown): value is Message {
  return isMessageLike(value) && value.type.endsWith('MessageChunk')
}

function shouldSkipMessageByMetadata(metadata?: Record<string, unknown>) {
  return (
    metadata?.langgraph_node === 'TitleMiddleware.after_model' ||
    (Array.isArray(metadata?.tags) && metadata.tags.includes('middleware:title'))
  )
}

export function createAssistantMessageNormalizer(
  tupleManager: MessageTupleManager = new MessageTupleManager(),
): AssistantMessageNormalizer {
  return {
    clear() {
      tupleManager.clear()
    },
    normalizeMessage(rawMessage, metadata) {
      if (!isMessageLike(rawMessage) || shouldSkipMessageByMetadata(metadata)) {
        return null
      }

      if (!isChunkMessageLike(rawMessage)) {
        return rawMessage
      }

      const tupleId = tupleManager.add(rawMessage, metadata)
      if (!tupleId) {
        return rawMessage
      }

      const assembled = tupleManager.get(tupleId)
      if (!assembled?.chunk) {
        return rawMessage
      }

      return toMessageDict(assembled.chunk) as Message
    },
    normalizeMessageTuple(data) {
      if (!Array.isArray(data) || data.length === 0) {
        return null
      }

      return this.normalizeMessage(data[0], isRecord(data[1]) ? data[1] : undefined)
    },
    normalizeMessageList(data) {
      if (!Array.isArray(data)) {
        return []
      }

      return data
        .map((message) => this.normalizeMessage(message))
        .filter((message): message is Message => message !== null)
    },
  }
}
