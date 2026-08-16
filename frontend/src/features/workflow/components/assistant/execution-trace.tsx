import {
  AlertTriangle,
  Combine,
  FileText,
  GitBranch,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react'

import type {
  WorkflowPreviewGraphSummary,
  WorkflowToolActivity,
} from '@/features/workflow/assistant/types'
import { cn } from '@/lib/utils'

import {
  CanvasUpdateSummary,
  previewGraphDisplayTitle,
  RunningGraphGenerationSummary,
} from './preview-graph-summary'

export type ExecutionState = 'running' | 'clarification' | 'plan' | 'idle'

export function ExecutionStatusItem({
  executionState,
  statusText,
}: {
  executionState: ExecutionState
  statusText: string
}) {
  const isRunning = executionState === 'running'
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-blue-300/16 bg-blue-400/[0.07] text-blue-200">
        {isRunning
          ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          : <Sparkles className="h-3.5 w-3.5" />}
      </span>
      <div className="min-w-0 flex-1 rounded-xl border border-blue-300/14 bg-blue-400/[0.035] px-3.5 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-xs font-medium text-slate-100">{statusText || '正在处理请求'}</p>
          <span className="flex shrink-0 items-center gap-1.5 text-[9px] text-blue-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
            进行中
          </span>
        </div>
        <p className="mt-1 text-[10px] leading-4 text-slate-500">
          {isRunning ? '正在读取上下文并选择下一步动作' : '执行状态已更新'}
        </p>
      </div>
    </div>
  )
}

export function ExecutionTraceItem({
  activity,
  isLatest,
  latestPreviewGraphSummary,
  plannedNodeCount,
}: {
  activity: WorkflowToolActivity
  isLatest: boolean
  latestPreviewGraphSummary?: WorkflowPreviewGraphSummary
  plannedNodeCount?: number
}) {
  const statusStyle = toolActivityStatusStyle(activity.status)
  const displayLabel = toolActivityDisplayLabel(activity)
  const displayDetail = toolActivityDisplayDetail(activity, latestPreviewGraphSummary, plannedNodeCount)
  const kindStyle = activityKindStyle(activity.kind)
  const isPreviewSync = Boolean(activity.previewGraphSummary)
  const modelOutput = activity.modelOutput?.trim()
  const hasLongModelOutput = Boolean(
    modelOutput && (modelOutput.length > 180 || modelOutput.split('\n').length > 3),
  )
  return (
    <div className={cn(
      'group flex min-w-0 items-start gap-2.5',
      isPreviewSync && 'relative ml-9 before:absolute before:-left-6 before:top-0 before:h-6 before:w-6 before:rounded-bl-xl before:border-b before:border-l before:border-cyan-300/20',
    )}>
      <span className={cn(
        'mt-1 flex shrink-0 items-center justify-center rounded-lg border transition-colors',
        isPreviewSync ? 'h-6 w-6' : 'h-7 w-7',
        kindStyle.icon,
        activity.status === 'failed' && statusStyle.icon,
      )}>
        {activity.status === 'running'
          ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          : activity.status === 'failed'
            ? <AlertTriangle className="h-3.5 w-3.5" />
            : <ActivityKindIcon kind={activity.kind} />}
      </span>
      <div className={cn(
        'min-w-0 flex-1 rounded-xl border border-white/[0.07] bg-white/[0.025] transition-colors',
        isPreviewSync ? 'px-3 py-2.5' : 'px-3.5 py-3',
        'group-hover:border-white/[0.11] group-hover:bg-white/[0.035]',
        isPreviewSync && 'border-cyan-300/10 bg-cyan-400/[0.025]',
        statusStyle.container,
        isLatest && activity.status === 'running' && 'border-blue-300/16 bg-blue-400/[0.035]',
      )}>
        <div className="flex min-w-0 items-center justify-between gap-3">
          <p className="min-w-0 truncate text-xs font-medium text-slate-100">{displayLabel}</p>
          <span className={cn('flex shrink-0 items-center gap-1.5 text-[9px]', statusStyle.text)}>
            <span className={cn(
              'h-1.5 w-1.5 rounded-full',
              statusStyle.dot,
              activity.status === 'running' && 'animate-pulse',
            )} />
            {toolActivityStatusLabel(activity)}
          </span>
        </div>
        {displayDetail ? (
          <p className="mt-1.5 line-clamp-2 text-[10px] leading-4 text-slate-400/80">{displayDetail}</p>
        ) : null}
        {modelOutput ? (
          <div className="mt-2 rounded-lg border border-blue-300/10 bg-blue-400/[0.025] px-3 py-2.5">
            {hasLongModelOutput ? (
              <details className="group/output">
                <summary className="cursor-pointer list-none">
                  <p className="line-clamp-3 whitespace-pre-wrap text-[11px] leading-5 text-slate-300 group-open/output:hidden">
                    {modelOutput}
                  </p>
                  <span className="mt-1.5 block text-[10px] text-blue-300 transition hover:text-blue-200 group-open/output:hidden">
                    展开完整输出
                  </span>
                  <span className="hidden text-[10px] text-blue-300 transition hover:text-blue-200 group-open/output:block">
                    收起完整输出
                  </span>
                </summary>
                <p className="mt-2 whitespace-pre-wrap border-t border-white/[0.06] pt-2 text-[11px] leading-5 text-slate-300">
                  {modelOutput}
                </p>
              </details>
            ) : (
              <p className="whitespace-pre-wrap text-[11px] leading-5 text-slate-300">
                {modelOutput}
              </p>
            )}
          </div>
        ) : null}
        {isWorkflowGraphGenerationActivity(activity) && activity.status === 'running' && latestPreviewGraphSummary ? (
          <RunningGraphGenerationSummary
            plannedNodeCount={plannedNodeCount}
            summary={latestPreviewGraphSummary}
          />
        ) : null}
        {activity.previewGraphSummary ? (
          <CanvasUpdateSummary summary={activity.previewGraphSummary} />
        ) : null}
        <div className={cn(
          'flex items-center gap-1.5 text-[9px] text-slate-600',
          isPreviewSync ? 'mt-1.5' : 'mt-2',
        )}>
          <span>{activityActorLabel(activity.actor)}</span>
          <span aria-hidden="true">·</span>
          <span>{activityKindLabel(activity.kind)}</span>
        </div>
      </div>
    </div>
  )
}

function ActivityKindIcon({ kind }: { kind: WorkflowToolActivity['kind'] }) {
  if (kind === 'subagent') return <GitBranch className="h-3.5 w-3.5" />
  if (kind === 'skill') return <FileText className="h-3.5 w-3.5" />
  if (kind === 'model') return <Sparkles className="h-3.5 w-3.5" />
  if (kind === 'validation') return <ShieldCheck className="h-3.5 w-3.5" />
  if (kind === 'canvas') return <Combine className="h-3.5 w-3.5" />
  return <Wrench className="h-3.5 w-3.5" />
}

function activityKindLabel(kind: WorkflowToolActivity['kind']) {
  if (kind === 'subagent') return '阶段生成'
  if (kind === 'skill') return '节点配置'
  if (kind === 'model') return '智能规划'
  if (kind === 'validation') return '质量检查'
  if (kind === 'canvas') return '预览同步'
  return '处理中'
}

function activityKindStyle(kind: WorkflowToolActivity['kind']) {
  if (kind === 'subagent') {
    return { icon: 'border-violet-300/16 bg-violet-400/[0.07] text-violet-200' }
  }
  if (kind === 'skill') {
    return { icon: 'border-fuchsia-300/16 bg-fuchsia-400/[0.07] text-fuchsia-200' }
  }
  if (kind === 'model') {
    return { icon: 'border-blue-300/16 bg-blue-400/[0.07] text-blue-200' }
  }
  if (kind === 'validation') {
    return { icon: 'border-emerald-300/16 bg-emerald-400/[0.07] text-emerald-200' }
  }
  if (kind === 'canvas') {
    return { icon: 'border-cyan-300/16 bg-cyan-400/[0.07] text-cyan-200' }
  }
  return { icon: 'border-white/10 bg-white/[0.035] text-slate-400' }
}

function toolActivityDisplayLabel(activity: WorkflowToolActivity) {
  if (activity.status === 'failed' && activity.label === '执行工作流工具') {
    return '当前步骤执行失败'
  }
  if (activity.previewGraphSummary) {
    return previewGraphDisplayTitle(activity.previewGraphSummary)
  }
  return toolActivityPresentation(activity.toolName)?.title ?? activity.label
}

function toolActivityDisplayDetail(
  activity: WorkflowToolActivity,
  latestPreviewGraphSummary?: WorkflowPreviewGraphSummary,
  plannedNodeCount?: number,
) {
  if (activity.previewGraphSummary) {
    return undefined
  }
  if (isWorkflowGraphGenerationActivity(activity) && activity.status === 'running') {
    if (latestPreviewGraphSummary) {
      const nodeProgress = plannedNodeCount && plannedNodeCount > latestPreviewGraphSummary.nodeCount
        ? `${latestPreviewGraphSummary.nodeCount} / ${plannedNodeCount} 个规划节点`
        : `${latestPreviewGraphSummary.nodeCount} 个节点`
      return `正在继续生成完整结构；已同步 ${nodeProgress} 和 ${latestPreviewGraphSummary.edgeCount} 条连线到预览画布`
    }
    return '正在持续生成节点和连线；下方预览画布会同步当前已生成的快照'
  }
  return activity.detail || toolActivityPresentation(activity.toolName)?.description
}

function toolActivityPresentation(toolName: string) {
  const direct = TOOL_ACTIVITY_PRESENTATION[toolName]
  if (direct) {
    return direct
  }
  return undefined
}

function activityActorLabel(actor: WorkflowToolActivity['actor']) {
  if (actor === 'graph-builder') return '画布生成器'
  if (actor === 'frontend') return '预览画布'
  if (actor === 'system') return '系统'
  return '工作流助手'
}

const TOOL_ACTIVITY_PRESENTATION: Record<string, {
  title: string
  description: string
}> = {
  generate_workflow_metadata: {
    title: '完善工作流名称和描述',
    description: '根据已确认的业务需求补全工作流基本信息',
  },
  generate_workflow_patch: {
    title: '生成工作流结构',
    description: '持续生成节点、连线和配置，期间会分批同步到预览画布',
  },
  describe_workflow: {
    title: '读取当前工作流',
    description: '了解画布中的节点、连线和变量',
  },
  inspect_workflow_node: {
    title: '读取节点配置',
    description: '检查目标节点现有配置',
  },
  run_node_skill: {
    title: '配置工作流节点',
    description: '根据节点规则生成所需配置',
  },
  run_node_skill_script: {
    title: '获取节点配置数据',
    description: '读取生成节点所需的动态配置',
  },
  read_node_skill_file: {
    title: '读取节点配置规则',
    description: '了解当前节点的数据结构和配置要求',
  },
  read_file: {
    title: '读取节点配置规则',
    description: '了解当前节点的数据结构和配置要求',
  },
  execute_node_skill_script: {
    title: '计算节点配置',
    description: '根据节点规则生成或校验配置数据',
  },
  update_current_graph: {
    title: '更新工作流结构',
    description: '将当前节点和连线写入工作流快照',
  },
  workflow_ask_clarification: {
    title: '准备澄清问题',
    description: '整理继续规划所需的关键信息',
  },
  return_workflow_answer: {
    title: '提交工作流答复',
    description: '向用户说明当前工作流信息',
  },
  return_workflow_plan: {
    title: '提交流程草图',
    description: '提交待用户确认的流程结构',
  },
  return_workflow_error: {
    title: '提交执行错误',
    description: '说明当前无法继续执行的原因',
  },
  return_workflow_graph: {
    title: '提交结构快照',
    description: '将当前生成出的节点和连线交给预览画布同步',
  },
  'frontend.apply_preview_graph': {
    title: '同步预览快照',
    description: '展示当前已生成的节点和连线快照',
  },
}

function isWorkflowGraphGenerationActivity(activity: WorkflowToolActivity) {
  return activity.toolName === 'generate_workflow_patch'
    || activity.toolName === 'return_workflow_graph'
}

function toolActivityStatusStyle(status: WorkflowToolActivity['status']) {
  if (status === 'failed') {
    return {
      icon: 'border-rose-300/18 bg-rose-400/10 text-rose-200',
      container: 'border-rose-300/14 bg-rose-400/[0.025]',
      dot: 'bg-rose-400',
      text: 'text-rose-300',
    }
  }
  if (status === 'blocked') {
    return {
      icon: 'border-amber-300/18 bg-amber-400/10 text-amber-200',
      container: 'border-amber-300/12',
      dot: 'bg-amber-400',
      text: 'text-amber-300',
    }
  }
  if (status === 'cancelled') {
    return {
      icon: 'border-slate-300/16 bg-slate-400/8 text-slate-400',
      container: 'opacity-70',
      dot: 'bg-slate-500',
      text: 'text-slate-500',
    }
  }
  if (status === 'completed') {
    return {
      icon: '',
      container: '',
      dot: 'bg-emerald-400',
      text: 'text-emerald-300/80',
    }
  }
  return {
    icon: '',
    container: '',
    dot: 'bg-blue-400',
    text: 'text-blue-300',
  }
}

function toolActivityStatusLabel(activity: WorkflowToolActivity) {
  if (activity.status === 'completed' && activity.toolName === 'frontend.apply_preview_graph') {
    return '已同步'
  }
  if (activity.status === 'running' && isWorkflowGraphGenerationActivity(activity)) {
    return '生成中'
  }
  if (activity.status === 'completed') {
    return '完成'
  }
  if (activity.status === 'blocked') {
    return '等待'
  }
  if (activity.status === 'failed') {
    return '失败'
  }
  if (activity.status === 'cancelled') {
    return '已停止'
  }
  return '执行中'
}
