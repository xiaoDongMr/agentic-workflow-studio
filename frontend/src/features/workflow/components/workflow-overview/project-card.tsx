import { useState } from 'react'
import {
  ArrowUpRight,
  Clock3,
  Copy,
  ExternalLink,
  GitBranch,
  Layers3,
  LoaderCircle,
  MoreHorizontal,
  PencilLine,
  Trash2,
} from 'lucide-react'

import { cn } from '@/lib/utils'

import { MiniWorkflowPreview } from './mini-workflow-preview'
import type { LocalWorkflowProjectCardProps, SavedWorkflowProjectCardProps } from './types'

export function WorkflowProjectCard({
  workflow,
  badge = '点击编辑',
  statusText = '刚刚编辑',
  onOpen,
  onEdit,
  onDelete,
  onDuplicate,
}: LocalWorkflowProjectCardProps) {
  return (
    <article className="group overflow-hidden rounded-[24px] border border-white/8 bg-white/[0.055] text-left shadow-[0_18px_60px_rgba(2,6,23,0.18)] transition hover:-translate-y-0.5 hover:border-blue-300/26 hover:bg-white/[0.075] hover:shadow-[0_28px_80px_rgba(2,6,23,0.28)]">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <MiniWorkflowPreview workflow={workflow} />
        <ProjectCardBody
          description={workflow.description || '点击进入画布继续设计工作流。'}
          name={workflow.name || '未命名项目'}
          status={<ProjectStatusBadge label={badge} tone={badge.includes('未保存') ? 'amber' : 'blue'} />}
          tone="blue"
        />
      </button>
      <ProjectCardFooter
        edgeCount={workflow.edges.length}
        nodeCount={workflow.nodes.length}
        statusText={statusText}
        tone="blue"
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        onEdit={onEdit}
      />
    </article>
  )
}

export function WorkflowProjectSummaryCard({
  project,
  opening,
  onOpen,
  onEdit,
  onDelete,
  onDuplicate,
  busy = false,
}: SavedWorkflowProjectCardProps) {
  const updatedAt = new Date(project.updatedAt)
  const updatedText = Number.isNaN(updatedAt.getTime())
    ? '最近编辑'
    : updatedAt.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })

  return (
    <article
      className={cn(
        'group overflow-hidden rounded-[24px] border border-emerald-300/12 bg-emerald-400/[0.045] text-left shadow-[0_18px_60px_rgba(2,6,23,0.18)] transition hover:-translate-y-0.5 hover:border-emerald-300/26 hover:bg-emerald-400/[0.07] hover:shadow-[0_28px_80px_rgba(2,6,23,0.28)]',
        (opening || busy) && 'opacity-75',
      )}
    >
      <button type="button" onClick={onOpen} disabled={opening || busy} className="block w-full text-left disabled:cursor-wait">
        <div className="relative">
          <MiniWorkflowPreview
            workflow={{
              name: project.name,
              nodes: project.preview?.nodes ?? [],
              edges: project.preview?.edges ?? [],
                totalNodeCount: project.nodeCount,
                totalEdgeCount: project.edgeCount,
            }}
            tone="emerald"
          />
          {opening && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/46 backdrop-blur-sm">
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/78 px-4 py-2 text-sm text-slate-200">
                <LoaderCircle className="h-4 w-4 animate-spin text-emerald-300" />
                打开中
              </div>
            </div>
          )}
        </div>
        <ProjectCardBody
          description={project.description || '已保存的工作流草稿。'}
          name={project.name || '未命名项目'}
          status={<ProjectStatusBadge label="已保存草稿" tone="emerald" />}
          tone="emerald"
        />
      </button>
      <ProjectCardFooter
        disabled={busy || opening}
        edgeCount={project.edgeCount}
        nodeCount={project.nodeCount}
        statusText={updatedText}
        tone="emerald"
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        onEdit={onEdit}
      />
    </article>
  )
}

function ProjectCardBody({
  description,
  name,
  status,
  tone,
}: {
  description: string
  name: string
  status: React.ReactNode
  tone: 'blue' | 'emerald'
}) {
  const hoverTone = tone === 'emerald' ? 'group-hover:text-emerald-100' : 'group-hover:text-blue-100'
  const arrowTone =
    tone === 'emerald'
      ? 'border-emerald-300/12 bg-emerald-400/8 group-hover:border-emerald-300/28 group-hover:text-emerald-100'
      : 'border-blue-300/12 bg-blue-400/8 group-hover:border-blue-300/28 group-hover:text-blue-100'

  return (
    <div className="p-4 pb-3">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        {status}
        <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition', hoverTone)}>
          打开画布
          <ExternalLink className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold tracking-tight text-white">{name}</p>
          <p className="mt-1 line-clamp-1 text-sm leading-6 text-slate-400">{description}</p>
        </div>
        <span className={cn('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl border text-slate-300 transition', arrowTone)}>
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </div>
    </div>
  )
}

function ProjectCardFooter({
  disabled = false,
  edgeCount,
  nodeCount,
  onDelete,
  onDuplicate,
  onEdit,
  statusText,
  tone,
}: {
  disabled?: boolean
  edgeCount: number
  nodeCount: number
  onDelete: () => void
  onDuplicate: () => void
  onEdit: () => void
  statusText: string
  tone: 'blue' | 'emerald'
}) {
  const iconTone = tone === 'emerald' ? 'text-emerald-300' : 'text-blue-300'

  return (
    <div className="border-t border-white/8 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <Layers3 className={cn('h-3.5 w-3.5', iconTone)} />
            {nodeCount} 节点
          </span>
          <span className="inline-flex items-center gap-1.5">
            <GitBranch className="h-3.5 w-3.5 text-violet-300" />
            {edgeCount} 连线
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
            <Clock3 className="h-3.5 w-3.5 shrink-0 text-slate-500" />
            <span className="truncate">{statusText}</span>
          </span>
        </div>
        <ProjectActionMenu disabled={disabled} onDelete={onDelete} onDuplicate={onDuplicate} onEdit={onEdit} />
      </div>
    </div>
  )
}

function ProjectStatusBadge({ label, tone }: { label: string; tone: 'amber' | 'blue' | 'emerald' }) {
  const toneClass = {
    amber: 'border-amber-300/18 bg-amber-400/10 text-amber-100',
    blue: 'border-blue-300/18 bg-blue-400/10 text-blue-100',
    emerald: 'border-emerald-300/18 bg-emerald-400/10 text-emerald-100',
  }[tone]

  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium', toneClass)}>
      {label}
    </span>
  )
}

function ProjectActionMenu({
  disabled = false,
  onDelete,
  onDuplicate,
  onEdit,
}: {
  disabled?: boolean
  onDelete: () => void
  onDuplicate: () => void
  onEdit: () => void
}) {
  const [open, setOpen] = useState(false)
  const runAction = (action: () => void) => {
    setOpen(false)
    action()
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/8 bg-slate-950/46 text-slate-400 transition hover:border-blue-300/24 hover:text-blue-100 disabled:cursor-not-allowed disabled:opacity-55"
        aria-label="更多操作"
        title="更多操作"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open ? (
        <div className="absolute bottom-10 right-0 z-20 w-32 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 p-1.5 shadow-[0_18px_48px_rgba(2,6,23,0.42)] backdrop-blur">
          <ProjectActionMenuItem icon={PencilLine} label="编辑" onClick={() => runAction(onEdit)} />
          <ProjectActionMenuItem icon={Copy} label="复制" onClick={() => runAction(onDuplicate)} />
          <ProjectActionMenuItem danger icon={Trash2} label="删除" onClick={() => runAction(onDelete)} />
        </div>
      ) : null}
    </div>
  )
}

function ProjectActionMenuItem({
  danger = false,
  icon: Icon,
  label,
  onClick,
}: {
  danger?: boolean
  icon: typeof PencilLine
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-medium transition',
        danger ? 'text-rose-200 hover:bg-rose-400/12' : 'text-slate-300 hover:bg-blue-400/10 hover:text-blue-100',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}
