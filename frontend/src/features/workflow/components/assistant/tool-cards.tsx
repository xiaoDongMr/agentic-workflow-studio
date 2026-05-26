import { CheckCircle2, CircleAlert, Clock3, GitBranch, Layers3, Wrench } from 'lucide-react'

import { extractContentFromMessage, formatStructuredData } from './message-content'
import type { AssistantSubagentTask, AssistantToolCallWithResult } from './types'
import { CodeLikeBlock, ExpandableSection, StatusPill, type StatusTone } from './ui-primitives'

function summarizeToolCall(toolCall: AssistantToolCallWithResult['call']) {
  if (typeof toolCall.args.description === 'string' && toolCall.args.description.trim()) {
    return toolCall.args.description
  }

  if (typeof toolCall.args.query === 'string' && toolCall.args.query.trim()) {
    return toolCall.args.query
  }

  if (typeof toolCall.args.path === 'string' && toolCall.args.path.trim()) {
    return toolCall.args.path
  }

  if (typeof toolCall.args.url === 'string' && toolCall.args.url.trim()) {
    return toolCall.args.url
  }

  return '查看本次工具调用参数'
}

function getToolCallStatus(toolCall: AssistantToolCallWithResult): { tone: StatusTone; label: string } {
  if (toolCall.state === 'completed') {
    return { tone: 'success', label: '已完成' }
  }

  if (toolCall.state === 'error') {
    return { tone: 'error', label: '失败' }
  }

  return { tone: 'info', label: '执行中' }
}

function getSubagentTaskStatus(task: AssistantSubagentTask): { tone: StatusTone; label: string } {
  if (task.status === 'completed') {
    return { tone: 'success', label: '已完成' }
  }

  if (task.status === 'failed') {
    return { tone: 'error', label: '失败' }
  }

  return { tone: 'info', label: '执行中' }
}

function getSubagentStatusIcon(task: AssistantSubagentTask) {
  if (task.status === 'completed') {
    return <CheckCircle2 className="h-4 w-4 text-emerald-300" />
  }

  if (task.status === 'failed') {
    return <CircleAlert className="h-4 w-4 text-rose-300" />
  }

  return <Clock3 className="h-4 w-4 animate-pulse text-blue-300" />
}

function summarizeSubagentResult(task: AssistantSubagentTask) {
  if (!task.result) {
    return '等待子代理返回结果'
  }

  return task.result.length > 96 ? `${task.result.slice(0, 96).trim()}...` : task.result
}

export function ToolCallCard({ toolCall }: { toolCall: AssistantToolCallWithResult }) {
  const resultText = toolCall.result ? extractContentFromMessage(toolCall.result) : ''
  const status = getToolCallStatus(toolCall)

  return (
    <ExpandableSection
      icon={<Wrench className="h-4 w-4" />}
      title={`${toolCall.call.name} · ${summarizeToolCall(toolCall.call)}`}
      status={<StatusPill tone={status.tone} label={status.label} />}
      defaultOpen={toolCall.state !== 'completed'}
    >
      <div className="space-y-3">
        <div className="space-y-2">
          <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">调用参数</div>
          <CodeLikeBlock content={formatStructuredData(toolCall.call.args)} />
        </div>
        <div className="space-y-2">
          <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">工具结果</div>
          {resultText ? (
            <CodeLikeBlock content={resultText} />
          ) : (
            <div className="rounded-xl border border-dashed border-white/8 px-3 py-2 text-xs text-slate-400">
              工具还在执行，等待结果返回...
            </div>
          )}
        </div>
      </div>
    </ExpandableSection>
  )
}

export function SubagentTaskCard({ task }: { task: AssistantSubagentTask }) {
  const status = getSubagentTaskStatus(task)
  const promptLength = task.prompt.trim().length

  return (
    <ExpandableSection
      icon={getSubagentStatusIcon(task)}
      title={task.description || '子任务'}
      status={<StatusPill tone={status.tone} label={status.label} />}
      defaultOpen={task.status !== 'completed'}
    >
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/8 bg-slate-950/55 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-slate-500 uppercase">
              <GitBranch className="h-3.5 w-3.5" />
              子代理
            </div>
            <div className="mt-1 truncate text-xs text-slate-200">{task.subagentType || 'general'}</div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-slate-950/55 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-slate-500 uppercase">
              <Layers3 className="h-3.5 w-3.5" />
              提示词
            </div>
            <div className="mt-1 text-xs text-slate-200">{promptLength > 0 ? `${promptLength} 字符` : '未提供'}</div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-slate-950/55 px-3 py-2">
            <div className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">结果摘要</div>
            <div className="mt-1 line-clamp-1 text-xs text-slate-200">{summarizeSubagentResult(task)}</div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">任务提示词</div>
          <CodeLikeBlock content={task.prompt || '未提供任务提示词'} />
        </div>
        <div className="space-y-2">
          <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">子任务结果</div>
          {task.result ? (
            <CodeLikeBlock content={task.result} />
          ) : (
            <div className="rounded-xl border border-dashed border-white/8 px-3 py-2 text-xs text-slate-400">
              子任务仍在执行中，结果返回后会显示在这里。
            </div>
          )}
        </div>
      </div>
    </ExpandableSection>
  )
}
