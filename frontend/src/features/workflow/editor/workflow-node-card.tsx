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
import {
  getNodeTrialRunExecution,
  setSelectedLoopIteration,
  useSelectedLoopIteration,
  useNodeTrialRunExecution,
  useTrialRunExecutionVersion,
} from '@/features/workflow/editor/node-trial-run-store'
import {
  getEndNodeDisplay,
  LOOP_BODY_END_NODE_DISPLAY,
} from '@/features/workflow/node-display'
import { getLoopExecutionIterations } from '@/features/workflow/editor/runtime-execution-adapter'
import { getSelectorBranchPortInfos } from '@/features/workflow/editor/workflow-editor.utils'
import type {
  AddNodeOptions,
  FlowgramNodeData,
  TrialRunLoopIterationExecution,
  TrialRunNodeExecution,
} from '@/features/workflow/editor/workflow-editor.types'
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
  const kind = String(data?.kind ?? nodeJson.type) as WorkflowNode['type'] | typeof LOOP_CANVAS_ANCHOR_NODE_TYPE
  const nodeId = String(nodeJson.id)
  const parentLoopNodeId = getParentLoopNodeId(node) || undefined
  const subscribedExecution = useNodeTrialRunExecution(nodeId, parentLoopNodeId)
  const effectiveExecution = subscribedExecution ?? trialRunExecution ?? data?.trialRunExecution
  const isLoopBodyEndNode = kind === 'end' && Boolean(parentLoopNodeId)

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
  const loopEndpointDisplay = kind === 'loop-end' ? LOOP_BODY_END_NODE_DISPLAY : undefined
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
  const nodeDisplay = isLoopBodyEndNode ? getEndNodeDisplay(true) : undefined
  const nodeTitle = nodeDisplay?.title ?? data?.title
  const nodeDescription = nodeDisplay?.description ?? data?.description
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
          <LoopEndpointContent
            kind={kind}
            title={loopEndpointDisplay?.title ?? data?.title ?? ''}
            description={loopEndpointDisplay?.description ?? data?.description ?? ''}
            Icon={Icon}
          />
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
            <div className="aw-flow-node__title" draggable={kind === 'loop'}>{nodeTitle}</div>
            <div className="aw-flow-node__description" draggable={kind === 'loop'}>{nodeDescription}</div>
            <div className="aw-flow-node__io">
              {kind === 'selector' ? (
                <SelectorBranchRows data={data} />
              ) : kind === 'loop' ? (
                <LoopNativeSubCanvas
                  data={data}
                  loopNodeId={nodeId}
                />
              ) : (
                <>
                  <NodeIoRow label="输入" items={inputItems} />
                  <NodeIoRow label="输出" items={outputItems} />
                </>
              )}
              {kind === 'llm' && <NodeMetaRow label="模型" value={data?.config.model || '默认模型'} />}
              {kind === 'code' && (
                <CodeNodeSummary data={data} />
              )}
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
  loopNodeId,
}: {
  data?: FlowgramNodeData
  loopNodeId: string
}) {
  useTrialRunExecutionVersion()
  const canvasSize = getLoopBodyCanvasSize(data?.config ?? {}, data?.config.loopBodyNodes ?? [])
  const viewportWidth = canvasSize.width
  const viewportHeight = canvasSize.height
  const bodyNodes = filterLoopEndpointNodes(data?.config.loopBodyNodes ?? [])
  const bodyNodeCount = bodyNodes.length
  const bodyExecutions = bodyNodes
    .map((node) => ({ node, execution: getNodeTrialRunExecution({ nodeId: node.id, loopNodeId }) }))
    .filter((item): item is { node: WorkflowNode; execution: TrialRunNodeExecution } => Boolean(item.execution))

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
        {bodyExecutions.length > 0 && (
          <div
            className="aw-loop-native-canvas__execution-layer aw-flow-ignore-deselect"
            style={{
              width: canvasSize.width,
              height: canvasSize.height,
            }}
          >
            {bodyExecutions.map(({ node, execution }) => (
              <div
                key={node.id}
                className="aw-loop-native-canvas__execution-panel"
                style={getLoopBodyExecutionPanelStyle(node)}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <NodeExecutionPanel execution={execution} autoExpand={false} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function getLoopBodyExecutionPanelStyle(node: WorkflowNode) {
  const nodeHeight = getEstimatedLoopBodyNodeHeight(node)
  return {
    left: Math.max(Math.round(node.position.x), 0),
    top: Math.max(Math.round(node.position.y + nodeHeight + 8), 0),
    width: 320,
  }
}

function getEstimatedLoopBodyNodeHeight(node: WorkflowNode) {
  if (node.type === 'selector') {
    const branchCount = Math.max(node.config.selectorBranches?.length ?? 1, 1)
    return Math.max(154, 104 + (branchCount + 1) * 34)
  }
  if (node.type === 'loop-start' || node.type === 'loop-end') {
    return 74
  }
  return 154
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
  const loopIterations = getLoopExecutionIterations(execution)
  const selectedIterationIndex = useSelectedLoopIteration(execution.nodeId, execution.loopNodeId)
  const activeIterationIndex = selectedIterationIndex
    ?? execution.latestIterationIndex
    ?? loopIterations.at(-1)?.iterationIndex
    ?? 0
  const selectedIteration = loopIterations.find((item) => item.iterationIndex === activeIterationIndex)
    ?? loopIterations.at(-1)
  const displayExecution = selectedIteration
    ? loopIterationToNodeExecutionViewModel(selectedIteration, execution)
    : execution
  const isExpanded = expanded || (autoExpand && execution.status === 'running')
  const statusLabel =
    displayExecution.status === 'running'
      ? '运行中'
      : displayExecution.status === 'error'
        ? '运行失败'
        : displayExecution.degraded
          ? '降级完成'
          : '运行完成'
  const isRunning = displayExecution.status === 'running'
  const isError = displayExecution.status === 'error'
  const timeline = displayExecution.timeline ?? []
  const tokenUsage = displayExecution.tokenUsage
  const tokenUsageLabel = tokenUsage ? formatTokenUsage(tokenUsage) : ''
  const executionRecord = [
    `状态：${statusLabel}`,
    tokenUsageLabel ? `Token：${tokenUsageLabel}` : '',
    loopIterations.length > 0 && selectedIteration ? `轮次：第 ${selectedIteration.iterationIndex + 1} 轮` : '',
    `日志：${displayExecution.log}`,
    displayExecution.error ? `错误：${displayExecution.error}` : '',
    timeline.length > 0
      ? `执行过程：\n${timeline.map((item) => `[${item.title}] ${item.message}`).join('\n')}`
      : '',
    `输入：\n${displayExecution.input}`,
    !isRunning ? `输出：\n${displayExecution.output}` : '',
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
              displayExecution.degraded && !isError && 'aw-flow-node__execution-state--warning',
            )}
          >
            {statusLabel}
          </span>
          {!isRunning && (
            <span className="aw-flow-node__execution-duration">{(displayExecution.durationMs / 1000).toFixed(3)}s</span>
          )}
          {tokenUsage && (
            <span className="rounded-lg border border-cyan-300/60 bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-700 shadow-sm">
              Token {tokenUsage.totalTokens}
            </span>
          )}
        </div>
        <div className="aw-flow-node__execution-summary-content">
          <p className="aw-flow-node__execution-summary-text">{displayExecution.summaryInput ?? displayExecution.log}</p>
          <p
            className={cn(
              'aw-flow-node__execution-summary-text aw-flow-node__execution-summary-text--muted',
              isError && 'aw-flow-node__execution-summary-text--error',
            )}
          >
            {displayExecution.summaryOutput ?? '点击查看详细执行记录'}
          </p>
        </div>
        <ChevronDown
          className={cn('h-4 w-4 text-slate-500 transition-transform', isExpanded && 'rotate-180')}
        />
      </button>
      {isExpanded && (
        <>
          <div className="aw-flow-node__execution-header">
            <p className="aw-flow-node__execution-log">{displayExecution.log}</p>
            <CopyTextButton text={executionRecord} label="复制全部" />
          </div>
          {loopIterations.length > 0 && (
            <LoopIterationTabs
              iterations={loopIterations}
              selectedIterationIndex={selectedIteration?.iterationIndex ?? activeIterationIndex}
              onSelect={(iterationIndex) => setSelectedLoopIteration({
                nodeId: execution.nodeId,
                loopNodeId: execution.loopNodeId,
              }, iterationIndex)}
            />
          )}
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
          {isError && displayExecution.error && (
            <div className="aw-flow-node__execution-section">
              <ExecutionSectionHeader label="错误信息" text={displayExecution.error} danger />
              <pre className="aw-flow-node__execution-code aw-flow-node__execution-code--error">{displayExecution.error}</pre>
            </div>
          )}
          <div className="aw-flow-node__execution-section">
            <ExecutionSectionHeader label={selectedIteration ? `第 ${selectedIteration.iterationIndex + 1} 轮输入` : '输入'} text={displayExecution.input} />
            <pre className="aw-flow-node__execution-code">{displayExecution.input}</pre>
          </div>
          {!isRunning && (
            <div className="aw-flow-node__execution-section">
              <ExecutionSectionHeader label={selectedIteration ? `第 ${selectedIteration.iterationIndex + 1} 轮输出` : '输出'} text={displayExecution.output} />
              <pre className="aw-flow-node__execution-code">{displayExecution.output}</pre>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function loopIterationToNodeExecutionViewModel(
  iteration: TrialRunLoopIterationExecution,
  base: TrialRunNodeExecution,
): TrialRunNodeExecution {
  return {
    nodeId: iteration.nodeId,
    nodeTitle: iteration.nodeTitle,
    log: iteration.log,
    input: iteration.input,
    output: iteration.output,
    durationMs: iteration.durationMs,
    status: iteration.status,
    error: iteration.error,
    degraded: iteration.degraded,
    tokenUsage: iteration.tokenUsage,
    timeline: iteration.timeline,
    summaryInput: iteration.summaryInput,
    summaryOutput: iteration.summaryOutput,
    loopNodeId: base.loopNodeId,
    latestIterationIndex: base.latestIterationIndex,
    iterationsByIndex: base.iterationsByIndex,
    iterationOrder: base.iterationOrder,
    loopIterations: base.loopIterations,
  }
}

function LoopIterationTabs({
  iterations,
  selectedIterationIndex,
  onSelect,
}: {
  iterations: TrialRunLoopIterationExecution[]
  selectedIterationIndex: number
  onSelect: (iterationIndex: number) => void
}) {
  const selectedIteration = iterations.find((iteration) => iteration.iterationIndex === selectedIterationIndex)
    ?? iterations.at(-1)
  return (
    <div className="aw-flow-node__loop-iterations">
      <div className="aw-flow-node__loop-iterations-head">
        <span>循环轮次</span>
        <strong>{iterations.length} 轮记录</strong>
      </div>
      <div className="aw-flow-node__loop-iteration-select-wrap">
        <select
          className={cn(
            'aw-flow-node__loop-iteration-select',
            selectedIteration?.status === 'error' && 'aw-flow-node__loop-iteration-select--error',
            selectedIteration?.status === 'running' && 'aw-flow-node__loop-iteration-select--running',
          )}
          value={selectedIteration?.iterationIndex ?? selectedIterationIndex}
          onChange={(event) => onSelect(Number(event.target.value))}
        >
          {iterations.map((iteration) => (
            <option key={iteration.iterationIndex} value={iteration.iterationIndex}>
              {`第 ${iteration.iterationIndex + 1} 轮 · ${iteration.status === 'running' ? '运行中' : iteration.status === 'error' ? '失败' : '完成'}`}
            </option>
          ))}
        </select>
        <ChevronDown className="aw-flow-node__loop-iteration-select-icon" />
      </div>
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

function formatCodeLanguage(language?: string) {
  if (language === 'python' || !language) {
    return 'Python'
  }
  return language
}

function formatCodeSyncStatus(status?: string) {
  if (status === 'dirty') {
    return '待同步'
  }
  if (status === 'saving') {
    return '同步中'
  }
  if (status === 'failed') {
    return '同步失败'
  }
  return '已同步'
}

function formatCodeModeLabel(source?: WorkflowNode['config']['codeSource']) {
  if (source === 'sandbox_snippet') {
    return '脚本片段'
  }
  return '沙箱文件'
}

function formatCodeCapabilityLabel(capability?: WorkflowNode['config']['codeCapability']) {
  if (capability === 'browser') {
    return '浏览器操作'
  }
  return 'Python'
}

function formatCodeModeDescription(source?: WorkflowNode['config']['codeSource'], capability?: WorkflowNode['config']['codeCapability']) {
  if (capability === 'browser') {
    return '连接 AioSandbox 浏览器/CDP，并可通过 VNC 预览'
  }
  if (source === 'sandbox_snippet') {
    return '随节点保存，运行时发送到绑定沙箱'
  }
  return '在沙箱 Code 工作区维护独立文件'
}

function formatCodeEntryName(path?: string) {
  const normalizedPath = path?.trim()
  if (!normalizedPath) {
    return 'main.py'
  }
  return normalizedPath.split('/').filter(Boolean).pop() || normalizedPath
}

function CodeNodeSummary({ data }: { data?: FlowgramNodeData }) {
  const isBrowser = data?.config.codeCapability === 'browser'
  const isSnippet = !isBrowser && data?.config.codeSource === 'sandbox_snippet'
  const entryLabel = isSnippet
    ? `${(data?.config.prompt ?? '').length} 字符`
    : formatCodeEntryName(data?.config.codeFilePath)

  return (
    <div className="aw-flow-code-summary">
      <div className="aw-flow-code-summary__badges">
        <span className="aw-flow-code-summary__badge aw-flow-code-summary__badge--mode">
          {formatCodeCapabilityLabel(data?.config.codeCapability)}
        </span>
        <span className="aw-flow-code-summary__badge">{formatCodeModeLabel(isBrowser ? 'sandbox_file' : data?.config.codeSource)}</span>
        <span className="aw-flow-code-summary__badge">{formatCodeLanguage(data?.config.codeLanguage)}</span>
        <span className="aw-flow-code-summary__badge aw-flow-code-summary__badge--sync">
          {formatCodeSyncStatus(data?.config.codeSyncStatus)}
        </span>
      </div>
      <div className="aw-flow-code-summary__entry">
        <span className="aw-flow-code-summary__entry-label">{isSnippet ? '代码' : '入口'}</span>
        <span className="aw-flow-code-summary__entry-value">{entryLabel}</span>
      </div>
      <p className="aw-flow-code-summary__hint">{formatCodeModeDescription(data?.config.codeSource, data?.config.codeCapability)}</p>
    </div>
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
