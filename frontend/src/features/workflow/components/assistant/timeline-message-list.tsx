import type { Message } from '@langchain/langgraph-sdk'
import type { ReactNode } from 'react'
import { useState } from 'react'
import {
  Check,
  CheckCircle2,
  CircleAlert,
  Clipboard,
  GitBranch,
  Lightbulb,
  Loader2,
  MessageCircleQuestionMark,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react'

import { cn } from '@/lib/utils'

import type { AssistantTimelineItem, NoticeMessage } from './types'
import { extractContentFromMessage, extractReasoningContentFromMessage } from './message-content'
import { SubagentTaskCard, ToolCallCard } from './tool-cards'
import { ExpandableSection, StatusPill, TextContent } from './ui-primitives'

interface TimelineMessageListProps {
  items: AssistantTimelineItem[]
  notices: NoticeMessage[]
  isStreaming: boolean
  threadId?: string
  currentRunId?: string
  feedbackByRunId: Record<string, { rating: 1 | -1 }>
  onFeedback: (runId: string, rating: 1 | -1) => void
}

interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

function getMessageRunId(message: Message): string | undefined {
  const runId = message.additional_kwargs?.run_id
  return typeof runId === 'string' ? runId : undefined
}

function getItemRunId(item: AssistantTimelineItem, fallbackRunId?: string): string | undefined {
  return item.messages.map(getMessageRunId).find(Boolean) ?? fallbackRunId
}

function getItemClipboardText(item: AssistantTimelineItem): string {
  return item.messages
    .map((message) => extractContentFromMessage(message) || extractReasoningContentFromMessage(message) || '')
    .filter(Boolean)
    .join('\n\n')
}

function readTokenCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function getItemTokenUsage(item: AssistantTimelineItem): TokenUsage {
  const seen = new Set<string>()

  return item.messages.reduce<TokenUsage>(
    (usage, message, index) => {
      const rawUsage = (message as Message & { usage_metadata?: Record<string, unknown> }).usage_metadata
      if (!rawUsage) {
        return usage
      }

      const identity = message.id ?? `${message.type}-${index}`
      if (seen.has(identity)) {
        return usage
      }
      seen.add(identity)

      const inputTokens = readTokenCount(rawUsage.input_tokens)
      const outputTokens = readTokenCount(rawUsage.output_tokens)
      const totalTokens = readTokenCount(rawUsage.total_tokens) || inputTokens + outputTokens

      return {
        inputTokens: usage.inputTokens + inputTokens,
        outputTokens: usage.outputTokens + outputTokens,
        totalTokens: usage.totalTokens + totalTokens,
      }
    },
    { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  )
}

function CopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false)

  if (!content) {
    return null
  }

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(content).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1200)
        })
      }}
      className="inline-flex h-7 items-center gap-1 rounded-lg border border-white/8 bg-slate-950/80 px-2 text-[11px] text-slate-400 transition-colors hover:border-blue-400/30 hover:text-white"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
      {copied ? '已复制' : '复制'}
    </button>
  )
}

function FeedbackButtons({
  feedback,
  onFeedback,
}: {
  feedback?: { rating: 1 | -1 }
  onFeedback: (rating: 1 | -1) => void
}) {
  return (
    <div className="inline-flex items-center rounded-lg border border-white/8 bg-slate-950/80 p-0.5">
      <button
        type="button"
        onClick={() => onFeedback(1)}
        className={cn(
          'flex h-6 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:text-emerald-200',
          feedback?.rating === 1 && 'bg-emerald-500/15 text-emerald-200',
        )}
        aria-label="点赞"
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onFeedback(-1)}
        className={cn(
          'flex h-6 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:text-rose-200',
          feedback?.rating === -1 && 'bg-rose-500/15 text-rose-200',
        )}
        aria-label="点踩"
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function TokenUsagePill({ usage }: { usage: TokenUsage }) {
  if (usage.totalTokens <= 0) {
    return null
  }

  return (
    <span className="inline-flex h-7 items-center rounded-lg border border-white/8 bg-slate-950/80 px-2 text-[11px] text-slate-500">
      token {usage.totalTokens} · in {usage.inputTokens} / out {usage.outputTokens}
    </span>
  )
}

function MessageToolbar({
  children,
  align = 'left',
}: {
  children: ReactNode
  align?: 'left' | 'right'
}) {
  return (
    <div
      className={cn(
        'mt-2 flex gap-1.5 opacity-0 transition-opacity delay-150 duration-200 group-hover/message:opacity-100',
        align === 'right' ? 'justify-end' : 'justify-start',
      )}
    >
      {children}
    </div>
  )
}

function renderReasoningSections({
  item,
  titlePrefix,
  statusLabel,
}: {
  item: AssistantTimelineItem
  titlePrefix: string
  statusLabel: string
}) {
  return item.reasoningContents.map((reasoning, index) => (
    <ExpandableSection
      key={`${item.id}-reasoning-${index}`}
      icon={<Lightbulb className="h-4 w-4" />}
      title={`${titlePrefix} ${index + 1}`}
      status={<StatusPill tone="info" label={statusLabel} />}
      defaultOpen={index === item.reasoningContents.length - 1}
    >
      <TextContent content={reasoning} muted={true} />
    </ExpandableSection>
  ))
}

function HumanMessageItem({ item }: { item: AssistantTimelineItem }) {
  const clipboardText = getItemClipboardText(item)

  return (
    <div className="group/message flex justify-end">
      <div className="max-w-[88%]">
        <div className="rounded-[22px] border border-blue-400/30 bg-blue-500/15 px-4 py-3 shadow-[0_8px_24px_rgba(59,130,246,0.12)]">
          {item.textContents.map((content, index) => (
            <TextContent key={`${item.id}-content-${index}`} content={content} />
          ))}
        </div>
        <MessageToolbar align="right">
          <CopyButton content={clipboardText} />
        </MessageToolbar>
      </div>
    </div>
  )
}

function AssistantMessageItem({
  item,
  currentRunId,
  feedbackByRunId,
  onFeedback,
  threadId,
}: {
  item: AssistantTimelineItem
  currentRunId?: string
  feedbackByRunId: Record<string, { rating: 1 | -1 }>
  onFeedback: (runId: string, rating: 1 | -1) => void
  threadId?: string
}) {
  const clipboardText = getItemClipboardText(item)
  const tokenUsage = getItemTokenUsage(item)
  const runId = getItemRunId(item, currentRunId)

  return (
    <div className="group/message flex items-start gap-3">
      <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-blue-500/25 bg-blue-500/10 text-blue-200">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="rounded-[22px] border border-white/8 bg-white/4 p-4">
          {item.textContents.map((content, index) => (
            <TextContent key={`${item.id}-content-${index}`} content={content || '正在组织最终回复...'} />
          ))}
        </div>
        <MessageToolbar>
          <CopyButton content={clipboardText} />
          {threadId && runId && <FeedbackButtons feedback={feedbackByRunId[runId]} onFeedback={(rating) => onFeedback(runId, rating)} />}
          <TokenUsagePill usage={tokenUsage} />
        </MessageToolbar>
      </div>
    </div>
  )
}

function ClarificationItem({ item }: { item: AssistantTimelineItem }) {
  return (
    <div className="rounded-[22px] border border-amber-400/20 bg-amber-500/10 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-amber-100">
          <MessageCircleQuestionMark className="h-4 w-4" />
          需要你补充澄清信息
        </div>
        <StatusPill tone="warning" label="待回复" />
      </div>
      <TextContent content={item.clarificationText ?? '请补充更多信息。'} muted={true} />
    </div>
  )
}

function SubagentItem({ item, isStreaming }: { item: AssistantTimelineItem; isStreaming: boolean }) {
  return (
    <div className="space-y-3 rounded-[22px] border border-white/8 bg-white/4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-white">
          <GitBranch className="h-4 w-4 text-violet-300" />
          子任务 / 子代理执行
        </div>
        <StatusPill tone={isStreaming ? 'info' : 'neutral'} label={`${item.subagentTasks.length} 个任务`} />
      </div>

      {renderReasoningSections({ item, titlePrefix: '任务规划', statusLabel: '思考中' })}

      {item.subagentTasks.map((task) => (
        <SubagentTaskCard key={task.id} task={task} />
      ))}
    </div>
  )
}

function ProcessingItem({ item, isStreaming }: { item: AssistantTimelineItem; isStreaming: boolean }) {
  return (
    <div className="space-y-3 rounded-[22px] border border-white/8 bg-white/4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-white">
          <Loader2 className={cn('h-4 w-4 text-blue-300', isStreaming && 'animate-spin')} />
          处理中
        </div>
        <StatusPill tone={isStreaming ? 'info' : 'neutral'} label={isStreaming ? '流式更新中' : '已收口'} />
      </div>

      {renderReasoningSections({ item, titlePrefix: '思考过程', statusLabel: '推理中' })}

      {item.toolCalls.map((toolCall) => (
        <ToolCallCard key={toolCall.id} toolCall={toolCall} />
      ))}

      {item.reasoningContents.length === 0 && item.toolCalls.length === 0 && (
        <div className="rounded-xl border border-dashed border-white/8 px-4 py-3 text-xs text-slate-400">
          已收到处理中消息，正在等待思考或工具执行细节返回...
        </div>
      )}
    </div>
  )
}

function TimelineItem({
  item,
  isStreaming,
  threadId,
  currentRunId,
  feedbackByRunId,
  onFeedback,
}: {
  item: AssistantTimelineItem
  isStreaming: boolean
  threadId?: string
  currentRunId?: string
  feedbackByRunId: Record<string, { rating: 1 | -1 }>
  onFeedback: (runId: string, rating: 1 | -1) => void
}) {
  if (item.type === 'human') {
    return <HumanMessageItem item={item} />
  }

  if (item.type === 'assistant') {
    return (
      <AssistantMessageItem
        item={item}
        threadId={threadId}
        currentRunId={currentRunId}
        feedbackByRunId={feedbackByRunId}
        onFeedback={onFeedback}
      />
    )
  }

  if (item.type === 'assistant:clarification') {
    return <ClarificationItem item={item} />
  }

  if (item.type === 'assistant:subagent') {
    return <SubagentItem item={item} isStreaming={isStreaming} />
  }

  return <ProcessingItem item={item} isStreaming={isStreaming} />
}

function NoticeItem({ notice }: { notice: NoticeMessage }) {
  const isError = notice.tone === 'error'

  return (
    <div
      className={cn(
        'rounded-2xl px-4 py-3 text-xs leading-5',
        isError ? 'border border-rose-400/20 bg-rose-500/10 text-rose-100' : 'border border-white/8 bg-white/4 text-slate-300',
      )}
    >
      <div className="flex items-start gap-2">
        {isError ? (
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <span>{notice.content}</span>
      </div>
    </div>
  )
}

export function TimelineMessageList({
  items,
  notices,
  isStreaming,
  threadId,
  currentRunId,
  feedbackByRunId,
  onFeedback,
}: TimelineMessageListProps) {
  return (
    <>
      {items.map((item) => (
        <TimelineItem
          key={item.id}
          item={item}
          isStreaming={isStreaming}
          threadId={threadId}
          currentRunId={currentRunId}
          feedbackByRunId={feedbackByRunId}
          onFeedback={onFeedback}
        />
      ))}

      {notices.map((notice) => (
        <NoticeItem key={notice.id} notice={notice} />
      ))}
    </>
  )
}
