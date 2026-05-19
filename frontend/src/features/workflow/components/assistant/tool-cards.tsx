import { GitBranch, Wrench } from 'lucide-react'

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

  return (
    <ExpandableSection
      icon={<GitBranch className="h-4 w-4" />}
      title={`${task.description} · ${task.subagentType}`}
      status={<StatusPill tone={status.tone} label={status.label} />}
      defaultOpen={task.status !== 'completed'}
    >
      <div className="space-y-3">
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
