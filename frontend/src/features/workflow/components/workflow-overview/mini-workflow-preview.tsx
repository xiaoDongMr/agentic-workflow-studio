import { useId } from 'react'

import type { WorkflowProjectPreviewEdge, WorkflowProjectPreviewNode } from '@/api/workflow'
import { cn } from '@/lib/utils'
import type { WorkflowNode, WorkflowNodeType } from '@/types/workflow'

interface MiniWorkflowDocument {
  name: string
  nodes: Array<WorkflowNode | WorkflowProjectPreviewNode>
  edges: Array<Pick<WorkflowProjectPreviewEdge, 'id' | 'source' | 'target'>>
  totalNodeCount?: number
  totalEdgeCount?: number
}

const MAX_TOPOLOGY_NODE_COUNT = 12
const MAX_TOPOLOGY_EDGE_COUNT = 14

const nodeToneByType: Record<WorkflowNodeType, { fill: string; stroke: string; glow: string; label: string }> = {
  start: { fill: '#082f49', stroke: '#38bdf8', glow: 'rgba(56,189,248,0.28)', label: 'S' },
  llm: { fill: '#312e81', stroke: '#a78bfa', glow: 'rgba(167,139,250,0.28)', label: 'AI' },
  selector: { fill: '#451a03', stroke: '#f59e0b', glow: 'rgba(245,158,11,0.26)', label: 'IF' },
  loop: { fill: '#134e4a', stroke: '#2dd4bf', glow: 'rgba(45,212,191,0.26)', label: 'LO' },
  'loop-start': { fill: '#134e4a', stroke: '#2dd4bf', glow: 'rgba(45,212,191,0.22)', label: 'IN' },
  'loop-end': { fill: '#134e4a', stroke: '#2dd4bf', glow: 'rgba(45,212,191,0.22)', label: 'OUT' },
  code: { fill: '#4a044e', stroke: '#f0abfc', glow: 'rgba(240,171,252,0.24)', label: '{}' },
  end: { fill: '#064e3b', stroke: '#34d399', glow: 'rgba(52,211,153,0.26)', label: 'OK' },
}

export function MiniWorkflowPreview({
  workflow,
  badge = '',
  tone = 'blue',
}: {
  workflow: MiniWorkflowDocument
  badge?: string
  tone?: 'blue' | 'emerald'
}) {
  const markerId = `workflow-preview-arrow-${useId().replace(/\W/g, '')}`
  const totalNodeCount = workflow.totalNodeCount ?? workflow.nodes.length
  const totalEdgeCount = workflow.totalEdgeCount ?? workflow.edges.length
  const isComplex = totalNodeCount > MAX_TOPOLOGY_NODE_COUNT || totalEdgeCount > MAX_TOPOLOGY_EDGE_COUNT
  const previewNodes = workflow.nodes.slice(0, MAX_TOPOLOGY_NODE_COUNT)
  const layout = createPreviewLayout(previewNodes)
  const nodeById = new Map(layout.map((node) => [node.id, node]))
  const hiddenNodeCount = Math.max(totalNodeCount - previewNodes.length, 0)
  const typeCounts = countNodesByType(workflow.nodes)
  const background =
    tone === 'emerald'
      ? 'bg-[radial-gradient(circle_at_18%_14%,rgba(52,211,153,0.18),transparent_32%),radial-gradient(circle_at_80%_0%,rgba(14,165,233,0.14),transparent_28%),linear-gradient(135deg,#08111f_0%,#0f172a_48%,#052e2b_100%)]'
      : 'bg-[radial-gradient(circle_at_18%_14%,rgba(96,165,250,0.18),transparent_32%),radial-gradient(circle_at_80%_0%,rgba(168,85,247,0.16),transparent_28%),linear-gradient(135deg,#08111f_0%,#0f172a_48%,#18143b_100%)]'
  const arrowColor = tone === 'emerald' ? '#5eead4' : '#93c5fd'

  return (
    <div className={cn('relative h-[120px] overflow-hidden border-b border-white/8', background)}>
      <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(255,255,255,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.18)_1px,transparent_1px)] [background-size:32px_32px]" />
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-slate-950/42 to-transparent" />

      {isComplex ? (
        <ComplexWorkflowCover
            edgeCount={totalEdgeCount}
            nodeCount={totalNodeCount}
          tone={tone}
          typeCounts={typeCounts}
        />
      ) : (
        <svg className="relative h-full w-full" viewBox="0 0 640 240" role="img" aria-label={`${workflow.name} 流程缩略图`}>
        <defs>
            <marker id={markerId} markerHeight="7" markerWidth="7" orient="auto" refX="6" refY="3.5">
              <path d="M0,0 L7,3.5 L0,7 Z" fill={arrowColor} opacity="0.82" />
          </marker>
        </defs>

          {workflow.edges.slice(0, MAX_TOPOLOGY_EDGE_COUNT).map((edge) => {
          const source = nodeById.get(edge.source)
          const target = nodeById.get(edge.target)
          if (!source || !target) {
            return null
          }

          return (
            <path
              key={edge.id}
                d={`M${source.x + 28},${source.y + 28} C${source.x + 92},${source.y + 28} ${target.x - 64},${target.y + 28} ${target.x},${target.y + 28}`}
              fill="none"
              markerEnd={`url(#${markerId})`}
              stroke={arrowColor}
              strokeLinecap="round"
                strokeWidth="2.6"
                opacity="0.44"
            />
          )
        })}

        {layout.map((node) => {
            const nodeTone = nodeToneByType[node.type]
          return (
            <g key={node.id}>
                <circle cx={node.x + 28} cy={node.y + 28} r="28" fill={nodeTone.glow} opacity="0.9" />
              <rect
                x={node.x}
                y={node.y}
                  width="56"
                  height="56"
                  rx="18"
                  fill={nodeTone.fill}
                  stroke={nodeTone.stroke}
                  strokeOpacity="0.82"
                  strokeWidth="2.4"
              />
                <circle cx={node.x + 44} cy={node.y + 14} r="4.5" fill={nodeTone.stroke} opacity="0.92" />
                <text x={node.x + 28} y={node.y + 34} fill="#f8fafc" fontSize="13" fontWeight="800" textAnchor="middle">
                  {nodeTone.label}
              </text>
            </g>
          )
        })}

          {hiddenNodeCount > 0 ? (
            <g>
              <rect x="548" y="92" width="58" height="40" rx="16" fill="rgba(15,23,42,0.8)" stroke="rgba(226,232,240,0.2)" />
              <text x="577" y="117" fill="#cbd5e1" fontSize="16" fontWeight="800" textAnchor="middle">
                +{hiddenNodeCount}
              </text>
            </g>
          ) : null}
      </svg>
      )}

      {badge ? (
        <div
          className={cn(
            'absolute left-4 top-4 rounded-full border border-white/10 bg-slate-950/64 px-3 py-1 text-xs font-medium backdrop-blur',
            tone === 'emerald' ? 'text-emerald-100' : 'text-blue-100',
          )}
        >
          {badge}
        </div>
      ) : null}
    </div>
  )
}

function createPreviewLayout(nodes: Array<WorkflowNode | WorkflowProjectPreviewNode>) {
  if (nodes.length === 0) {
    return []
  }

  const minX = Math.min(...nodes.map((node) => node.position.x))
  const maxX = Math.max(...nodes.map((node) => node.position.x))
  const minY = Math.min(...nodes.map((node) => node.position.y))
  const maxY = Math.max(...nodes.map((node) => node.position.y))
  const rangeX = Math.max(maxX - minX, 1)
  const rangeY = Math.max(maxY - minY, 1)
  const scale = Math.min(500 / rangeX, 150 / rangeY, 0.62)

  return nodes.map((node) => ({
    ...node,
    x: 46 + (node.position.x - minX) * scale,
    y: 60 + (node.position.y - minY) * scale,
  }))
}

function ComplexWorkflowCover({
  edgeCount,
  nodeCount,
  tone,
  typeCounts,
}: {
  edgeCount: number
  nodeCount: number
  tone: 'blue' | 'emerald'
  typeCounts: Array<{ type: WorkflowNodeType; count: number }>
}) {
  const accent = tone === 'emerald' ? 'text-emerald-100' : 'text-blue-100'
  const border = tone === 'emerald' ? 'border-emerald-300/18 bg-emerald-300/10' : 'border-blue-300/18 bg-blue-300/10'

  return (
    <div className="relative flex h-full items-center justify-between gap-5 px-5 py-4">
      <div className="min-w-0">
        <div className={cn('inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold', border, accent)}>
          复杂工作流
        </div>
        <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{nodeCount} 个节点</p>
        <p className="mt-1 text-xs text-slate-400">{edgeCount} 条连线，保存为结构化版本快照</p>
      </div>
      <div className="grid shrink-0 grid-cols-2 gap-2">
        {typeCounts.slice(0, 4).map((item) => {
          const nodeTone = nodeToneByType[item.type]
          return (
            <div
              key={item.type}
              className="flex min-w-16 items-center gap-1.5 rounded-2xl border border-white/10 bg-slate-950/42 px-2.5 py-2"
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: nodeTone.stroke, boxShadow: `0 0 16px ${nodeTone.glow}` }}
              />
              <span className="text-xs font-semibold text-slate-200">{nodeTone.label}</span>
              <span className="text-xs text-slate-500">{item.count}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function countNodesByType(nodes: Array<WorkflowNode | WorkflowProjectPreviewNode>) {
  const counts = new Map<WorkflowNodeType, number>()
  nodes.forEach((node) => {
    counts.set(node.type, (counts.get(node.type) ?? 0) + 1)
  })
  return Array.from(counts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((left, right) => right.count - left.count)
}
