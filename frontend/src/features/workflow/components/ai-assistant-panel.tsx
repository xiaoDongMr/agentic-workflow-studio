import { useEffect, useRef, type HTMLAttributes, type KeyboardEvent } from 'react'
import {
  AlertTriangle,
  Bot,
  Check,
  Circle,
  GitBranch,
  History,
  Layers3,
  LoaderCircle,
  PanelLeftClose,
  RefreshCw,
  SendHorizontal,
  Server,
  ShieldCheck,
  Sparkles,
  Square,
  UserRound,
  WandSparkles,
  X,
  type LucideIcon,
} from 'lucide-react'

import type { WorkflowAssistantMessage } from '@/features/workflow/assistant/types'
import { useWorkflowAssistantStream } from '@/features/workflow/hooks/use-workflow-assistant-stream'
import { cn } from '@/lib/utils'
import type { WorkflowDocument } from '@/types/workflow'

import {
  formatRelativeTimestamp,
  getThreadSummaryTitle,
  getThreadUpdatedAt,
  ThreadSidebar,
} from './assistant'
import { WorkflowClarificationCard } from './assistant/workflow-clarification-card'

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
    closeHistoryDrawer,
    completedStages,
    confirmPlan,
    continueAfterSandboxBinding,
    currentStage,
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
    previewWorkflow,
    renameThread,
    resetConversation,
    sandboxRequirement,
    sendMessage,
    selectThread,
    setInputValue,
    stopStreaming,
    submitClarification,
    threadId,
    threads,
    threadsLoading,
    warnings,
  } = useWorkflowAssistantStream({
    workflow,
    selectedNodeId,
    sandboxId,
    sandboxBindingStatus,
    onPreviewWorkflow,
  })
  const viewportRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const viewport = viewportRef.current
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight
    }
  }, [clarification, completedStages, currentStage, isStreaming, messages, plan, sandboxRequirement])

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

  return (
    <section
      className={cn(
        'relative flex h-full flex-col overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/94 shadow-[0_28px_90px_rgba(2,6,23,0.58),0_0_0_1px_rgba(59,130,246,0.04)] backdrop-blur-2xl',
        className,
      )}
      {...props}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-52 bg-[radial-gradient(circle_at_12%_0%,rgba(56,189,248,0.17),transparent_38%),radial-gradient(circle_at_88%_4%,rgba(139,92,246,0.14),transparent_34%)]" />

      <header className="relative flex items-center justify-between border-b border-white/8 bg-white/[0.018] px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-sky-300/20 bg-[linear-gradient(145deg,rgba(56,189,248,0.18),rgba(99,102,241,0.12))] text-sky-100 shadow-[0_10px_30px_rgba(14,165,233,0.12)]">
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-semibold tracking-tight text-white">工作流 AI 助手</h2>
              <span className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                isStreaming
                  ? 'border-blue-300/25 bg-blue-500/12 text-blue-100'
                  : 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100',
              )}>
                <span className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  isStreaming ? 'animate-pulse bg-blue-300' : 'bg-emerald-300',
                )} />
                {isStreaming ? '生成中' : '就绪'}
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-slate-400">
              规划、生成并校验你的工作流
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
          {messages.length === 0 && !plan && !clarification && !sandboxRequirement && (
            <div className="overflow-hidden rounded-[24px] border border-sky-300/14 bg-[linear-gradient(145deg,rgba(14,165,233,0.11),rgba(15,23,42,0.66)_48%,rgba(99,102,241,0.08))] shadow-[0_20px_60px_rgba(2,6,23,0.2)]">
              <div className="flex items-start gap-3.5 px-4 pb-4 pt-[18px]">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-sky-300/18 bg-sky-400/10 text-sky-100">
                  <Sparkles className="h-[18px] w-[18px]" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">从业务目标开始</p>
                  <p className="mt-1.5 text-xs leading-5 text-slate-400">
                    描述你想实现的流程。我会先确认关键需求，再生成流程草图并逐步构建画布。
                  </p>
                </div>
              </div>
              {selectedNodeId && (
                <div className="mx-4 mb-3 flex items-center gap-2 rounded-xl border border-blue-300/12 bg-blue-400/[0.06] px-3 py-2 text-[11px] text-blue-100">
                  <Circle className="h-3 w-3 fill-blue-300 text-blue-300" />
                  <span className="truncate">当前聚焦节点：{selectedNodeId}</span>
                </div>
              )}
              <div className="grid grid-cols-3 border-t border-white/8 bg-slate-950/22">
                <CapabilityItem icon={GitBranch} label="规划流程" />
                <CapabilityItem icon={Layers3} label="逐步生成" />
                <CapabilityItem icon={ShieldCheck} label="校验修复" />
              </div>
            </div>
          )}

          {messages.map((message) => (
            <AssistantMessageBubble key={message.id} message={message} />
          ))}

          {clarification && (
            <WorkflowClarificationCard
              clarification={clarification}
              isStreaming={isStreaming}
              onSubmit={(answers) => void submitClarification(answers)}
            />
          )}

          {sandboxRequirement && (
            <WorkflowSandboxRequirementCard
              bound={sandboxBindingStatus === 'bound' && Boolean(sandboxId)}
              isStreaming={isStreaming}
              reason={sandboxRequirement.reason}
              requestedCapabilities={sandboxRequirement.requestedCapabilities}
              sandboxId={sandboxId}
              onContinue={() => void continueAfterSandboxBinding()}
              onOpenSandbox={onOpenSandbox}
            />
          )}

          {plan && (
            <div className="overflow-hidden rounded-[22px] border border-violet-300/16 bg-violet-500/[0.055] shadow-[0_16px_44px_rgba(15,23,42,0.18)]">
              <div className="flex items-start justify-between gap-3 border-b border-white/8 bg-[linear-gradient(135deg,rgba(139,92,246,0.12),rgba(15,23,42,0.38))] px-4 py-3.5">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-violet-300/18 bg-violet-400/10 text-violet-100">
                    <WandSparkles className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-violet-50">流程草图</p>
                    <p className="mt-1 text-[11px] leading-4 text-slate-400">{plan.summary}</p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-violet-300/16 bg-violet-400/10 px-2 py-1 text-[10px] text-violet-100">
                  {plan.stages.length} 个阶段
                </span>
              </div>
              <div className="p-4">
                <div className="overflow-hidden rounded-2xl border border-white/8 bg-slate-950/64">
                  <div className="flex items-center justify-between border-b border-white/8 px-3 py-2">
                    <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">Mermaid</span>
                    <span className="text-[10px] text-slate-600">流程预览</span>
                  </div>
                  <pre className="max-h-56 overflow-auto p-3.5 text-[11px] leading-5 text-sky-100/90">
                    {plan.mermaid}
                  </pre>
                </div>
                {plan.assumptions.length > 0 && (
                  <div className="mt-3 rounded-xl border border-white/6 bg-white/[0.025] px-3 py-2.5 text-[11px] leading-5 text-slate-400">
                    <span className="font-medium text-slate-300">默认假设：</span>
                    {plan.assumptions.join('；')}
                  </div>
                )}
                {completedStages.length === 0 && (
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      disabled={isStreaming}
                      onClick={() => void confirmPlan()}
                      className="flex h-9 flex-1 items-center justify-center gap-2 rounded-xl border border-violet-300/18 bg-violet-500 text-xs font-semibold text-white shadow-[0_10px_24px_rgba(124,58,237,0.2)] transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" />
                      确认并生成
                    </button>
                    <button
                      type="button"
                      disabled={isStreaming}
                      onClick={() => void cancelPlan()}
                      className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.025] px-3 text-xs text-slate-300 transition hover:bg-white/[0.06] disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                      取消
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {(completedStages.length > 0 || currentStage) && (
            <div className="rounded-[22px] border border-sky-300/14 bg-sky-400/[0.045] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-sky-300/16 bg-sky-400/10 text-sky-100">
                    <Layers3 className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-sky-50">画布生成进度</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">节点与连线按阶段写入预览画布</p>
                  </div>
                </div>
                <span className="rounded-full border border-sky-300/14 bg-sky-400/[0.07] px-2 py-1 text-[10px] text-sky-100">
                  已完成 {completedStages.length}
                </span>
              </div>
              <div className="mt-4 space-y-1">
                {completedStages.map((stage) => (
                  <div key={stage.stageId} className="flex items-center gap-3 rounded-xl px-2 py-2 text-[11px] text-slate-300">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-400/10">
                      <Check className="h-3 w-3 text-emerald-300" />
                    </span>
                    <span className="truncate">阶段 {stage.sequence} · {stage.title}</span>
                  </div>
                ))}
                {currentStage && !completedStages.some((stage) => stage.stageId === currentStage.stageId) && (
                  <div className="flex items-center gap-3 rounded-xl border border-blue-300/10 bg-blue-400/[0.055] px-2 py-2 text-[11px] text-blue-100">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-blue-300/20 bg-blue-400/10">
                      {isStreaming
                        ? <LoaderCircle className="h-3 w-3 animate-spin" />
                        : <Circle className="h-3 w-3" />}
                    </span>
                    <span className="truncate">阶段 {currentStage.sequence} · {currentStage.title}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {warnings.length > 0 && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-300/16 bg-amber-400/[0.055] px-3.5 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-amber-100">{warnings.length} 条风险提示</p>
                <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-amber-100/60">{warnings[0]?.message}</p>
              </div>
            </div>
          )}

          {isComplete && (
            <button
              type="button"
              onClick={handleApply}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-emerald-300/20 bg-emerald-500 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(16,185,129,0.2)] transition hover:bg-emerald-400"
            >
              <Check className="h-4 w-4" />
              应用到正式画布
            </button>
          )}

          {isStreaming && (
            <div className="flex items-center gap-3 rounded-2xl border border-blue-300/14 bg-blue-400/[0.055] px-3.5 py-3 text-xs text-blue-100">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-400/10">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              </span>
              <div>
                <p className="font-medium">正在处理当前阶段</p>
                <p className="mt-0.5 text-[10px] text-blue-100/50">生成后将自动校验并修复</p>
              </div>
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
            {errorText || (isStreaming ? '节点生成后会自动校验并修复' : '变更先进入预览，确认后应用')}
          </p>
          <span className="shrink-0 text-slate-600">Enter 发送 · Shift + Enter 换行</span>
        </div>
      </footer>
    </section>
  )
}

function AssistantMessageBubble({ message }: { message: WorkflowAssistantMessage }) {
  if (message.role === 'system') {
    const Icon = message.tone === 'error'
      ? AlertTriangle
      : message.tone === 'success'
        ? ShieldCheck
        : Sparkles
    return (
      <div className={cn(
        'mx-auto flex max-w-[92%] items-start gap-2 rounded-xl border px-3 py-2 text-[11px] leading-4',
        message.tone === 'error'
          ? 'border-rose-300/14 bg-rose-400/[0.055] text-rose-100/80'
          : message.tone === 'success'
            ? 'border-emerald-300/14 bg-emerald-400/[0.055] text-emerald-100/80'
            : 'border-white/8 bg-white/[0.025] text-slate-400',
      )}>
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{message.content}</span>
      </div>
    )
  }

  const isUser = message.role === 'user'
  return (
    <div className={cn('flex items-end gap-2.5', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-sky-300/14 bg-sky-400/[0.07] text-sky-200">
          <Bot className="h-3.5 w-3.5" />
        </span>
      )}
      <div className={cn(
        'max-w-[82%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-xs leading-5 shadow-[0_8px_24px_rgba(2,6,23,0.14)]',
        isUser
          ? 'rounded-br-md border border-blue-300/16 bg-[linear-gradient(135deg,rgba(59,130,246,0.95),rgba(79,70,229,0.9))] text-white'
          : 'rounded-bl-md border border-white/8 bg-white/[0.045] text-slate-200',
      )}>
        {message.content}
      </div>
      {isUser && (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-blue-300/14 bg-blue-400/[0.08] text-blue-200">
          <UserRound className="h-3.5 w-3.5" />
        </span>
      )}
    </div>
  )
}

function WorkflowSandboxRequirementCard({
  bound,
  isStreaming,
  reason,
  requestedCapabilities,
  sandboxId,
  onContinue,
  onOpenSandbox,
}: {
  bound: boolean
  isStreaming: boolean
  reason: string
  requestedCapabilities: string[]
  sandboxId?: string
  onContinue: () => void
  onOpenSandbox: () => void
}) {
  return (
    <div className="overflow-hidden rounded-[22px] border border-emerald-300/16 bg-emerald-400/[0.055]">
      <div className="flex items-start gap-3 border-b border-white/8 bg-emerald-400/[0.05] px-4 py-3.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-emerald-300/18 bg-emerald-400/10 text-emerald-100">
          <Server className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-emerald-50">需要工作流沙箱</p>
          <p className="mt-1 text-[11px] leading-5 text-slate-400">{reason}</p>
        </div>
      </div>
      <div className="space-y-3 p-4">
        {requestedCapabilities.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {requestedCapabilities.map((capability) => (
              <span
                key={capability}
                className="rounded-lg border border-white/8 bg-slate-950/44 px-2 py-1 font-mono text-[10px] text-slate-300"
              >
                {capability}
              </span>
            ))}
          </div>
        )}
        {bound ? (
          <p className="truncate rounded-xl border border-emerald-300/14 bg-emerald-400/[0.07] px-3 py-2 font-mono text-[11px] text-emerald-100">
            已绑定：{sandboxId}
          </p>
        ) : (
          <p className="text-[11px] leading-5 text-amber-100/80">
            请先人工创建或关联沙箱，绑定完成后再继续当前任务。
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onOpenSandbox}
            className="flex h-9 flex-1 items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] px-3 text-xs font-medium text-slate-200 transition hover:bg-white/[0.07]"
          >
            {bound ? '查看沙箱' : '打开沙箱绑定'}
          </button>
          <button
            type="button"
            disabled={!bound || isStreaming}
            onClick={onContinue}
            className="flex h-9 flex-1 items-center justify-center rounded-xl border border-emerald-300/18 bg-emerald-500 px-3 text-xs font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-45"
          >
            已完成绑定，继续
          </button>
        </div>
      </div>
    </div>
  )
}

function CapabilityItem({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5 border-r border-white/8 px-2 py-2.5 text-[10px] text-slate-400 last:border-r-0">
      <Icon className="h-3.5 w-3.5 text-sky-300/80" />
      <span>{label}</span>
    </div>
  )
}
