import { useState } from 'react'
import { ChevronDown, GitBranchPlus } from 'lucide-react'
import {
  WorkflowNodeRenderer,
  type WorkflowJSON,
  type WorkflowNodeProps,
} from '@flowgram.ai/free-layout-editor'

import {
  nodeIcons,
  nodeThemeClass,
} from '@/features/workflow/editor/workflow-editor.config'
import type { FlowgramNodeData, TrialRunNodeExecution } from '@/features/workflow/editor/workflow-editor.types'
import { cn } from '@/lib/utils'
import { useWorkflowStore } from '@/store/workflow-store'
import type { WorkflowNode } from '@/types/workflow'

export function FlowgramNodeCard({
  node,
  onSelectNode,
  selectedNodeId,
  quickAddOpenNodeId,
  onToggleQuickAdd,
  trialRunExecution,
}: {
  node: WorkflowNodeProps['node']
  onSelectNode: (nodeId: string) => void
  selectedNodeId: string
  quickAddOpenNodeId: string
  onToggleQuickAdd: (nodeId: string) => void
  trialRunExecution?: TrialRunNodeExecution
}) {
  const setSelectedNodeId = useWorkflowStore((state) => state.setSelectedNodeId)
  const nodeJson = node.toJSON() as WorkflowJSON['nodes'][number] & { data?: FlowgramNodeData }
  const data = nodeJson.data
  const effectiveExecution = trialRunExecution ?? data?.trialRunExecution
  const kind: WorkflowNode['type'] = data?.kind ?? 'llm'
  const Icon = nodeIcons[kind]
  const nodeId = String(nodeJson.id)
  const isSelected = selectedNodeId === nodeId
  const quickAddOpen = quickAddOpenNodeId === nodeId
  const inputItems = data?.inputs ?? []
  const outputItems = data?.outputs ?? []
  const runtimeStatusLabel =
    effectiveExecution?.status === 'running'
      ? '运行中'
      : effectiveExecution?.status === 'error'
        ? '失败'
        : data?.status === 'active'
          ? '运行中'
          : data?.status === 'success'
            ? '完成'
            : '待执行'

  return (
    <WorkflowNodeRenderer
      node={node}
      className={cn(
        'aw-flow-node',
        nodeThemeClass[kind],
        isSelected && 'aw-flow-node--external-selected',
      )}
      portClassName="aw-flow-port"
      portPrimaryColor="#7aa2ff"
      portSecondaryColor="#273249"
      portBackgroundColor="#0b1120"
    >
      <div
        className="aw-flow-node__inner"
        onMouseDown={() => {
          setSelectedNodeId(nodeId)
          onSelectNode(nodeId)
        }}
      >
        <div className="aw-flow-node__header">
          <div className="aw-flow-node__icon">
            <Icon className="h-3.5 w-3.5" />
          </div>
          <span
            className={cn(
              'aw-flow-node__status',
              effectiveExecution?.status === 'running' && 'aw-flow-node__status--running',
              effectiveExecution?.status === 'error' && 'aw-flow-node__status--error',
            )}
          >
            {runtimeStatusLabel}
          </span>
        </div>
        <div className="aw-flow-node__title">{data?.title}</div>
        <div className="aw-flow-node__description">{data?.description}</div>
        <div className="aw-flow-node__io">
          <NodeIoRow label="输入" items={inputItems} />
          <NodeIoRow label="输出" items={outputItems} />
        </div>
      </div>
      <div className="aw-flow-node__quick-add aw-flow-ignore-deselect">
        <button
          type="button"
          onClick={() => onToggleQuickAdd(nodeId)}
          className={cn('aw-flow-node__quick-add-trigger', quickAddOpen && 'aw-flow-node__quick-add-trigger--open')}
          aria-label="从当前节点添加后续节点"
        >
          <GitBranchPlus className="h-3.5 w-3.5" />
        </button>
      </div>
      {effectiveExecution && <NodeExecutionPanel execution={effectiveExecution} />}
    </WorkflowNodeRenderer>
  )
}

function NodeExecutionPanel({
  execution,
}: {
  execution: TrialRunNodeExecution
}) {
  const [expanded, setExpanded] = useState(false)
  const statusLabel = execution.status === 'running' ? '运行中' : execution.status === 'error' ? '运行失败' : '运行完成'

  return (
    <div className="aw-flow-node__execution aw-flow-ignore-deselect">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="aw-flow-node__execution-summary"
      >
        <div className="aw-flow-node__execution-summary-main">
          <span
            className={cn(
              'aw-flow-node__execution-state',
              execution.status === 'running' && 'aw-flow-node__execution-state--running',
              execution.status === 'error' && 'aw-flow-node__execution-state--error',
            )}
          >
            {statusLabel}
          </span>
          <span className="aw-flow-node__execution-duration">{(execution.durationMs / 1000).toFixed(3)}s</span>
        </div>
        <div className="aw-flow-node__execution-summary-content">
          <p className="aw-flow-node__execution-summary-text">{execution.summaryInput ?? execution.log}</p>
          <p className="aw-flow-node__execution-summary-text aw-flow-node__execution-summary-text--muted">
            {execution.summaryOutput ?? '点击查看详细执行记录'}
          </p>
        </div>
        <ChevronDown
          className={cn('h-4 w-4 text-slate-500 transition-transform', expanded && 'rotate-180')}
        />
      </button>

      {expanded && (
        <>
          <div className="aw-flow-node__execution-header">
            <p className="aw-flow-node__execution-log">{execution.log}</p>
          </div>
          <div className="aw-flow-node__execution-section">
            <span className="aw-flow-node__execution-label">输入</span>
            <pre className="aw-flow-node__execution-code">{execution.input}</pre>
          </div>
          <div className="aw-flow-node__execution-section">
            <span className="aw-flow-node__execution-label">输出</span>
            <pre className="aw-flow-node__execution-code">{execution.output}</pre>
          </div>
        </>
      )}
    </div>
  )
}

function NodeIoRow({
  label,
  items,
}: {
  label: string
  items: FlowgramNodeData['inputs'] | FlowgramNodeData['outputs']
}) {
  const visibleItems = items.slice(0, 2)
  const hiddenCount = Math.max(items.length - visibleItems.length, 0)

  return (
    <div className="aw-flow-node__io-row">
      <span className="aw-flow-node__io-label">{label}</span>
      <div className="aw-flow-node__io-values">
        {visibleItems.length > 0 ? (
          <>
            {visibleItems.map((item) => (
              <span key={`${label}-${item.name}`} className="aw-flow-node__io-chip">
                <span className="aw-flow-node__io-chip-type">{item.type}</span>
                <span className="aw-flow-node__io-chip-name">{item.name}</span>
              </span>
            ))}
            {hiddenCount > 0 && <span className="aw-flow-node__io-more">+{hiddenCount}</span>}
          </>
        ) : (
          <span className="aw-flow-node__io-empty">无</span>
        )}
      </div>
    </div>
  )
}
