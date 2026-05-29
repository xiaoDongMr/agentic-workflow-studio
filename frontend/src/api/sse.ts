export interface SseStreamEvent<TData = unknown> {
  event: string
  data: TData
}

interface PostSseStreamOptions {
  url: string
  body: unknown
  signal?: AbortSignal
  onEvent?: (event: SseStreamEvent) => void
}

function parseSseMessage(rawMessage: string): SseStreamEvent | null {
  const lines = rawMessage.split(/\r?\n/)
  const eventLine = lines.find((line) => line.startsWith('event:'))
  const dataLines = lines.filter((line) => line.startsWith('data:'))
  const event = eventLine?.slice('event:'.length).trim()
  const dataText = dataLines.map((line) => line.slice('data:'.length).trimStart()).join('\n')

  if (!event || !dataText) {
    return null
  }

  return {
    event,
    data: JSON.parse(dataText) as unknown,
  }
}

export async function postSseStream({
  url,
  body,
  signal,
  onEvent,
}: PostSseStreamOptions): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    throw new Error(`流式请求失败：${response.status}`)
  }
  if (!response.body) {
    throw new Error('当前浏览器不支持流式响应')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const consumeBuffer = (flush = false) => {
    const messages = buffer.split(/\n\n/)
    buffer = flush ? '' : (messages.pop() ?? '')

    messages.forEach((message) => {
      const event = parseSseMessage(message.trim())
      if (event) {
        onEvent?.(event)
      }
    })
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) {
      break
    }
    buffer += decoder.decode(value, { stream: true })
    consumeBuffer()
  }

  buffer += decoder.decode()
  consumeBuffer(true)
}
