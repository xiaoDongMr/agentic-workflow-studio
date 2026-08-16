import type {
  WorkflowPreviewGraphSummary,
  WorkflowToolActivity,
} from '@/features/workflow/assistant/types'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

export function RunningGraphGenerationSummary({
  summary,
}: {
  summary: WorkflowPreviewGraphSummary
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      <SummaryChip tone="blue">已同步 {previewGraphSyncIndex(summary)} 次</SummaryChip>
      <SummaryChip tone="blue">{summary.nodeCount} 个节点</SummaryChip>
      <SummaryChip tone="blue">{summary.edgeCount} 条连线</SummaryChip>
      <SummaryChip tone="blue">{summary.positionedNodeCount} 个已布局</SummaryChip>
    </div>
  )
}

export function CanvasUpdateSummary({
  summary,
}: {
  summary: NonNullable<WorkflowToolActivity['previewGraphSummary']>
}) {
  const primaryChange = getPrimaryPreviewChange(summary)
  const secondaryChanges = getSecondaryPreviewChanges(summary, primaryChange?.key)

  return (
    <div className="mt-1.5 space-y-1.5">
      <p className="text-[10px] leading-4 text-slate-400">
        {primaryChange ? '已同步到预览画布' : '已刷新当前节点位置和画布状态'}
      </p>
      {secondaryChanges.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {secondaryChanges.map((change) => (
            <SummaryChip key={change.key} tone={change.tone}>{change.label}</SummaryChip>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function SummaryChip({
  children,
  tone = 'cyan',
}: {
  children: ReactNode
  tone?: 'cyan' | 'blue' | 'emerald'
}) {
  return (
    <span className={cn(
      'inline-flex max-w-full items-center rounded-md border px-2 py-1 text-[9px] leading-none',
      tone === 'cyan' && 'border-cyan-300/12 bg-cyan-400/[0.045] text-cyan-100/85',
      tone === 'blue' && 'border-blue-300/12 bg-blue-400/[0.045] text-blue-100/85',
      tone === 'emerald' && 'border-emerald-300/12 bg-emerald-400/[0.05] text-emerald-100/85',
    )}>
      <span className="truncate">{children}</span>
    </span>
  )
}

export function WorkflowCompleteSummary({
  summary,
}: {
  summary: WorkflowPreviewGraphSummary
}) {
  return (
    <div className="rounded-2xl border border-emerald-300/14 bg-emerald-400/[0.045] px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-xs font-medium text-emerald-100">生成完成，最终预览已就绪</p>
        <span className="shrink-0 text-[9px] text-emerald-200/70">
          {previewGraphSyncIndex(summary)} 次同步
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <SummaryChip tone="emerald">{summary.nodeCount} 个节点</SummaryChip>
        <SummaryChip tone="emerald">{summary.edgeCount} 条连线</SummaryChip>
        <SummaryChip tone="emerald">{summary.positionedNodeCount} 个已布局</SummaryChip>
      </div>
    </div>
  )
}

function previewGraphSyncIndex(summary: WorkflowPreviewGraphSummary) {
  return Number.isFinite(summary.syncIndex) && summary.syncIndex > 0
    ? summary.syncIndex
    : 1
}

export function previewGraphDisplayTitle(summary: WorkflowPreviewGraphSummary) {
  const primaryChange = getPrimaryPreviewChange(summary)
  return primaryChange
    ? `${primaryChange.verb}：${primaryChange.name}`
    : '刷新预览画布'
}

function getPrimaryPreviewChange(summary: WorkflowPreviewGraphSummary) {
  const addedNode = summary.addedNodes[0]
  if (addedNode) {
    return {
      key: `add-node:${addedNode.id}`,
      verb: '生成',
      name: addedNode.title,
    }
  }
  const updatedNode = summary.updatedNodes[0]
  if (updatedNode) {
    return {
      key: `update-node:${updatedNode.id}`,
      verb: '更新',
      name: updatedNode.title,
    }
  }
  const removedNode = summary.removedNodes[0]
  if (removedNode) {
    return {
      key: `remove-node:${removedNode.id}`,
      verb: '移除',
      name: removedNode.title,
    }
  }
  const addedEdge = summary.addedEdges[0]
  if (addedEdge) {
    return {
      key: `add-edge:${addedEdge.id}`,
      verb: '连接',
      name: `${addedEdge.sourceTitle} -> ${addedEdge.targetTitle}`,
    }
  }
  const removedEdge = summary.removedEdges[0]
  if (removedEdge) {
    return {
      key: `remove-edge:${removedEdge.id}`,
      verb: '移除连线',
      name: `${removedEdge.sourceTitle} -> ${removedEdge.targetTitle}`,
    }
  }
  return undefined
}

function getSecondaryPreviewChanges(
  summary: WorkflowPreviewGraphSummary,
  excludedKey?: string,
) {
  return [
    ...summary.addedNodes.map((node) => ({
      key: `add-node:${node.id}`,
      label: `生成 ${node.title}`,
      tone: 'emerald' as const,
    })),
    ...summary.updatedNodes.map((node) => ({
      key: `update-node:${node.id}`,
      label: `更新 ${node.title}`,
      tone: 'cyan' as const,
    })),
    ...summary.removedNodes.map((node) => ({
      key: `remove-node:${node.id}`,
      label: `移除 ${node.title}`,
      tone: 'cyan' as const,
    })),
    ...summary.addedEdges.map((edge) => ({
      key: `add-edge:${edge.id}`,
      label: `${edge.sourceTitle} -> ${edge.targetTitle}`,
      tone: 'cyan' as const,
    })),
    ...summary.removedEdges.map((edge) => ({
      key: `remove-edge:${edge.id}`,
      label: `移除 ${edge.sourceTitle} -> ${edge.targetTitle}`,
      tone: 'cyan' as const,
    })),
  ].filter((change) => change.key !== excludedKey).slice(0, 3)
}
