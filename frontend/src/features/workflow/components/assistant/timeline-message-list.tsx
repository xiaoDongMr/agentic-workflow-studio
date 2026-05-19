import { CheckCircle2, CircleAlert, GitBranch, Lightbulb, Loader2, MessageCircleQuestionMark, Sparkles } from 'lucide-react'

import { cn } from '@/lib/utils'

import type { AssistantTimelineItem, NoticeMessage } from './types'
import { SubagentTaskCard, ToolCallCard } from './tool-cards'
import { ExpandableSection, StatusPill, TextContent } from './ui-primitives'

interface TimelineMessageListProps {
  items: AssistantTimelineItem[]
  notices: NoticeMessage[]
  isStreaming: boolean
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
  return (
    <div className="flex justify-end">
      <div className="max-w-[88%] rounded-[22px] border border-blue-400/30 bg-blue-500/15 px-4 py-3 shadow-[0_8px_24px_rgba(59,130,246,0.12)]">
        {item.textContents.map((content, index) => (
          <TextContent key={`${item.id}-content-${index}`} content={content} />
        ))}
      </div>
    </div>
  )
}

function AssistantMessageItem({ item }: { item: AssistantTimelineItem }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-blue-500/25 bg-blue-500/10 text-blue-200">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="flex-1 rounded-[22px] border border-white/8 bg-white/4 p-4">
        {item.textContents.map((content, index) => (
          <TextContent key={`${item.id}-content-${index}`} content={content || '正在组织最终回复...'} />
        ))}
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

function TimelineItem({ item, isStreaming }: { item: AssistantTimelineItem; isStreaming: boolean }) {
  if (item.type === 'human') {
    return <HumanMessageItem item={item} />
  }

  if (item.type === 'assistant') {
    return <AssistantMessageItem item={item} />
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

export function TimelineMessageList({ items, notices, isStreaming }: TimelineMessageListProps) {
  return (
    <>
      {items.map((item) => (
        <TimelineItem key={item.id} item={item} isStreaming={isStreaming} />
      ))}

      {notices.map((notice) => (
        <NoticeItem key={notice.id} notice={notice} />
      ))}
    </>
  )
}
