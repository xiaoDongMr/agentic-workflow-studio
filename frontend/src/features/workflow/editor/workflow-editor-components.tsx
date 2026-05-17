import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { ChevronDown, LayoutGrid, Minus, Play, Plus, Redo2, Scan, Search, Undo2, X } from 'lucide-react'
import { useClientContext, usePlaygroundTools } from '@flowgram.ai/free-layout-editor'
import type { NodePanelRenderProps } from '@flowgram.ai/free-node-panel-plugin'

import {
  bottomLibrarySections,
  paletteToNodeType,
} from '@/features/workflow/editor/workflow-editor.config'
import { cn } from '@/lib/utils'

export function FlowgramNodePanel({
  position,
  panelProps,
  onSelect,
  onClose,
}: NodePanelRenderProps) {
  const [keyword, setKeyword] = useState('')
  const sourceTitle = typeof panelProps?.sourceTitle === 'string' ? panelProps.sourceTitle : ''

  const filteredSections = useMemo(
    () =>
      bottomLibrarySections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => item.title.toLowerCase().includes(keyword.toLowerCase())),
        }))
        .filter((section) => section.items.length > 0),
    [keyword],
  )

  return (
    <div
      className="aw-flow-ignore-deselect absolute z-40"
      style={{
        left: position.x + 16,
        top: position.y - 36,
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <section className="w-[320px] rounded-[22px] border border-white/10 bg-slate-950/96 p-3 shadow-[0_24px_56px_rgba(2,6,23,0.42)] backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">添加节点</p>
            <p className="mt-1 text-[11px] text-slate-400">
              {sourceTitle ? `从“${sourceTitle}”后继续扩展流程` : '选择一个节点类型加入当前画布'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="关闭节点面板"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-[14px] border border-white/8 bg-white/[0.04] px-3 py-2">
          <Search className="h-3 w-3 text-slate-500" />
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索节点、插件、工作流"
            className="w-full bg-transparent text-[11px] text-slate-100 outline-none placeholder:text-slate-500"
          />
        </div>

        <div className="mt-3 max-h-[320px] space-y-4 overflow-y-auto pr-1">
          {filteredSections.map((section) => (
            <div key={section.title}>
              <p className="mb-2 text-xs font-semibold tracking-[0.08em] text-slate-500">{section.title}</p>
              <div className="grid gap-2">
                {section.items.map((item) => {
                  const Icon = item.icon
                  const nodeType = paletteToNodeType[item.nodeKey]

                  return (
                    <button
                      key={`${section.title}-${item.title}`}
                      type="button"
                      onClick={(event: ReactMouseEvent<HTMLButtonElement>) =>
                        onSelect({
                          nodeType,
                          selectEvent: event,
                        })
                      }
                      className="flex items-center gap-2 rounded-[16px] border border-white/6 bg-white/[0.03] px-2.5 py-2 text-left transition-colors hover:border-blue-400/20 hover:bg-blue-500/[0.07]"
                    >
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-cyan-500/16 text-cyan-200">
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-xs font-medium text-slate-100">{item.title}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          {filteredSections.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/50 px-3 py-4 text-center text-xs text-slate-500">
              没有匹配的节点类型
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

export function EditorTrialRunPanel({
  open,
  fields,
  running,
  jsonMode,
  combinedJson,
  jsonError,
  onFieldChange,
  onCombinedJsonChange,
  onToggleJsonMode,
  onClose,
  onRun,
}: {
  open: boolean
  fields: Array<{
    name: string
    type: 'json' | 'string'
    value: string
  }>
  running: boolean
  jsonMode: boolean
  combinedJson: string
  jsonError?: string
  onFieldChange: (fieldName: string, value: string) => void
  onCombinedJsonChange: (value: string) => void
  onToggleJsonMode: () => void
  onClose: () => void
  onRun: () => void
}) {
  if (!open) {
    return null
  }

  return (
    <div className="aw-flow-ignore-deselect pointer-events-none absolute bottom-[88px] right-4 z-30 flex justify-end">
      <section className="pointer-events-auto w-[640px] max-w-[calc(100vw-520px)] rounded-[24px] border border-white/10 bg-slate-950/94 p-4 shadow-[0_24px_56px_rgba(2,6,23,0.48)] backdrop-blur">
        <div className="flex items-start justify-between gap-4 border-b border-white/8 pb-4">
          <div>
            <p className="text-sm font-semibold text-white">全局调试</p>
            <p className="mt-1 text-xs text-slate-400">配置调试入参后运行工作流，节点默认只展示执行摘要，点击摘要可查看详细记录。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="关闭全局调试面板"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 rounded-[20px] border border-white/8 bg-white/[0.03]">
          <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">全局调试输入</p>
              <p className="mt-1 text-xs text-slate-400">按字段编辑调试入参，JSON 字段运行前会校验结构。</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-300">JSON模式</span>
              <button
                type="button"
                onClick={onToggleJsonMode}
                className={cn(
                  'relative inline-flex h-7 w-12 items-center rounded-full transition-colors',
                  jsonMode ? 'bg-violet-500/70' : 'bg-white/10',
                )}
                aria-label="切换 JSON 模式"
              >
                <span
                  className={cn(
                    'inline-block h-5 w-5 rounded-full bg-white transition-transform',
                    jsonMode ? 'translate-x-6' : 'translate-x-1',
                  )}
                />
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-100 transition-colors hover:bg-violet-500/16"
              >
                AI 补全
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="space-y-4 px-4 py-4">
            {jsonMode ? (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-200">JSON</span>
                  <span className="rounded-md border border-white/8 bg-white/5 px-2 py-0.5 text-[11px] text-slate-400">
                    Object
                  </span>
                </div>
                <textarea
                  value={combinedJson}
                  onChange={(event) => onCombinedJsonChange(event.target.value)}
                  spellCheck={false}
                  className={cn(
                    'h-[220px] w-full resize-none rounded-2xl border bg-slate-900/90 px-3 py-3 font-mono text-[12px] leading-6 text-slate-100 outline-none transition-colors placeholder:text-slate-500',
                    jsonError ? 'border-rose-400/70 focus:border-rose-400/70' : 'border-white/8 focus:border-blue-400/40',
                  )}
                  placeholder="JSON"
                />
                {jsonError && <p className="mt-2 text-xs text-rose-400">{jsonError}</p>}
              </div>
            ) : (
              fields.map((field) => (
                <div key={field.name}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-200">{field.name}</span>
                    <span className="rounded-md border border-white/8 bg-white/5 px-2 py-0.5 text-[11px] text-slate-400">
                      {field.type === 'json' ? 'Object' : 'String'}
                    </span>
                  </div>
                  {field.type === 'json' ? (
                    <>
                      <textarea
                        value={field.value}
                        onChange={(event) => onFieldChange(field.name, event.target.value)}
                        spellCheck={false}
                        className={cn(
                          'h-[188px] w-full resize-none rounded-2xl border bg-slate-900/90 px-3 py-3 font-mono text-[12px] leading-6 text-slate-100 outline-none transition-colors placeholder:text-slate-500',
                          jsonError
                            ? 'border-rose-400/70 focus:border-rose-400/70'
                            : 'border-white/8 focus:border-blue-400/40',
                        )}
                        placeholder="JSON"
                      />
                      {jsonError && <p className="mt-2 text-xs text-rose-400">{jsonError}</p>}
                    </>
                  ) : (
                    <input
                      type="text"
                      value={field.value}
                      onChange={(event) => onFieldChange(field.name, event.target.value)}
                      className="w-full rounded-2xl border border-white/8 bg-slate-900/90 px-3 py-3 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-500 focus:border-blue-400/40"
                    />
                  )}
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between border-t border-white/8 px-4 py-4">
            <p className="text-[11px] leading-5 text-slate-500">点击运行后将开始全局调试，节点下方只展示摘要，点击摘要可以展开详细记录。</p>
            <button
              type="button"
              onClick={onRun}
              className={cn(
                'inline-flex min-w-[144px] items-center justify-center gap-2 rounded-2xl px-5 py-3 text-base font-semibold text-white transition-colors',
                running ? 'bg-emerald-400/85' : 'bg-emerald-500 hover:bg-emerald-400',
              )}
            >
              <Play className="h-4 w-4 fill-white" />
              {running ? '运行中...' : '运行'}
            </button>
          </div>
        </div>

      </section>
    </div>
  )
}

export function EditorBottomBar({
  trialRunOpen,
  onAddNode,
  onToggleTrialRun,
}: {
  trialRunOpen: boolean
  onAddNode: () => void
  onToggleTrialRun: () => void
}) {
  const { history } = useClientContext()
  const tools = usePlaygroundTools()
  const [canUndo, setCanUndo] = useState(history.canUndo())
  const [canRedo, setCanRedo] = useState(history.canRedo())

  useEffect(() => {
    const disposable = history.undoRedoService.onChange(() => {
      setCanUndo(history.canUndo())
      setCanRedo(history.canRedo())
    })

    return () => disposable.dispose()
  }, [history])

  return (
    <div className="aw-flow-ignore-deselect pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-4">
      <div className="pointer-events-auto flex w-fit max-w-[calc(100%-32px)] flex-col items-center gap-3">
        <div className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-slate-950/92 px-3 py-2 shadow-[0_16px_32px_rgba(2,6,23,0.42)] backdrop-blur">
          <div className="flex items-center gap-1 rounded-xl border border-white/8 bg-white/4 p-1 text-slate-300">
            <BottomToolButton ariaLabel="缩小" onClick={() => tools.zoomout()}>
              <Minus className="h-4 w-4" />
            </BottomToolButton>
            <button
              type="button"
              onClick={() => tools.fitView()}
              className="rounded-xl px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/6"
            >
              {Math.round(tools.zoom * 100)}%
            </button>
            <BottomToolButton ariaLabel="放大" onClick={() => tools.zoomin()}>
              <Plus className="h-4 w-4" />
            </BottomToolButton>
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-white/8 bg-white/4 p-1 text-slate-300">
            <BottomToolButton ariaLabel="适应画布" onClick={() => tools.fitView()}>
              <Scan className="h-4 w-4" />
            </BottomToolButton>
            <BottomToolButton ariaLabel="自动布局" onClick={() => tools.autoLayout()}>
              <LayoutGrid className="h-4 w-4" />
            </BottomToolButton>
            <BottomToolButton ariaLabel="撤销" disabled={!canUndo} onClick={() => history.undo()}>
              <Undo2 className="h-4 w-4" />
            </BottomToolButton>
            <BottomToolButton ariaLabel="重做" disabled={!canRedo} onClick={() => history.redo()}>
              <Redo2 className="h-4 w-4" />
            </BottomToolButton>
          </div>

          <button
            type="button"
            onClick={onAddNode}
            className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-5 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:border-blue-400/18 hover:bg-blue-500/[0.08] hover:text-white"
          >
            <Plus className="h-4 w-4" />
            添加节点
          </button>

          <button
            type="button"
            onClick={onToggleTrialRun}
            className={cn(
              'flex items-center gap-2 rounded-2xl border px-5 py-2.5 text-sm font-semibold transition-colors',
              trialRunOpen
                ? 'border-emerald-400/30 bg-emerald-500/[0.16] text-emerald-100'
                : 'border-white/10 bg-white/[0.05] text-slate-200 hover:border-emerald-400/18 hover:bg-emerald-500/[0.08] hover:text-white',
            )}
          >
            <Play className="h-4 w-4 fill-current" />
            全局调试
          </button>
        </div>
      </div>
    </div>
  )
}

function BottomToolButton({
  ariaLabel,
  onClick,
  disabled,
  children,
}: {
  ariaLabel: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-white/6 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}
