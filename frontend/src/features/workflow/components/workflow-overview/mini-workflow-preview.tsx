import { useId } from 'react'

import type { WorkflowProjectPreviewEdge, WorkflowProjectPreviewNode } from '@/api/workflow'
import { cn } from '@/lib/utils'
import type { WorkflowNode, WorkflowNodeType } from '@/types/workflow'

interface MiniWorkflowDocument {
  name: string
  nodes: Array<WorkflowNode | WorkflowProjectPreviewNode>
  edges: Array<Pick<WorkflowProjectPreviewEdge, 'id' | 'source' | 'target'>>
}

const nodeToneByType: Record<WorkflowNodeType, { fill: string; stroke: string; text: string }> = {
  start: { fill: '#163b5f', stroke: '#38bdf8', text: '#dff7ff' },
  llm: { fill: '#2f246d', stroke: '#a78bfa', text: '#f2ecff' },
  selector: { fill: '#4a2b12', stroke: '#f59e0b', text: '#fff4db' },
  loop: { fill: '#123f35', stroke: '#34d399', text: '#dcfff6' },
  'loop-start': { fill: '#123f35', stroke: '#34d399', text: '#dcfff6' },
  'loop-end': { fill: '#123f35', stroke: '#34d399', text: '#dcfff6' },
  code: { fill: '#172554', stroke: '#60a5fa', text: '#e2efff' },
  end: { fill: '#42172a', stroke: '#fb7185', text: '#ffe4ea' },
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
  const previewNodes = workflow.nodes.slice(0, 8)
  const layout = createPreviewLayout(previewNodes)
  const nodeById = new Map(layout.map((node) => [node.id, node]))
  const background =
    tone === 'emerald'
      ? 'bg-[radial-gradient(circle_at_18%_12%,rgba(52,211,153,0.22),transparent_34%),linear-gradient(135deg,#0f172a_0%,#064e3b_100%)]'
      : 'bg-[radial-gradient(circle_at_20%_10%,rgba(96,165,250,0.24),transparent_32%),linear-gradient(135deg,#111827_0%,#0f172a_42%,#1e1b4b_100%)]'
  const arrowColor = tone === 'emerald' ? '#6ee7b7' : '#93c5fd'

  return (
    <div className={cn('relative h-[120px] overflow-hidden border-b border-white/8', background)}>
      <div className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(rgba(255,255,255,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.18)_1px,transparent_1px)] [background-size:28px_28px]" />
      <svg className="relative h-full w-full" viewBox="0 0 640 300" role="img" aria-label={`${workflow.name} 流程缩略图`}>
        <defs>
          <marker id={markerId} markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
            <path d="M0,0 L8,4 L0,8 Z" fill={arrowColor} opacity="0.9" />
          </marker>
        </defs>

        {workflow.edges.map((edge) => {
          const source = nodeById.get(edge.source)
          const target = nodeById.get(edge.target)
          if (!source || !target) {
            return null
          }

          return (
            <path
              key={edge.id}
              d={`M${source.x + 96},${source.y + 24} C${source.x + 142},${source.y + 24} ${target.x - 46},${target.y + 24} ${target.x},${target.y + 24}`}
              fill="none"
              markerEnd={`url(#${markerId})`}
              stroke={arrowColor}
              strokeLinecap="round"
              strokeWidth="3"
              opacity="0.74"
            />
          )
        })}

        {layout.map((node) => {
          const tone = nodeToneByType[node.type]
          return (
            <g key={node.id}>
              <rect
                x={node.x}
                y={node.y}
                width="96"
                height="48"
                rx="16"
                fill={tone.fill}
                stroke={tone.stroke}
                strokeOpacity="0.72"
                strokeWidth="2"
              />
              <circle cx={node.x + 18} cy={node.y + 24} r="6" fill={tone.stroke} opacity="0.88" />
              <text x={node.x + 32} y={node.y + 29} fill={tone.text} fontSize="16" fontWeight="700">
                {formatNodeTitle(node.title)}
              </text>
            </g>
          )
        })}
      </svg>
      {badge ? (
        <div
          className={cn(
            'absolute right-4 top-4 rounded-full border border-white/10 bg-slate-950/72 px-3 py-1 text-xs font-medium backdrop-blur',
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
  const scale = Math.min(500 / rangeX, 200 / rangeY, 0.72)

  return nodes.map((node) => ({
    ...node,
    x: 50 + (node.position.x - minX) * scale,
    y: 48 + (node.position.y - minY) * scale,
  }))
}

function formatNodeTitle(title: string) {
  return title.length > 4 ? `${title.slice(0, 4)}…` : title
}
