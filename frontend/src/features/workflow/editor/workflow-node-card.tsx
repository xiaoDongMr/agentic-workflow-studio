import { useCallback, useRef, useState } from 'react'
import { ChevronDown, Copy, GitBranchPlus, MoreHorizontal, Play, Trash2 } from 'lucide-react'
import {
  WorkflowNodeRenderer,
  type WorkflowJSON,
  type WorkflowNodeProps,
} from '@flowgram.ai/free-layout-editor'

import {
  nodeIcons,
  nodeThemeClass,
} from '@/features/workflow/editor/workflow-editor.config'
import { useClickOutside } from '@/features/workflow/components/node-config/use-click-outside'
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
  onRunNode,
  onCopyNode,
  onDeleteNode,
  nodeActionRunning = false,
}: {
  node: WorkflowNodeProps['node']
  onSelectNode: (nodeId: string) => void
  selectedNodeId: string
  quickAddOpenNodeId: string
  onToggleQuickAdd: (nodeId: string) => void
  trialRunExecution?: TrialRunNodeExecution
  onRunNode: (nodeId: string) => void
  onCopyNode: (nodeId: string) => void
  onDeleteNode: (nodeId: string) => void
  nodeActionRunning?: boolean
}) {
  const setSelectedNodeId = useWorkflowStore((state) => state.setSelectedNodeId)
  const [menuOpen, setMenuOpen] = useState(false)
  const actionsRef = useRef<HTMLDivElement>(null)
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
  const canDeleteOrCopy = kind !== 'start'
  const isNodeRunning = nodeActionRunning || effectiveExecution?.status === 'running'
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  useClickOutside(actionsRef, menuOpen, closeMenu)
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
          {kind === 'llm' && <NodeMetaRow label="模型" value={data?.config.model || '默认模型'} />}
        </div>
      </div>
      <div
        ref={actionsRef}
        className="aw-flow-node__actions aw-flow-ignore-deselect"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => onRunNode(nodeId)}
          disabled={isNodeRunning}
          className="aw-flow-node__action-button"
          aria-label="测试当前节点"
        >
          <Play className="h-3.5 w-3.5 fill-current" />
        </button>
        {canDeleteOrCopy && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="aw-flow-node__action-button aw-flow-node__action-button--menu"
              aria-label="节点操作"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="aw-flow-node__action-menu">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onCopyNode(nodeId)
                  }}
                  className="aw-flow-node__action-menu-item"
                >
                  <Copy className="h-3.5 w-3.5" />
                  复制
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onDeleteNode(nodeId)
                  }}
                  className="aw-flow-node__action-menu-item aw-flow-node__action-menu-item--danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  删除
                </button>
              </div>
            )}
          </div>
        )}
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
  const statusLabel =
    execution.status === 'running'
      ? '运行中'
      : execution.status === 'error'
        ? '运行失败'
        : execution.degraded
          ? '降级完成'
          : '运行完成'
  const isRunning = execution.status === 'running'
  const isError = execution.status === 'error'
  const timeline = execution.timeline ?? []
  const executionRecord = [
    `状态：${statusLabel}`,
    `日志：${execution.log}`,
    execution.error ? `错误：${execution.error}` : '',
    timeline.length > 0
      ? `执行过程：\n${timeline.map((item) => `[${item.title}] ${item.message}`).join('\n')}`
      : '',
    `输入：\n${execution.input}`,
    !isRunning ? `输出：\n${execution.output}` : '',
  ].filter(Boolean).join('\n\n')

  return (
    <div
      className="aw-flow-node__execution aw-flow-ignore-deselect"
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="aw-flow-node__execution-summary"
      >
        <div className="aw-flow-node__execution-summary-main">
          <span
            className={cn(
              'aw-flow-node__execution-state',
              isRunning && 'aw-flow-node__execution-state--running',
              isError && 'aw-flow-node__execution-state--error',
              execution.degraded && !isError && 'aw-flow-node__execution-state--warning',
            )}
          >
            {statusLabel}
          </span>
          {!isRunning && (
            <span className="aw-flow-node__execution-duration">{(execution.durationMs / 1000).toFixed(3)}s</span>
          )}
        </div>
        <div className="aw-flow-node__execution-summary-content">
          <p className="aw-flow-node__execution-summary-text">{execution.summaryInput ?? execution.log}</p>
          <p
            className={cn(
              'aw-flow-node__execution-summary-text aw-flow-node__execution-summary-text--muted',
              isError && 'aw-flow-node__execution-summary-text--error',
            )}
          >
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
            <CopyTextButton text={executionRecord} label="复制全部" />
          </div>
          {timeline.length > 0 && (
            <div className="aw-flow-node__execution-section">
              <span className="aw-flow-node__execution-label">执行过程</span>
              <div className="aw-flow-node__timeline">
                {timeline.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      'aw-flow-node__timeline-item',
                      item.level === 'warning' && 'aw-flow-node__timeline-item--warning',
                      item.level === 'error' && 'aw-flow-node__timeline-item--error',
                      item.type === 'llm_token' && 'aw-flow-node__timeline-item--token',
                    )}
                  >
                    <span className="aw-flow-node__timeline-dot" />
                    <div className="aw-flow-node__timeline-body">
                      <div className="aw-flow-node__timeline-title-row">
                        <span className="aw-flow-node__timeline-title">{item.title}</span>
                        <span className="aw-flow-node__timeline-time">
                          {new Date(item.timestamp * 1000).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="aw-flow-node__timeline-message">{item.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {isError && execution.error && (
            <div className="aw-flow-node__execution-section">
              <ExecutionSectionHeader label="错误信息" text={execution.error} danger />
              <pre className="aw-flow-node__execution-code aw-flow-node__execution-code--error">{execution.error}</pre>
            </div>
          )}
          <div className="aw-flow-node__execution-section">
            <ExecutionSectionHeader label="输入" text={execution.input} />
            <pre className="aw-flow-node__execution-code">{execution.input}</pre>
          </div>
          {!isRunning && (
            <div className="aw-flow-node__execution-section">
              <ExecutionSectionHeader label="输出" text={execution.output} />
              <pre className="aw-flow-node__execution-code">{execution.output}</pre>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ExecutionSectionHeader({
  label,
  text,
  danger = false,
}: {
  label: string
  text: string
  danger?: boolean
}) {
  return (
    <div className="aw-flow-node__execution-section-header">
      <span className={cn('aw-flow-node__execution-label', danger && 'aw-flow-node__execution-label--error')}>
        {label}
      </span>
      <CopyTextButton text={text} />
    </div>
  )
}

function CopyTextButton({ text, label = '复制' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      className="aw-flow-node__copy-button"
      onClick={async (event) => {
        event.stopPropagation()
        await navigator.clipboard.writeText(text)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1200)
      }}
    >
      <Copy className="h-3 w-3" />
      {copied ? '已复制' : label}
    </button>
  )
}

function NodeMetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="aw-flow-node__io-row">
      <span className="aw-flow-node__io-label">{label}</span>
      <span className="aw-flow-node__io-empty">{value}</span>
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
