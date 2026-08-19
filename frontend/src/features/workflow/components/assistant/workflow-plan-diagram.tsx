import { Maximize2, X } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

interface DiagramNode {
  id: string
  label: string
  level: number
  x: number
  y: number
}

interface DiagramEdge {
  source: string
  target: string
  label?: string
}

interface ParsedDiagram {
  direction: 'TD' | 'LR'
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  width: number
  height: number
}

const NODE_WIDTH = 184
const NODE_HEIGHT = 54
const COLUMN_GAP = 54
const ROW_GAP = 42
const PADDING = 28

export function WorkflowPlanDiagram({ source }: { source: string }) {
  const markerId = `workflow-arrow-${useId().replaceAll(':', '')}`
  const diagram = useMemo(() => parseDiagram(source), [source])
  const [expanded, setExpanded] = useState(false)

  if (!diagram) {
    return (
      <pre className="max-h-64 overflow-auto p-3.5 text-[11px] leading-5 text-sky-100/90">
        {source}
      </pre>
    )
  }

  return (
    <>
      <div className="relative h-64 w-full min-w-0 max-w-full overflow-hidden bg-[radial-gradient(circle_at_top,rgba(139,92,246,0.08),transparent_58%)] p-3">
        <DiagramSvg
          className="h-full w-full"
          diagram={diagram}
          markerId={`${markerId}-thumbnail`}
        />
        <button
          type="button"
          aria-label="放大流程图"
          title="放大预览"
          onClick={() => setExpanded(true)}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg border border-violet-300/18 bg-slate-950/80 text-violet-100 shadow-lg backdrop-blur transition hover:border-violet-300/32 hover:bg-slate-900"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {expanded && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-label="流程图放大预览"
          aria-modal="true"
          className="fixed inset-0 z-[100] flex flex-col bg-slate-950/96 backdrop-blur-xl"
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-5">
            <div>
              <p className="text-sm font-semibold text-white">流程图预览</p>
              <p className="mt-0.5 text-[10px] text-slate-500">{diagram.nodes.length} 个节点</p>
            </div>
            <button
              type="button"
              aria-label="关闭流程图预览"
              title="关闭"
              onClick={() => setExpanded(false)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 p-6">
            <DiagramSvg
              className="h-full w-full"
              diagram={diagram}
              markerId={`${markerId}-expanded`}
            />
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

function DiagramSvg({
  className,
  diagram,
  markerId,
}: {
  className: string
  diagram: ParsedDiagram
  markerId: string
}) {
  const nodeById = new Map(diagram.nodes.map((node) => [node.id, node]))
  return (
    <svg
      aria-label="流程草图可视化"
      className={className}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      viewBox={`0 0 ${diagram.width} ${diagram.height}`}
    >
      <defs>
        <marker
          id={markerId}
          markerHeight="7"
          markerWidth="7"
          orient="auto"
          refX="6"
          refY="3.5"
        >
          <path d="M0,0 L7,3.5 L0,7 Z" fill="rgba(167,139,250,0.75)" />
        </marker>
      </defs>
      {diagram.edges.map((edge, index) => {
        const sourceNode = nodeById.get(edge.source)
        const targetNode = nodeById.get(edge.target)
        if (!sourceNode || !targetNode) {
          return null
        }
        const { path, labelX, labelY } = getEdgePath(
          sourceNode,
          targetNode,
          diagram.direction,
        )
        return (
          <g key={`${edge.source}-${edge.target}-${index}`}>
            <path
              d={path}
              fill="none"
              markerEnd={`url(#${markerId})`}
              stroke="rgba(167,139,250,0.62)"
              strokeWidth="1.5"
            />
            {edge.label && (
              <text
                fill="rgba(203,213,225,0.72)"
                fontSize="10"
                textAnchor="middle"
                x={labelX}
                y={labelY}
              >
                {edge.label}
              </text>
            )}
          </g>
        )
      })}
      {diagram.nodes.map((node, index) => {
        const lines = splitLabel(node.label)
        const isBoundary = index === 0 || !diagram.edges.some((edge) => edge.source === node.id)
        return (
          <g key={node.id} transform={`translate(${node.x} ${node.y})`}>
            <rect
              fill={isBoundary ? 'rgba(124,58,237,0.18)' : 'rgba(15,23,42,0.94)'}
              height={NODE_HEIGHT}
              rx="14"
              stroke={isBoundary ? 'rgba(196,181,253,0.5)' : 'rgba(148,163,184,0.25)'}
              width={NODE_WIDTH}
            />
            <circle
              cx="18"
              cy={NODE_HEIGHT / 2}
              fill={isBoundary ? 'rgba(139,92,246,0.9)' : 'rgba(124,58,237,0.42)'}
              r="9"
            />
            <text
              fill="rgba(255,255,255,0.9)"
              fontSize="8"
              fontWeight="600"
              textAnchor="middle"
              x="18"
              y={NODE_HEIGHT / 2 + 3}
            >
              {node.level + 1}
            </text>
            <text
              fill="rgba(241,245,249,0.94)"
              fontSize="11"
              fontWeight="600"
              textAnchor="middle"
              x={NODE_WIDTH / 2 + 8}
              y={lines.length === 1 ? 31 : 24}
            >
              {lines.map((line, lineIndex) => (
                <tspan
                  key={`${node.id}-${lineIndex}`}
                  x={NODE_WIDTH / 2 + 8}
                  dy={lineIndex === 0 ? 0 : 16}
                >
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function parseDiagram(source: string): ParsedDiagram | null {
  const statements = normalizeMermaidSource(source)
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('%%') && !isIgnoredMermaidStatement(line))
  const header = statements.shift()?.match(/^(?:graph|flowchart)\s+(TD|TB|LR|RL)/i)
  if (!header) {
    return null
  }

  const direction: 'TD' | 'LR' = ['LR', 'RL'].includes(header[1].toUpperCase()) ? 'LR' : 'TD'
  const labels = new Map<string, string>()
  const edges: DiagramEdge[] = []
  let unsupportedStatement = false

  for (const statement of statements) {
    const edge = parseEdge(statement)
    if (edge) {
      const sourceNode = parseNode(edge.source)
      const targetNode = parseNode(edge.target)
      if (!sourceNode || !targetNode) {
        unsupportedStatement = true
        break
      }
      registerNodeLabel(labels, sourceNode)
      registerNodeLabel(labels, targetNode)
      edges.push({
        source: sourceNode.id,
        target: targetNode.id,
        label: edge.label,
      })
      continue
    }
    const node = parseNode(statement)
    if (node) {
      registerNodeLabel(labels, node)
    } else {
      unsupportedStatement = true
      break
    }
  }

  if (unsupportedStatement || labels.size === 0) {
    return null
  }

  const levels = calculateLevels([...labels.keys()], edges)
  const grouped = new Map<number, string[]>()
  for (const id of labels.keys()) {
    const level = levels.get(id) ?? 0
    grouped.set(level, [...(grouped.get(level) ?? []), id])
  }
  const maxLevel = Math.max(...grouped.keys())
  const maxPerLevel = Math.max(...[...grouped.values()].map((items) => items.length))
  const width = direction === 'LR'
    ? PADDING * 2 + (maxLevel + 1) * NODE_WIDTH + maxLevel * COLUMN_GAP
    : PADDING * 2 + maxPerLevel * NODE_WIDTH + Math.max(0, maxPerLevel - 1) * COLUMN_GAP
  const height = direction === 'LR'
    ? PADDING * 2 + maxPerLevel * NODE_HEIGHT + Math.max(0, maxPerLevel - 1) * ROW_GAP
    : PADDING * 2 + (maxLevel + 1) * NODE_HEIGHT + maxLevel * ROW_GAP
  const nodes: DiagramNode[] = []

  for (const [level, ids] of grouped) {
    const groupSpan = direction === 'LR'
      ? ids.length * NODE_HEIGHT + Math.max(0, ids.length - 1) * ROW_GAP
      : ids.length * NODE_WIDTH + Math.max(0, ids.length - 1) * COLUMN_GAP
    ids.forEach((id, index) => {
      nodes.push({
        id,
        label: labels.get(id) ?? id,
        level,
        x: direction === 'LR'
          ? PADDING + level * (NODE_WIDTH + COLUMN_GAP)
          : (width - groupSpan) / 2 + index * (NODE_WIDTH + COLUMN_GAP),
        y: direction === 'LR'
          ? (height - groupSpan) / 2 + index * (NODE_HEIGHT + ROW_GAP)
          : PADDING + level * (NODE_HEIGHT + ROW_GAP),
      })
    })
  }

  return { direction, nodes, edges, width, height }
}

function normalizeMermaidSource(source: string) {
  const trimmed = source.trim()
  const fenced = trimmed.match(/^```(?:mermaid)?\s*\n([\s\S]*?)\n```$/i)
  return fenced?.[1] ?? trimmed
}

function isIgnoredMermaidStatement(statement: string) {
  return /^(?:style|classDef|class|linkStyle)\b/i.test(statement)
}

interface ParsedNode {
  id: string
  label: string
  hasExplicitLabel: boolean
}

interface ParsedEdge {
  source: string
  target: string
  label?: string
}

function parseEdge(statement: string): ParsedEdge | null {
  const inlineLabel = statement.match(/^(.+?)\s+--\s+(.+?)\s+-->\s+(.+)$/)
  if (inlineLabel) {
    return {
      source: inlineLabel[1],
      target: inlineLabel[3],
      label: inlineLabel[2].trim(),
    }
  }

  const arrow = statement.match(/^(.+?)\s*(-->|---|==>|-\.->)\s*(?:\|([^|]+)\|\s*)?(.+)$/)
  if (!arrow) {
    return null
  }
  return {
    source: arrow[1],
    target: arrow[4],
    label: arrow[3]?.trim(),
  }
}

function parseNode(expression: string): ParsedNode | null {
  const value = expression.trim()
  const match = value.match(/^([A-Za-z0-9_.-]+)\s*(?:\[\[(.*?)\]\]|\(\((.*?)\)\)|\[(.*?)\]|\{(.*?)\}|\((.*?)\))?$/)
  if (!match) {
    return null
  }
  return {
    id: match[1],
    label: match.slice(2).find((item) => item !== undefined)?.trim() || match[1],
    hasExplicitLabel: match.slice(2).some((item) => item !== undefined),
  }
}

function registerNodeLabel(labels: Map<string, string>, node: ParsedNode) {
  if (node.hasExplicitLabel || !labels.has(node.id)) {
    labels.set(node.id, node.label)
  }
}

function getEdgePath(
  source: DiagramNode,
  target: DiagramNode,
  direction: ParsedDiagram['direction'],
) {
  const horizontal = direction === 'LR'
  const movesRight = target.x > source.x
  const x1 = source.x + (horizontal ? (movesRight ? NODE_WIDTH : 0) : NODE_WIDTH / 2)
  const y1 = source.y + (horizontal ? NODE_HEIGHT / 2 : NODE_HEIGHT)
  const x2 = target.x + (horizontal ? (movesRight ? 0 : NODE_WIDTH) : NODE_WIDTH / 2)
  const y2 = target.y + (horizontal ? NODE_HEIGHT / 2 : 0)
  const path = horizontal
    ? `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`
    : `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`
  return {
    path,
    labelX: (x1 + x2) / 2,
    labelY: (y1 + y2) / 2 - 5,
  }
}

function calculateLevels(nodeIds: string[], edges: DiagramEdge[]) {
  const levels = new Map(nodeIds.map((id) => [id, 0]))
  for (let pass = 0; pass < nodeIds.length; pass += 1) {
    let changed = false
    for (const edge of edges) {
      const nextLevel = Math.min(nodeIds.length - 1, (levels.get(edge.source) ?? 0) + 1)
      if (nextLevel > (levels.get(edge.target) ?? 0)) {
        levels.set(edge.target, nextLevel)
        changed = true
      }
    }
    if (!changed) {
      break
    }
  }
  return levels
}

function splitLabel(label: string) {
  if (label.length <= 14) {
    return [label]
  }
  return [label.slice(0, 14), `${label.slice(14, 27)}${label.length > 27 ? '…' : ''}`]
}
