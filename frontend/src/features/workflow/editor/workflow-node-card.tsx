import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { ChevronDown, Copy, Home, MoreHorizontal, Play, Trash2 } from 'lucide-react'
import { SubCanvasRender } from '@flowgram.ai/free-container-plugin'
import {
  WorkflowPortRender,
  type WorkflowJSON,
  type WorkflowNodeProps,
} from '@flowgram.ai/free-layout-editor'
import { type WorkflowPortEntity, useNodeRender } from '@flowgram.ai/free-layout-core'

import {
  CANVAS_OFFSET_X,
  CANVAS_OFFSET_Y,
  nodeIcons,
  nodeThemeClass,
} from '@/features/workflow/editor/workflow-editor.config'
import { SELECTOR_ELSE_BRANCH } from '@/features/workflow/components/node-config/selector-utils'
import { useClickOutside } from '@/features/workflow/components/node-config/use-click-outside'
import {
  filterLoopEndpointNodes,
  getLoopBodyCanvasSize,
  getLoopNodeRenderSize,
  LOOP_CANVAS_ANCHOR_NODE_TYPE,
} from '@/features/workflow/editor/loop-node.utils'
import {
  isNodeExecutionPanelExpanded,
  setNodeExecutionPanelExpanded,
} from '@/features/workflow/editor/node-execution-panel-state'
import { getSelectorBranchPortInfos } from '@/features/workflow/editor/workflow-editor.utils'
import type { AddNodeOptions, FlowgramNodeData, TrialRunNodeExecution } from '@/features/workflow/editor/workflow-editor.types'
import { cn } from '@/lib/utils'
import { useWorkflowStore } from '@/store/workflow-store'
import type { WorkflowNode } from '@/types/workflow'

function WorkflowNodeRenderer({
  node,
  className,
  style,
  children,
  portClassName,
  portStyle,
  onPortClick,
  portPrimaryColor,
  portSecondaryColor,
  portErrorColor,
  portBackgroundColor,
  onManualDragStart,
}: WorkflowNodeProps & {
  onManualDragStart?: (event: ReactMouseEvent<HTMLDivElement>) => void
}) {
  const nodeJson = node.toJSON() as WorkflowJSON['nodes'][number]
  const nodeId = String(nodeJson.id)
  const isLoopNode = String(nodeJson.type) === 'loop'
  const isLoopEndpointNode = String(nodeJson.type) === 'loop-start' || String(nodeJson.type) === 'loop-end'
  const {
    selected,
    activated,
    startDrag,
    ports,
    selectNode,
    nodeRef,
    onFocus,
    onBlur,
  } = useNodeRender(node)

  const handleDragStart = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    if (isLoopEndpointNode) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (isLoopNode && isLoopChildDragTarget(event.target, nodeId)) {
      event.stopPropagation()
      return
    }
    event.stopPropagation()
    startDrag(event)
  }, [isLoopEndpointNode, isLoopNode, nodeId, startDrag])

  const handleMouseDownCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (isLoopNode && isLoopManualDragTarget(event.target)) {
      onManualDragStart?.(event)
      startDrag(event)
      event.preventDefault()
      event.stopPropagation()
    }
  }, [isLoopNode, onManualDragStart, startDrag])

  const handleClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.stopPropagation()
    selectNode(event)
  }, [selectNode])

  return (
    <>
      <div
        ref={nodeRef}
        className={cn(className, activated && 'activated', selected && 'selected')}
        style={style}
        draggable={!isLoopEndpointNode}
        onDragStart={handleDragStart}
        onMouseDownCapture={handleMouseDownCapture}
        onClick={handleClick}
        onFocus={onFocus}
        onBlur={onBlur}
        data-node-id={nodeId}
        data-node-selected={String(selected)}
        data-loop-endpoint={String(nodeJson.type === 'loop-start' || nodeJson.type === 'loop-end')}
      >
        {children}
        {isLoopNode && ports.map((port) => (
          <LoopBoundaryNativePortAnchor key={port.id} port={port} />
        ))}
      </div>
      {ports.map((port) => (
        <WorkflowPortRender
          key={port.id}
          entity={port}
          onClick={onPortClick ? (event) => onPortClick(port, event) : undefined}
          className={portClassName}
          style={portStyle}
          primaryColor={portPrimaryColor}
          secondaryColor={portSecondaryColor}
          errorColor={portErrorColor}
          backgroundColor={portBackgroundColor}
        />
      ))}
    </>
  )
}

function LoopBoundaryNativePortAnchor({ port }: { port: WorkflowPortEntity }) {
  const targetRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    port.updateTargetElement(targetRef.current ?? undefined)

    return () => {
      port.updateTargetElement(undefined)
    }
  }, [port])

  return (
    <span
      ref={targetRef}
      className={cn(
        'aw-flow-node__native-port-anchor',
        port.portType === 'input'
          ? 'aw-flow-node__native-port-anchor--input'
          : 'aw-flow-node__native-port-anchor--output',
      )}
      aria-hidden="true"
    />
  )
}

function isLoopChildDragTarget(target: EventTarget | null, loopNodeId: string) {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  if (!target.closest('.aw-loop-native-canvas__render')) {
    return false
  }
  const closestNodeId = target.closest('[data-node-id]')?.getAttribute('data-node-id')
  return Boolean(closestNodeId && closestNodeId !== loopNodeId)
}

function isLoopManualDragTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  if (
    target.closest(
      '.aw-loop-native-canvas, .aw-flow-node__actions, .aw-flow-node__execution, .aw-flow-port, button, input, textarea, select, [role="button"]',
    )
  ) {
    return false
  }
  return Boolean(target.closest('.aw-flow-node__inner'))
}

function getParentLoopNodeId(node: WorkflowNodeProps['node']) {
  const parent = (node as { parent?: WorkflowNodeProps['node'] }).parent
  const parentJson = parent?.toJSON?.() as WorkflowJSON['nodes'][number] | undefined
  if (!parentJson || String(parentJson.type ?? '') !== 'loop') {
    return ''
  }
  return String(parentJson.id ?? '')
}

function getPortPanelPosition(port: WorkflowPortEntity): AddNodeOptions['panelPosition'] {
  const point = port.point
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return undefined
  }

  return {
    x: Math.round(point.x + 84),
    y: Math.round(point.y - 28),
  }
}

function getRightSideNodePosition(
  nodeJson: WorkflowJSON['nodes'][number],
  renderSize: { width: number; height: number },
): AddNodeOptions['position'] {
  const meta = nodeJson.meta as { position?: { x?: number; y?: number } } | undefined
  const metaPosition = meta?.position
  if (!metaPosition || !Number.isFinite(metaPosition.x) || !Number.isFinite(metaPosition.y)) {
    return undefined
  }

  const sourceX = Math.max((metaPosition.x ?? CANVAS_OFFSET_X) - CANVAS_OFFSET_X, 0)
  const sourceY = Math.max((metaPosition.y ?? CANVAS_OFFSET_Y) - CANVAS_OFFSET_Y, 0)

  return {
    x: Math.round(sourceX + renderSize.width + 88),
    y: Math.round(sourceY + Math.max((renderSize.height - 154) / 2, 0)),
  }
}

function getSelectorPortPanelPosition(
  nodeJson: WorkflowJSON['nodes'][number],
  renderSize: { width: number; height: number },
  topPercent: number,
): AddNodeOptions['panelPosition'] {
  const meta = nodeJson.meta as { position?: { x?: number; y?: number } } | undefined
  const metaPosition = meta?.position
  if (!metaPosition || !Number.isFinite(metaPosition.x) || !Number.isFinite(metaPosition.y)) {
    return undefined
  }

  return {
    x: Math.round((metaPosition.x ?? CANVAS_OFFSET_X) + renderSize.width + 72),
    y: Math.round((metaPosition.y ?? CANVAS_OFFSET_Y) + (renderSize.height * topPercent) / 100 + 24),
  }
}

function getSelectorPortNodePosition(
  nodeJson: WorkflowJSON['nodes'][number],
  renderSize: { width: number; height: number },
  topPercent: number,
): AddNodeOptions['position'] {
  const meta = nodeJson.meta as { position?: { x?: number; y?: number } } | undefined
  const metaPosition = meta?.position
  if (!metaPosition || !Number.isFinite(metaPosition.x) || !Number.isFinite(metaPosition.y)) {
    return undefined
  }

  const sourceX = Math.max((metaPosition.x ?? CANVAS_OFFSET_X) - CANVAS_OFFSET_X, 0)
  const sourceY = Math.max((metaPosition.y ?? CANVAS_OFFSET_Y) - CANVAS_OFFSET_Y, 0)

  return {
    x: Math.round(sourceX + renderSize.width + 88),
    y: Math.max(Math.round(sourceY + (renderSize.height * topPercent) / 100 - 77), 0),
  }
}

export function FlowgramNodeCard({
  node,
  onSelectNode,
  selectedNodeId,
  onToggleQuickAdd,
  trialRunExecution,
  autoExpandExecutionDetails = false,
  onRunNode,
  onCopyNode,
  onDeleteNode,
  onAddLoopChild,
  nodeActionRunning = false,
}: {
  node: WorkflowNodeProps['node']
  onSelectNode: (nodeId: string) => void
  selectedNodeId: string
  onToggleQuickAdd: (
    nodeId: string,
    sourcePortID?: string | number,
    panelPosition?: AddNodeOptions['panelPosition'],
    position?: AddNodeOptions['position'],
  ) => void
  trialRunExecution?: TrialRunNodeExecution
  autoExpandExecutionDetails?: boolean
  onRunNode: (nodeId: string) => void
  onCopyNode: (nodeId: string) => void
  onDeleteNode: (nodeId: string) => void
  onAddLoopChild: (loopNodeId: string) => void
  nodeActionRunning?: boolean
}) {
  const nodeJson = node.toJSON() as WorkflowJSON['nodes'][number] & { data?: FlowgramNodeData }
  const data = nodeJson.data
  const effectiveExecution = trialRunExecution ?? data?.trialRunExecution
  const kind = String(data?.kind ?? nodeJson.type) as WorkflowNode['type'] | typeof LOOP_CANVAS_ANCHOR_NODE_TYPE
  const nodeId = String(nodeJson.id)

  const setSelectedNodeId = useWorkflowStore((state) => state.setSelectedNodeId)
  const [menuOpen, setMenuOpen] = useState(false)
  const actionsRef = useRef<HTMLDivElement>(null)
  const Icon = kind === LOOP_CANVAS_ANCHOR_NODE_TYPE ? Home : nodeIcons[kind]
  const isSelected = selectedNodeId === nodeId
  const isLoopEndpoint = kind === 'loop-start' || kind === 'loop-end'
  const inputItems: WorkflowNode['inputs'] = data?.inputs ?? []
  const outputItems: WorkflowNode['outputs'] = data?.outputs ?? []
  const canDeleteOrCopy = kind !== 'start' && !isLoopEndpoint
  const canRunNode = !isLoopEndpoint
  const canAddFromOutputPort = kind !== 'selector' && kind !== 'end' && kind !== 'loop-end'
  const isNodeRunning = nodeActionRunning || effectiveExecution?.status === 'running'
  const loopCanvasSize = kind === 'loop'
    ? getLoopBodyCanvasSize(data?.config ?? {}, data?.config.loopBodyNodes ?? [])
    : undefined
  const selectorBranchCount = data?.config.selectorBranches?.length ?? 1
  const selectorOutputCount = selectorBranchCount + 1
  const nodeMinHeight = kind === 'selector'
    ? Math.max(146, 104 + selectorOutputCount * 34)
    : isLoopEndpoint
        ? 74
      : undefined
  const loopNodeSize = loopCanvasSize ? getLoopNodeRenderSize(loopCanvasSize) : undefined
  const nodeWidth = isLoopEndpoint ? 156 : loopNodeSize?.width
  const nodeRenderSize = {
    width: nodeWidth ?? 320,
    height: loopNodeSize?.height ?? Math.max(nodeMinHeight ?? 154, 154),
  }
  const closeMenu = useCallback(() => setMenuOpen(false), [setMenuOpen])
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
  const handleNodeBodyMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (isLoopEndpoint) {
      event.stopPropagation()
    }
    if (
      kind === 'loop'
      && (event.target as HTMLElement | null)?.closest('.aw-loop-native-canvas__viewport, .aw-loop-canvas__viewport, .aw-loop-detached')
    ) {
      return
    }
    setSelectedNodeId(nodeId)
    onSelectNode(nodeId)
  }, [isLoopEndpoint, kind, nodeId, onSelectNode, setSelectedNodeId])

  if (kind === LOOP_CANVAS_ANCHOR_NODE_TYPE) {
    const loopNodeId = getParentLoopNodeId(node)
    return (
      <WorkflowNodeRenderer
        node={node}
        className="aw-loop-home-node"
        portClassName="aw-flow-port aw-flow-port--loop-home"
        portPrimaryColor="#7aa2ff"
        portSecondaryColor="#273249"
        portBackgroundColor="#0b1120"
      >
        <button
          type="button"
          className="aw-loop-home-node__button aw-flow-ignore-deselect"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            if (loopNodeId) {
              onAddLoopChild(loopNodeId)
            }
          }}
          aria-label="添加循环体节点"
          title="添加循环体节点"
        >
          <Home className="h-4 w-4" />
        </button>
      </WorkflowNodeRenderer>
    )
  }

  return (
    <WorkflowNodeRenderer
      node={node}
      className={cn(
        'aw-flow-node',
        nodeThemeClass[kind],
        isSelected && 'aw-flow-node--external-selected',
      )}
      style={{
        ...(nodeMinHeight ? { minHeight: nodeMinHeight } : {}),
        ...(loopNodeSize ? { height: loopNodeSize.height } : {}),
        ...(nodeWidth ? { width: nodeWidth } : {}),
      }}
      portClassName={cn('aw-flow-port', kind === 'loop' && 'aw-flow-port--loop-boundary')}
      portPrimaryColor="#7aa2ff"
      portSecondaryColor="#273249"
      portBackgroundColor="#0b1120"
      onManualDragStart={kind === 'loop' ? handleNodeBodyMouseDown : undefined}
      onPortClick={(port: WorkflowPortEntity, event) => {
        if ('stopPropagation' in event) {
          event.stopPropagation()
        }
        if (port.portType === 'output' && canAddFromOutputPort) {
          onToggleQuickAdd(
            nodeId,
            port.portID || undefined,
            getPortPanelPosition(port),
            getParentLoopNodeId(node) ? undefined : getRightSideNodePosition(nodeJson, nodeRenderSize),
          )
          return
        }
      }}
    >
      <div
        className="aw-flow-node__inner"
        draggable={kind === 'loop'}
        onMouseDown={handleNodeBodyMouseDown}
      >
        {isLoopEndpoint ? (
          <LoopEndpointContent kind={kind} title={data?.title ?? ''} description={data?.description ?? ''} Icon={Icon} />
        ) : (
          <>
            <div className="aw-flow-node__header" draggable={kind === 'loop'}>
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
            <div className="aw-flow-node__title" draggable={kind === 'loop'}>{data?.title}</div>
            <div className="aw-flow-node__description" draggable={kind === 'loop'}>{data?.description}</div>
            <div className="aw-flow-node__io">
              {kind === 'selector' ? (
                <SelectorBranchRows data={data} />
              ) : kind === 'loop' ? (
                <LoopNativeSubCanvas
                  data={data}
                />
              ) : (
                <>
                  <NodeIoRow label="输入" items={inputItems} />
                  <NodeIoRow label="输出" items={outputItems} />
                </>
              )}
              {kind === 'llm' && <NodeMetaRow label="模型" value={data?.config.model || '默认模型'} />}
            </div>
          </>
        )}
      </div>
      {canRunNode && (
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
      )}
      {kind === 'selector' && (
        <SelectorPortActions
          data={data}
          onAddFromPort={(sourcePortID, topPercent) => onToggleQuickAdd(
            nodeId,
            sourcePortID,
            getSelectorPortPanelPosition(nodeJson, nodeRenderSize, topPercent),
            getSelectorPortNodePosition(nodeJson, nodeRenderSize, topPercent),
          )}
        />
      )}
      {effectiveExecution && !isLoopEndpoint && (
        <NodeExecutionPanel
          execution={effectiveExecution}
          autoExpand={autoExpandExecutionDetails}
        />
      )}
    </WorkflowNodeRenderer>
  )
}

function LoopNativeSubCanvas({
  data,
}: {
  data?: FlowgramNodeData
}) {
  const canvasSize = getLoopBodyCanvasSize(data?.config ?? {}, data?.config.loopBodyNodes ?? [])
  const viewportWidth = canvasSize.width
  const viewportHeight = canvasSize.height
  const bodyNodes = filterLoopEndpointNodes(data?.config.loopBodyNodes ?? [])
  const bodyNodeCount = bodyNodes.length

  return (
    <div
      className={cn(
        'aw-loop-native-canvas aw-flow-ignore-deselect',
        bodyNodeCount === 0 && 'aw-loop-native-canvas--empty',
      )}
      draggable
      style={{
        ['--aw-loop-native-viewport-width' as string]: `${viewportWidth}px`,
        ['--aw-loop-native-viewport-height' as string]: `${viewportHeight}px`,
      }}
    >
      <span className="aw-loop-native-canvas__drag-handle aw-loop-native-canvas__drag-handle--top" draggable aria-hidden="true" />
      <span className="aw-loop-native-canvas__drag-handle aw-loop-native-canvas__drag-handle--right" draggable aria-hidden="true" />
      <span className="aw-loop-native-canvas__drag-handle aw-loop-native-canvas__drag-handle--bottom" draggable aria-hidden="true" />
      <span className="aw-loop-native-canvas__drag-handle aw-loop-native-canvas__drag-handle--left" draggable aria-hidden="true" />
      <div className="aw-loop-native-canvas__meta">
        <span className="aw-loop-native-canvas__meta-title">循环体子图</span>
        <span className="aw-loop-native-canvas__meta-divider" />
        <strong>{data?.config.loopMode === 'count' ? '指定次数' : '数组循环'}</strong>
        <span className="aw-loop-native-canvas__meta-count">{bodyNodeCount} 个节点</span>
      </div>
      <div className="aw-loop-native-canvas__scroll-hint">靠近边缘自动扩展</div>
      <div className="aw-loop-native-canvas__viewport">
        {bodyNodeCount === 0 && (
          <div className="aw-loop-native-canvas__empty">
            <div className="aw-loop-native-canvas__empty-icon">+</div>
            <div className="aw-loop-native-canvas__empty-title">添加第一个循环体节点</div>
            <div className="aw-loop-native-canvas__empty-text">点击左上角入口节点开始编排，循环体会使用原生子图连线并随内容自动扩展。</div>
          </div>
        )}
        <SubCanvasRender
          className="aw-loop-native-canvas__render"
          offsetY={0}
          style={{
            width: canvasSize.width,
            height: canvasSize.height,
          }}
          tipText="循环体内部使用 FlowGram 原生连线：可拖拽重连、选中删除、在线中点添加节点。"
        />
      </div>
    </div>
  )
}

function LoopEndpointContent({
  kind,
  title,
  description,
  Icon,
}: {
  kind: 'loop-start' | 'loop-end'
  title: string
  description: string
  Icon: ComponentType<{ className?: string }>
}) {
  return (
    <div className="aw-flow-node__loop-endpoint">
      <div className="aw-flow-node__loop-endpoint-icon">
        <Icon className="h-4 w-4" />
      </div>
      <div className="aw-flow-node__loop-endpoint-body">
        <div className="aw-flow-node__loop-endpoint-title">{title}</div>
        <div className="aw-flow-node__loop-endpoint-text">
          {kind === 'loop-start' ? '从这里连出循环体' : '连接到这里结束本轮'}
        </div>
      </div>
      <span className="aw-flow-node__loop-endpoint-hint">{description}</span>
    </div>
  )
}

function NodeExecutionPanel({
  execution,
  autoExpand,
}: {
  execution: TrialRunNodeExecution
  autoExpand: boolean
}) {
  const [expanded, setExpanded] = useState(
    () => isNodeExecutionPanelExpanded(execution.nodeId),
  )
  const isExpanded = expanded || (autoExpand && execution.status === 'running')
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
  const tokenUsage = execution.tokenUsage
  const tokenUsageLabel = tokenUsage ? formatTokenUsage(tokenUsage) : ''
  const executionRecord = [
    `状态：${statusLabel}`,
    tokenUsageLabel ? `Token：${tokenUsageLabel}` : '',
    `日志：${execution.log}`,
    execution.error ? `错误：${execution.error}` : '',
    timeline.length > 0
      ? `执行过程：\n${timeline.map((item) => `[${item.title}] ${item.message}`).join('\n')}`
      : '',
    `输入：\n${execution.input}`,
    !isRunning ? `输出：\n${execution.output}` : '',
  ].filter(Boolean).join('\n\n')

  const updateExpanded = useCallback((nextExpanded: boolean) => {
    setNodeExecutionPanelExpanded(execution.nodeId, nextExpanded)
    setExpanded(nextExpanded)
  }, [execution.nodeId])

  return (
    <div
      className="aw-flow-node__execution aw-flow-ignore-deselect"
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => {
          updateExpanded(!isExpanded)
        }}
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
          {tokenUsage && (
            <span className="rounded-lg border border-cyan-300/60 bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-700 shadow-sm">
              Token {tokenUsage.totalTokens}
            </span>
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
          className={cn('h-4 w-4 text-slate-500 transition-transform', isExpanded && 'rotate-180')}
        />
      </button>
      {isExpanded && (
        <>
          <div className="aw-flow-node__execution-header">
            <p className="aw-flow-node__execution-log">{execution.log}</p>
            <CopyTextButton text={executionRecord} label="复制全部" />
          </div>
          {tokenUsage && (
            <div className="aw-flow-node__execution-section">
              <span className="aw-flow-node__execution-label">Token 用量</span>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <TokenUsageStat label="总量" value={tokenUsage.totalTokens} />
                <TokenUsageStat label="输入" value={tokenUsage.inputTokens} />
                <TokenUsageStat label="输出" value={tokenUsage.outputTokens} />
              </div>
            </div>
          )}
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

function TokenUsageStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 shadow-sm">
      <p className="text-[10px] font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-900">{value}</p>
    </div>
  )
}

function formatTokenUsage(usage: NonNullable<TrialRunNodeExecution['tokenUsage']>) {
  return `总量 ${usage.totalTokens}，输入 ${usage.inputTokens}，输出 ${usage.outputTokens}`
}

function NodeMetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="aw-flow-node__io-row">
      <span className="aw-flow-node__io-label">{label}</span>
      <span className="aw-flow-node__io-empty">{value}</span>
    </div>
  )
}

function SelectorBranchRows({ data }: { data?: FlowgramNodeData }) {
  const branches = data?.config.selectorBranches ?? []

  return (
    <div className="aw-flow-selector-branch-list">
      {branches.length > 0 ? (
        branches.map((branch, index) => (
          <div key={branch.id} className="aw-flow-selector-branch-row">
            <span className="aw-flow-selector-branch-index">条件{index + 1}</span>
            <span className="aw-flow-selector-branch-value">{Math.max(branch.conditions.length, 1)} 个条件</span>
          </div>
        ))
      ) : (
        <div className="aw-flow-selector-branch-row">
          <span className="aw-flow-selector-branch-index">条件1</span>
          <span className="aw-flow-selector-branch-value">未配置</span>
        </div>
      )}
      <div className="aw-flow-selector-branch-row aw-flow-selector-branch-row--else">
        <span className="aw-flow-selector-branch-index">否则</span>
        <span className="aw-flow-selector-branch-value">{data?.config.selectorElseBranch || SELECTOR_ELSE_BRANCH}</span>
      </div>
    </div>
  )
}

function SelectorPortActions({
  data,
  onAddFromPort,
}: {
  data?: FlowgramNodeData
  onAddFromPort: (sourcePortID: string | number, topPercent: number) => void
}) {
  const branchCount = data?.config.selectorBranches?.length ?? 1
  const ports = getSelectorBranchPortInfos(branchCount)

  return (
    <div className="aw-flow-selector-ports aw-flow-ignore-deselect" onMouseDown={(event) => event.stopPropagation()}>
      {ports.map((port) => (
        <button
          key={port.portID}
          type="button"
          className={cn(
            'aw-flow-selector-port-action',
            port.kind === 'else' && 'aw-flow-selector-port-action--else',
          )}
          style={{ top: `${port.topPercent}%` }}
          onClick={(event) => {
            event.stopPropagation()
            onAddFromPort(port.portID, port.topPercent)
          }}
          aria-label={`从${port.label}添加后续节点`}
          title={`从${port.label}添加后续节点`}
        >
          <span className="aw-flow-selector-port-action__label">{port.label}</span>
          <span className="aw-flow-selector-port-action__plus">+</span>
        </button>
      ))}
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
