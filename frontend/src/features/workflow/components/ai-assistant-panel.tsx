import { useEffect, useRef, type HTMLAttributes, type KeyboardEvent } from 'react'
import {
  Bot,
  Check,
  History,
  PanelLeftClose,
  RefreshCw,
  SendHorizontal,
  Square,
} from 'lucide-react'

import type {
  WorkflowAssistantMessage,
  WorkflowConfirmedClarification,
  WorkflowToolActivity,
} from '@/features/workflow/assistant/types'
import { useWorkflowAssistantStream } from '@/features/workflow/hooks/use-workflow-assistant-stream'
import { cn } from '@/lib/utils'
import type { WorkflowDocument } from '@/types/workflow'

import {
  formatRelativeTimestamp,
  getThreadSummaryTitle,
  getThreadUpdatedAt,
  ThreadSidebar,
} from './assistant'
import { AssistantEmptyState } from './assistant/assistant-empty-state'
import { AssistantMessageBubble } from './assistant/assistant-message-bubble'
import {
  ExecutionStatusItem,
  ExecutionTraceItem,
  type ExecutionState,
} from './assistant/execution-trace'
import {
  countPlannedNodes,
  isActivityRepresentedByResult,
} from './assistant/execution-trace-utils'
import { WorkflowCompleteSummary } from './assistant/preview-graph-summary'
import { WorkflowClarificationCard } from './assistant/workflow-clarification-card'
import { WorkflowPlanCard } from './assistant/workflow-plan-card'
import { WorkflowSandboxRequirementCard } from './assistant/workflow-sandbox-requirement-card'

interface AiAssistantPanelProps extends HTMLAttributes<HTMLDivElement> {
  workflow: WorkflowDocument
  selectedNodeId?: string
  sandboxId?: string
  sandboxBindingStatus: 'unbound' | 'bound' | 'unavailable'
  onPreviewWorkflow: (workflow: WorkflowDocument | null) => void
  onApplyWorkflow: (workflow: WorkflowDocument) => void
  onOpenSandbox: () => void
  onCollapse?: () => void
}

type ConversationTimelineItem =
  | { type: 'message'; sortIndex: number; message: WorkflowAssistantMessage }
  | { type: 'confirmedClarification'; sortIndex: number; confirmed: WorkflowConfirmedClarification }
  | { type: 'clarification'; sortIndex: number }
  | { type: 'sandboxRequirement'; sortIndex: number }
  | { type: 'plan'; sortIndex: number }
  | { type: 'activity'; sortIndex: number; activity: WorkflowToolActivity }

export function AiAssistantPanel({
  className,
  workflow,
  selectedNodeId,
  sandboxId,
  sandboxBindingStatus,
  onPreviewWorkflow,
  onApplyWorkflow,
  onOpenSandbox,
  onCollapse,
  ...props
}: AiAssistantPanelProps) {
  const {
    activeThread,
    cancelPlan,
    clarification,
    confirmedClarifications,
    closeHistoryDrawer,
    confirmPlan,
    continueAfterSandboxBinding,
    currentThreadTitle,
    deleteThread,
    errorText,
    exportThread,
    historyDrawerOpen,
    historyLoading,
    inputValue,
    isComplete,
    isStreaming,
    messages,
    openHistoryDrawer,
    plan,
    planConfirmed,
    planTimestamp,
    previewWorkflow,
    renameThread,
    resetConversation,
    sandboxRequirement,
    sendMessage,
    selectThread,
    setInputValue,
    stopStreaming,
    submitClarification,
    runStatusText,
    threadId,
    toolActivities,
    threads,
    threadsLoading,
  } = useWorkflowAssistantStream({
    workflow,
    selectedNodeId,
    sandboxId,
    sandboxBindingStatus,
    onPreviewWorkflow,
    onOpenSandbox,
  })
  const viewportRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const viewport = viewportRef.current
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight
    }
  }, [
    clarification,
    confirmedClarifications,
    isStreaming,
    messages,
    plan,
    runStatusText,
    sandboxRequirement,
    toolActivities,
  ])

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendMessage()
    }
  }

  const handleApply = () => {
    onApplyWorkflow(previewWorkflow)
    resetConversation()
  }
  const waitingForClarification = Boolean(clarification)
  const waitingForPlanConfirmation = Boolean(plan && !planConfirmed && !isStreaming)
  const executionState: ExecutionState = waitingForClarification
    ? 'clarification'
    : isStreaming
      ? 'running'
      : waitingForPlanConfirmation
        ? 'plan'
        : 'idle'
  const assistantStatusText = executionState === 'clarification'
    ? '等待用户补充'
    : executionState === 'plan'
      ? '等待确认流程草图'
      : runStatusText || '规划、生成并校验你的工作流'
  const visibleToolActivities = toolActivities
    .filter((activity) => !isActivityRepresentedByResult(activity, {
      hasClarification: Boolean(clarification || confirmedClarifications.length),
      hasPlan: Boolean(plan),
      hasSandboxRequirement: Boolean(sandboxRequirement),
    }))
    .slice(-24)
  const latestPreviewGraphSummary = [...visibleToolActivities]
    .reverse()
    .find((activity) => activity.previewGraphSummary)
    ?.previewGraphSummary
  const plannedNodeCount = plan ? countPlannedNodes(plan) : undefined
  const latestToolActivityId = visibleToolActivities[visibleToolActivities.length - 1]?.id
  const latestTimelineTimestamp = Math.max(
    0,
    ...messages.map((message, index) => message.timestamp ?? index),
    ...confirmedClarifications.map((confirmed) => confirmed.timestamp),
    ...(planTimestamp ? [planTimestamp] : []),
    ...visibleToolActivities.map((activity) => activity.timestamp),
  )
  const conversationTimeline: ConversationTimelineItem[] = [
    ...messages.map((message, index) => ({
      type: 'message' as const,
      sortIndex: message.timestamp ?? index,
      message,
    })),
    ...confirmedClarifications.map((confirmed) => ({
      type: 'confirmedClarification' as const,
      sortIndex: confirmed.timestamp,
      confirmed,
    })),
    ...(clarification
      ? [{
          type: 'clarification' as const,
          sortIndex: latestTimelineTimestamp + 1,
        }]
      : []),
    ...(sandboxRequirement
      ? [{
          type: 'sandboxRequirement' as const,
          sortIndex: latestTimelineTimestamp + 1,
        }]
      : []),
    ...(plan ? [{ type: 'plan' as const, sortIndex: planTimestamp ?? latestTimelineTimestamp + 1 }] : []),
    ...visibleToolActivities.map((activity) => ({
      type: 'activity' as const,
      sortIndex: activity.timestamp,
      activity,
    })),
  ].sort((left, right) => left.sortIndex - right.sortIndex)

  return (
    <section
      className={cn(
        'relative flex h-full flex-col overflow-hidden rounded-[30px] border border-white/10 bg-slate-950/95 shadow-[0_30px_110px_rgba(2,6,23,0.62),0_0_0_1px_rgba(59,130,246,0.045)] backdrop-blur-2xl',
        className,
      )}
      {...props}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_10%_0%,rgba(56,189,248,0.20),transparent_36%),radial-gradient(circle_at_88%_2%,rgba(139,92,246,0.18),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.035),transparent_48%)]" />

      <header className="relative flex items-center justify-between border-b border-white/8 bg-white/[0.02] px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-sky-300/22 bg-[linear-gradient(145deg,rgba(56,189,248,0.22),rgba(99,102,241,0.14))] text-sky-100 shadow-[0_12px_32px_rgba(14,165,233,0.16)]">
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-semibold tracking-tight text-white">工作流 AI 助手</h2>
              <span className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                executionState === 'clarification' || executionState === 'plan'
                  ? 'border-amber-300/25 bg-amber-500/12 text-amber-100'
                  : executionState === 'running'
                    ? 'border-blue-300/25 bg-blue-500/12 text-blue-100'
                    : 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100',
              )}>
                <span className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  executionState === 'clarification' || executionState === 'plan'
                    ? 'bg-amber-300'
                    : executionState === 'running'
                      ? 'animate-pulse bg-blue-300'
                      : 'bg-emerald-300',
                )} />
                {executionState === 'clarification'
                  ? '待补充'
                  : executionState === 'plan'
                    ? '待确认'
                    : executionState === 'running'
                      ? '生成中'
                      : '就绪'}
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-slate-400">
              {assistantStatusText}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={openHistoryDrawer}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-xl border border-transparent px-2.5 text-xs text-slate-400 transition hover:border-white/8 hover:bg-white/[0.055] hover:text-white',
              historyDrawerOpen && 'border-white/8 bg-white/[0.06] text-white',
            )}
            aria-label="打开历史会话"
          >
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">历史</span>
          </button>
          <button
            type="button"
            onClick={resetConversation}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-transparent text-slate-400 transition hover:border-white/8 hover:bg-white/[0.055] hover:text-white"
            aria-label="新建会话"
            title="新建会话"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onCollapse}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-transparent text-slate-400 transition hover:border-white/8 hover:bg-white/[0.055] hover:text-white"
            aria-label="收起 AI 助手"
            title="收起"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
      </header>

      <ThreadSidebar
        activeThreadId={threadId}
        threads={threads}
        threadsLoading={threadsLoading}
        historyLoading={historyLoading}
        isStreaming={isStreaming}
        open={historyDrawerOpen}
        onClose={closeHistoryDrawer}
        onNewThread={resetConversation}
        onDeleteThread={deleteThread}
        onExportThread={exportThread}
        onRenameThread={renameThread}
        onSelectThread={selectThread}
      />

      <div className="relative flex items-center justify-between gap-3 border-b border-white/8 bg-slate-950/30 px-5 py-2.5">
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-slate-200">
            {activeThread ? getThreadSummaryTitle(activeThread) : currentThreadTitle || '新会话'}
          </div>
          <div className="mt-0.5 truncate text-[10px] text-slate-600">
            {threadId ? threadId : '发送消息后自动创建会话'}
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-white/8 bg-white/[0.035] px-2 py-1 text-[10px] text-slate-500">
          {activeThread ? formatRelativeTimestamp(getThreadUpdatedAt(activeThread)) : '未开始'}
        </span>
      </div>

      <div ref={viewportRef} className="relative min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,rgba(15,23,42,0.18),transparent_22%)] px-5 py-5">
        <div className="space-y-4">
          {messages.length === 0
            && confirmedClarifications.length === 0
            && !plan
            && !clarification
            && !sandboxRequirement && (
            <AssistantEmptyState selectedNodeId={selectedNodeId} />
          )}

          {conversationTimeline.map((item) => {
            if (item.type === 'message') {
              return <AssistantMessageBubble key={item.message.id} message={item.message} />
            }
            if (item.type === 'confirmedClarification') {
              return (
                <WorkflowClarificationCard
                  key={item.confirmed.timestamp}
                  clarification={item.confirmed.clarification}
                  confirmed
                  submittedAnswers={item.confirmed.answers}
                  isStreaming={false}
                  onSubmit={() => undefined}
                />
              )
            }
            if (item.type === 'clarification' && clarification) {
              return (
                <WorkflowClarificationCard
                  key={clarification.questions.map((question) => question.id).join(':')}
                  clarification={clarification}
                  isStreaming={isStreaming}
                  onSubmit={(answers) => void submitClarification(answers)}
                />
              )
            }
            if (item.type === 'sandboxRequirement' && sandboxRequirement) {
              return (
                <WorkflowSandboxRequirementCard
                  key="workflow-sandbox-requirement"
                  bound={sandboxBindingStatus === 'bound' && Boolean(sandboxId)}
                  isStreaming={isStreaming}
                  reason={sandboxRequirement.reason}
                  requestedCapabilities={sandboxRequirement.requestedCapabilities}
                  sandboxId={sandboxId}
                  onContinue={() => void continueAfterSandboxBinding()}
                  onOpenSandbox={onOpenSandbox}
                />
              )
            }
            if (item.type === 'plan' && plan) {
              return (
                <WorkflowPlanCard
                  key="workflow-plan"
                  plan={plan}
                  confirmed={planConfirmed}
                  isStreaming={isStreaming}
                  onConfirm={() => void confirmPlan()}
                  onCancel={() => void cancelPlan()}
                />
              )
            }
            if (item.type === 'activity') {
              return (
                <ExecutionTraceItem
                  key={item.activity.id}
                  activity={item.activity}
                  isLatest={item.activity.id === latestToolActivityId}
                  latestPreviewGraphSummary={latestPreviewGraphSummary}
                  plannedNodeCount={plannedNodeCount}
                />
              )
            }
            return null
          })}

          {visibleToolActivities.length === 0 && !clarification && !plan && !sandboxRequirement && (runStatusText || isStreaming) && (
            <ExecutionStatusItem
              executionState={executionState}
              statusText={assistantStatusText}
            />
          )}

          {isComplete && (
            <div className="space-y-3">
              {latestPreviewGraphSummary ? (
                <WorkflowCompleteSummary summary={latestPreviewGraphSummary} />
              ) : null}
              <button
                type="button"
                onClick={handleApply}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-emerald-300/20 bg-emerald-500 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(16,185,129,0.2)] transition hover:bg-emerald-400"
              >
                <Check className="h-4 w-4" />
                应用到正式画布
              </button>
            </div>
          )}
        </div>
      </div>

      <footer className="relative border-t border-white/8 bg-[linear-gradient(180deg,rgba(15,23,42,0.72),rgba(2,6,23,0.92))] px-5 pb-4 pt-3.5">
        <div className="flex items-end gap-3 rounded-[20px] border border-white/10 bg-slate-950/76 p-2.5 pl-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.025),0_12px_36px_rgba(2,6,23,0.2)] transition focus-within:border-blue-300/32 focus-within:bg-slate-950/88">
          <textarea
            rows={1}
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={plan ? '输入新要求可重新规划...' : '描述要生成或调整的工作流...'}
            className="min-h-10 max-h-28 min-w-0 flex-1 resize-none bg-transparent py-2 text-sm leading-5 text-slate-200 outline-none placeholder:text-slate-600"
          />
          <button
            type="button"
            onClick={() => (isStreaming ? stopStreaming() : void sendMessage())}
            disabled={!isStreaming && !inputValue.trim()}
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border text-white shadow-[0_10px_24px_rgba(37,99,235,0.18)] transition disabled:cursor-not-allowed disabled:border-white/8 disabled:bg-white/[0.04] disabled:text-slate-600 disabled:shadow-none',
              isStreaming
                ? 'border-rose-300/20 bg-rose-500 hover:bg-rose-400'
                : 'border-blue-300/20 bg-blue-500 hover:bg-blue-400',
            )}
            aria-label={isStreaming ? '停止生成' : '发送'}
          >
            {isStreaming ? <Square className="h-4 w-4 fill-current" /> : <SendHorizontal className="h-4 w-4" />}
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 px-1 text-[10px]">
          <p className={cn('truncate', errorText ? 'text-rose-300' : 'text-slate-500')}>
            {errorText || (waitingForClarification
              ? '请补充关键信息后继续'
              : waitingForPlanConfirmation
                ? '请确认流程草图后开始生成'
              : isStreaming
                ? runStatusText || '正在处理请求'
                : '变更先进入预览，确认后应用')}
          </p>
          <span className="shrink-0 text-slate-600">Enter 发送 · Shift + Enter 换行</span>
        </div>
      </footer>
    </section>
  )
}
