import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Clipboard,
  AlertTriangle,
  ImageUp,
  LayoutGrid,
  Link,
  Minus,
  Play,
  Plus,
  Redo2,
  Scan,
  Search,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react'
import { useClientContext, usePlaygroundTools } from '@flowgram.ai/free-layout-editor'
import type { NodePanelRenderProps } from '@flowgram.ai/free-node-panel-plugin'

import {
  bottomLibrarySections,
  paletteToNodeType,
} from '@/features/workflow/editor/workflow-editor.config'
import { uploadMediaFile } from '@/api/storage'
import { SelectorTrialInputSection } from '@/features/workflow/editor/selector-debug/selector-trial-input-section'
import { SelectorTrialResult } from '@/features/workflow/editor/selector-debug/selector-trial-result'
import { cn } from '@/lib/utils'
import type {
  BrowserRuntimePreview,
  GlobalDebugFieldValue,
  TrialRunNodeExecution,
} from '@/features/workflow/editor/workflow-editor.types'
import { BrowserRuntimePreviewCard } from '@/features/workflow/editor/browser-runtime-preview-card'
import type { WorkflowNode } from '@/types/workflow'

export function FlowgramNodePanel({
  position,
  panelProps,
  onSelect,
  onClose,
}: NodePanelRenderProps) {
  const [keyword, setKeyword] = useState('')
  const sourceTitle = typeof panelProps?.sourceTitle === 'string' ? panelProps.sourceTitle : ''
  const disallowNodeTypes = Array.isArray(panelProps?.disallowNodeTypes)
    ? new Set(panelProps.disallowNodeTypes.map(String))
    : new Set<string>()

  const filteredSections = useMemo(
    () =>
      bottomLibrarySections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => {
            const nodeType = paletteToNodeType[item.nodeKey]
            return !disallowNodeTypes.has(nodeType) && item.title.toLowerCase().includes(keyword.toLowerCase())
          }),
        }))
        .filter((section) => section.items.length > 0),
    [disallowNodeTypes, keyword],
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
              {sourceTitle ? `添加到“${sourceTitle}”` : '选择一个节点类型加入当前画布'}
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
  browserPreview,
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
  fields: GlobalDebugFieldValue[]
  running: boolean
  browserPreview?: BrowserRuntimePreview
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
    <div className="aw-flow-ignore-deselect pointer-events-none absolute inset-y-4 right-4 z-30 flex items-end justify-end">
      <section className="pointer-events-auto flex max-h-full w-[640px] max-w-[calc(100vw-520px)] flex-col overflow-hidden rounded-[24px] border border-white/10 bg-slate-950/94 p-4 shadow-[0_24px_56px_rgba(2,6,23,0.48)] backdrop-blur">
        <div className="shrink-0 flex items-start justify-between gap-4 border-b border-white/8 pb-4">
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

        {browserPreview ? (
          <BrowserRuntimePreviewCard preview={browserPreview} />
        ) : null}

        {jsonError ? <TrialRunErrorCard message={jsonError} /> : null}

        <div className="mt-5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-white/8 bg-white/[0.03]">
          <div className="shrink-0 flex items-center justify-between border-b border-white/8 px-4 py-3">
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

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {jsonMode ? (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-200">JSON</span>
                  <span className="rounded-md border border-white/8 bg-white/5 px-2 py-0.5 text-[11px] text-slate-400">
                    Object
                  </span>
                </div>
                <JsonInputEditor
                  value={combinedJson}
                  error={jsonError}
                  heightClassName="h-[220px]"
                  onChange={onCombinedJsonChange}
                />
              </div>
            ) : (
              fields.map((field) => (
                <div key={field.name}>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-medium text-slate-200">{field.label || field.name}</span>
                        <span className="rounded-md border border-white/8 bg-white/5 px-2 py-0.5 text-[11px] text-slate-400">
                          {field.valueType ?? getDebugFieldTypeLabel(field.type)}
                        </span>
                      </div>
                      {field.description && <p className="mt-0.5 text-[10px] text-slate-500">{field.description}</p>}
                    </div>
                    {field.sourceLabel && (
                      <span className="rounded-full border border-blue-300/14 bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-100">
                        {field.sourceLabel}
                      </span>
                    )}
                  </div>
                  {field.type === 'json' ? (
                    <JsonInputEditor
                      value={field.value}
                      error={jsonError}
                      arrayMode={isArrayJsonField(field)}
                      heightClassName={isArrayJsonField(field) ? 'h-[220px]' : 'h-[188px]'}
                      onChange={(value) => onFieldChange(field.name, value)}
                    />
                  ) : isMediaFieldType(field.type) ? (
                    <MediaInputEditor
                      field={field}
                      onChange={(value) => onFieldChange(field.name, value)}
                    />
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

          <div className="shrink-0 flex items-center justify-between border-t border-white/8 px-4 py-4">
            <p className="text-[11px] leading-5 text-slate-500">点击运行后将开始全局调试，节点下方只展示摘要，点击摘要可以展开详细记录。</p>
            <button
              type="button"
              onClick={onRun}
              disabled={running}
              className={cn(
                'inline-flex min-w-[148px] items-center justify-center gap-2 rounded-2xl border px-5 py-3 text-base font-semibold text-white shadow-[0_12px_28px_rgba(16,185,129,0.22)] transition-all',
                running
                  ? 'cursor-not-allowed border-emerald-300/20 bg-emerald-400/55 text-white/80'
                  : 'border-emerald-300/25 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:-translate-y-0.5 hover:from-emerald-400 hover:to-cyan-400 hover:shadow-[0_16px_34px_rgba(34,211,238,0.22)]',
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

export function SingleNodeTrialPanel({
  open,
  node,
  fields,
  running,
  execution,
  browserPreview,
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
  node?: WorkflowNode
  fields: GlobalDebugFieldValue[]
  running: boolean
  execution?: TrialRunNodeExecution
  browserPreview?: BrowserRuntimePreview
  jsonMode: boolean
  combinedJson: string
  jsonError?: string
  onFieldChange: (fieldName: string, value: string) => void
  onCombinedJsonChange: (value: string) => void
  onToggleJsonMode: () => void
  onClose: () => void
  onRun: () => void
}) {
  const parsedInput = useMemo(() => parseExecutionJson(execution?.input), [execution?.input])
  const parsedOutput = useMemo(() => parseExecutionJson(execution?.output), [execution?.output])
  const durationLabel = execution ? `${(execution.durationMs / 1000).toFixed(execution.durationMs >= 1000 ? 0 : 3)}s` : ''
  const isSelectorNode = node?.type === 'selector'

  if (!open || !node) {
    return null
  }

  return (
    <div className="aw-flow-ignore-deselect pointer-events-none absolute inset-y-4 right-4 z-40 flex justify-end">
      <section className="pointer-events-auto flex w-[520px] max-w-[calc(100vw-520px)] flex-col overflow-hidden rounded-[24px] border border-white/10 bg-slate-950/96 shadow-[0_24px_56px_rgba(2,6,23,0.48)] backdrop-blur">
        <div className="flex items-center justify-between gap-4 border-b border-white/8 px-4 py-3">
          <div>
            <p className="text-base font-semibold text-white">试运行</p>
            <p className="mt-1 text-[11px] text-slate-400">{node.title} · 单节点调试</p>
          </div>
          <div className="flex items-center gap-2">
            {execution && (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium',
                  execution.status === 'error'
                    ? 'bg-rose-500/14 text-rose-200'
                    : 'bg-emerald-500/14 text-emerald-200',
                )}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {durationLabel}
                {execution.status === 'success' && <span>查看日志</span>}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="关闭单节点调试面板"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-100">试运行输入</p>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-300">JSON模式</span>
              <button
                type="button"
                onClick={onToggleJsonMode}
                className={cn(
                  'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                  jsonMode ? 'bg-violet-500/70' : 'bg-white/10',
                )}
                aria-label="切换单节点 JSON 模式"
              >
                <span
                  className={cn(
                    'inline-block h-4 w-4 rounded-full bg-white transition-transform',
                    jsonMode ? 'translate-x-4' : 'translate-x-0.5',
                  )}
                />
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg border border-violet-400/20 bg-violet-500/10 px-2 py-1.5 text-xs font-semibold text-violet-100 transition-colors hover:bg-violet-500/16"
              >
                AI 补全
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="mt-3 space-y-3">
            {jsonMode ? (
              <JsonInputEditor
                value={combinedJson}
                error={jsonError}
                onChange={onCombinedJsonChange}
              />
            ) : isSelectorNode ? (
              <SelectorTrialInputSection fields={fields} error={jsonError} onChange={onFieldChange} />
            ) : fields.length > 0 ? (
              fields.map((field) => (
                <FieldInputEditor key={field.name} field={field} error={jsonError} onChange={onFieldChange} />
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-3 py-4 text-xs text-slate-500">
                当前节点没有输入变量，点击运行将使用空输入执行。
              </div>
            )}
          </div>

          {browserPreview ? (
            <BrowserRuntimePreviewCard preview={browserPreview} />
          ) : null}

          {jsonError ? <TrialRunErrorCard message={jsonError} compact /> : null}

          {execution && (
            <div className="mt-6 space-y-4 rounded-2xl border border-white/8 bg-white/[0.03] p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-base font-semibold text-white">运行结果</p>
                {execution.tokenUsage && <TrialTokenUsagePill usage={execution.tokenUsage} />}
              </div>
              {isSelectorNode ? (
                <SelectorTrialResult node={node} input={parsedInput} output={parsedOutput} />
              ) : (
                <>
                  <ExecutionBlock title="输入" value={formatJsonValue(parsedInput)} />
                  <ExecutionBlock title="输出" value={formatJsonValue(parsedOutput)} />
                </>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-white/8 p-4">
          <button
            type="button"
            onClick={onRun}
            disabled={running}
            className={cn(
              'inline-flex w-full items-center justify-center gap-2 rounded-2xl border px-5 py-3 text-base font-semibold text-white shadow-[0_12px_28px_rgba(16,185,129,0.22)] transition-all',
              running
                ? 'cursor-not-allowed border-emerald-300/20 bg-emerald-400/55 text-white/80'
                : 'border-emerald-300/25 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:-translate-y-0.5 hover:from-emerald-400 hover:to-cyan-400 hover:shadow-[0_16px_34px_rgba(34,211,238,0.22)]',
            )}
          >
            <Play className="h-4 w-4 fill-white" />
            {running ? '运行中...' : '运行'}
          </button>
        </div>
      </section>
    </div>
  )
}

function TrialRunErrorCard({
  message,
  compact = false,
}: {
  message: string
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-rose-400/22 bg-rose-500/[0.08] text-rose-100',
        compact ? 'mt-4 px-3 py-2.5' : 'mt-4 px-4 py-3',
      )}
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-semibold">运行前校验未通过</p>
          <p className="mt-1 text-[11px] leading-4 text-rose-100/85">{message}</p>
        </div>
      </div>
    </div>
  )
}

export function FieldInputEditor({
  field,
  error,
  onChange,
}: {
  field: GlobalDebugFieldValue
  error?: string
  onChange: (fieldName: string, value: string) => void
}) {
  return (
    <div className="rounded-[14px] border border-white/8 bg-slate-950/35 p-2.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium text-slate-100">{field.label || field.name}</span>
            <span className="rounded-md border border-white/8 bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400">
              {field.valueType ?? getDebugFieldTypeLabel(field.type)}
            </span>
          </div>
          {field.label && field.name !== field.label && <p className="mt-0.5 text-[10px] text-slate-500">{field.name}</p>}
        </div>
        {field.usageHints?.[0] && (
          <span className="rounded-full border border-cyan-400/14 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-100">
            {field.usageHints[0]}
          </span>
        )}
      </div>
      {field.type === 'json' ? (
        <JsonInputEditor
          value={field.value}
          error={error}
          arrayMode={isArrayJsonField(field)}
          onChange={(value) => onChange(field.name, value)}
        />
      ) : isMediaFieldType(field.type) ? (
        <MediaInputEditor field={field} onChange={(value) => onChange(field.name, value)} />
      ) : (
        <input
          type="text"
          value={field.value}
          onChange={(event) => onChange(field.name, event.target.value)}
          placeholder="输入调试值"
          className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-500 focus:border-blue-400/40"
        />
      )}
    </div>
  )
}

function MediaInputEditor({
  field,
  onChange,
}: {
  field: GlobalDebugFieldValue
  onChange: (value: string) => void
}) {
  const multiple = field.type.endsWith('-array')
  const mediaKind = field.type.includes('video') ? 'video' : 'image'
  const accept = mediaKind === 'image' ? 'image/*' : 'video/*'
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<'upload' | 'url'>('upload')
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const values = useMemo(() => parseMediaValues(field.value, multiple), [field.value, multiple])

  const updateValues = (nextValues: string[]) => {
    onChange(multiple ? JSON.stringify(nextValues, null, 2) : nextValues[0] ?? '')
  }

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) {
      return
    }
    setUploading(true)
    setError('')
    try {
      const uploaded = await Promise.all(Array.from(files).map((file) => uploadMediaFile(file)))
      const nextUrls = uploaded.map((item) => item.url)
      updateValues(multiple ? [...values, ...nextUrls] : nextUrls.slice(0, 1))
    } catch {
      setError('上传失败，请检查文件类型或后端服务')
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-0.5">
          <MediaModeButton active={mode === 'upload'} onClick={() => setMode('upload')}>
            <Upload className="h-3.5 w-3.5" />
            上传
          </MediaModeButton>
          <MediaModeButton active={mode === 'url'} onClick={() => setMode('url')}>
            <Link className="h-3.5 w-3.5" />
            输入 URL
          </MediaModeButton>
        </div>
        <span className="text-[10px] text-slate-500">
          {multiple ? '支持多个' : '单个'}{mediaKind === 'image' ? '图片' : '视频'}
        </span>
      </div>

      {mode === 'upload' ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            void handleUpload(event.dataTransfer.files)
          }}
          disabled={uploading}
          className={cn(
            'flex min-h-[116px] w-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-600/80 bg-slate-950/50 px-4 py-5 text-center transition',
            dragging && 'border-blue-400/80 bg-blue-500/12',
            uploading ? 'cursor-wait opacity-80' : 'hover:border-blue-400/70 hover:bg-blue-500/8',
          )}
        >
          <ImageUp className="mb-2 h-6 w-6 text-blue-300" />
          <span className="text-sm font-medium text-slate-100">
            {uploading ? '上传中...' : '拖拽文件上传 或 点击上传'}
          </span>
          <span className="mt-1 text-xs text-slate-500">可上传到本地存储，也可以切换为直接输入 URL</span>
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            multiple={multiple}
            className="hidden"
            onChange={(event) => void handleUpload(event.target.files)}
          />
        </button>
      ) : (
        <UrlListEditor
          multiple={multiple}
          values={values}
          placeholder={mediaKind === 'image' ? '请输入图片 URL' : '请输入视频 URL'}
          onChange={updateValues}
        />
      )}

      {values.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {values.map((url, index) => (
            <div key={`${url}-${index}`} className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-2 py-1.5">
              {mediaKind === 'image' ? (
                <img src={url} alt="" className="h-8 w-8 shrink-0 rounded-lg border border-white/10 object-cover" />
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-slate-950/70 text-[9px] font-semibold text-blue-200">
                  VIDEO
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-[11px] text-slate-300">{url}</span>
              <button
                type="button"
                onClick={() => updateValues(values.filter((_, itemIndex) => itemIndex !== index))}
                className="rounded-lg p-1 text-slate-500 transition hover:bg-rose-500/12 hover:text-rose-200"
                aria-label="删除媒体 URL"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
    </div>
  )
}

function MediaModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition',
        active ? 'bg-blue-500/20 text-blue-100' : 'text-slate-400 hover:bg-white/7 hover:text-slate-100',
      )}
    >
      {active && <Check className="h-3 w-3" />}
      {children}
    </button>
  )
}

function UrlListEditor({
  multiple,
  values,
  placeholder,
  onChange,
}: {
  multiple: boolean
  values: string[]
  placeholder: string
  onChange: (values: string[]) => void
}) {
  const [draft, setDraft] = useState('')

  if (!multiple) {
    return (
      <input
        type="text"
        value={values[0] ?? ''}
        onChange={(event) => onChange([event.target.value.trim()].filter(Boolean))}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-500 focus:border-blue-400/40"
      />
    )
  }

  const addDraft = () => {
    const url = draft.trim()
    if (!url) {
      return
    }
    onChange([...values, url])
    setDraft('')
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            addDraft()
          }
        }}
        placeholder={`${placeholder}，回车或点击添加`}
        className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-500 focus:border-blue-400/40"
      />
      <button
        type="button"
        onClick={addDraft}
        disabled={!draft.trim()}
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-xl border px-3 py-2.5 text-xs font-semibold transition',
          draft.trim()
            ? 'border-blue-400/30 bg-blue-500/16 text-blue-100 hover:bg-blue-500/24'
            : 'cursor-not-allowed border-white/8 bg-white/5 text-slate-500',
        )}
      >
        <Plus className="h-3.5 w-3.5" />
        添加
      </button>
    </div>
  )
}

function parseMediaValues(value: string, multiple: boolean) {
  if (!value.trim()) {
    return []
  }
  if (!multiple) {
    return [value.trim()]
  }
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
  } catch {
    return value.split('\n').map((item) => item.trim()).filter(Boolean)
  }
}

function isMediaFieldType(type: GlobalDebugFieldValue['type']) {
  return type === 'image' || type === 'video' || type === 'image-array' || type === 'video-array'
}

function getDebugFieldTypeLabel(type: GlobalDebugFieldValue['type']) {
  const labels: Record<GlobalDebugFieldValue['type'], string> = {
    json: 'Object',
    string: 'String',
    image: 'Image',
    video: 'Video',
    'image-array': 'Array<Image>',
    'video-array': 'Array<Video>',
  }
  return labels[type]
}

function JsonInputEditor({
  value,
  error,
  arrayMode = false,
  heightClassName = 'h-[132px]',
  onChange,
}: {
  value: string
  error?: string
  arrayMode?: boolean
  heightClassName?: string
  onChange: (value: string) => void
}) {
  const lineCount = Math.max(value.split('\n').length, 1)
  const handleFormat = () => {
    try {
      onChange(JSON.stringify(JSON.parse(value || (arrayMode ? '[]' : '{}')), null, 2))
    } catch {
      // Keep the current draft so the validation message can guide the user.
    }
  }

  return (
    <div>
      <div
        className={cn(
          'overflow-hidden rounded-xl border bg-slate-900/90 transition-colors',
          error ? 'border-rose-400/70 focus:border-rose-400/70' : 'border-white/10 focus:border-blue-400/40',
        )}
      >
        {arrayMode && (
          <div className="flex h-10 items-center justify-between border-b border-white/8 bg-slate-950/55 px-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-300">JSON</span>
              <span className="rounded-md border border-white/8 bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-500">数组</span>
            </div>
            <button
              type="button"
              onClick={handleFormat}
              className="inline-flex items-center gap-1 rounded-lg border border-white/8 bg-white/5 px-2 py-1 text-[10px] text-slate-400 transition hover:border-blue-300/30 hover:text-blue-100"
              title="格式化 JSON"
            >
              <LayoutGrid className="h-3 w-3" />
              格式化
            </button>
          </div>
        )}
        <div className={cn('flex w-full bg-slate-950/35', heightClassName)}>
          {arrayMode && (
            <div className="select-none border-r border-white/8 bg-slate-950/50 px-2.5 py-2.5 text-right font-mono text-[12px] leading-5 text-slate-500">
              {Array.from({ length: lineCount }).map((_, index) => (
                <div key={index}>{index + 1}</div>
              ))}
            </div>
          )}
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            spellCheck={false}
            className="h-full min-w-0 flex-1 resize-none bg-transparent px-3 py-2.5 font-mono text-[12px] leading-5 text-slate-100 outline-none placeholder:text-slate-500"
            placeholder={arrayMode ? '[]' : 'JSON'}
          />
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
    </div>
  )
}

function isArrayJsonField(field: Pick<GlobalDebugFieldValue, 'type' | 'valueType'>) {
  return field.type === 'json' && field.valueType?.trim().toLowerCase().startsWith('array')
}

function ExecutionBlock({
  title,
  value,
  emptyLabel = '暂无内容',
  compact = false,
}: {
  title: string
  value?: string
  emptyLabel?: string
  compact?: boolean
}) {
  return (
    <div className={compact ? 'mt-3 first:mt-0' : ''}>
      <div className="mb-2 flex items-center gap-2">
        <span className={cn('font-semibold text-slate-100', compact ? 'text-sm' : 'text-base')}>{title}</span>
        <Clipboard className="h-3.5 w-3.5 text-slate-400" />
      </div>
      <pre
        className={cn(
          'whitespace-pre-wrap rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2.5 font-mono text-[12px] leading-5 text-slate-200',
          compact ? 'max-h-40 overflow-auto' : 'min-h-[42px]',
        )}
      >
        {value?.trim() ? value : emptyLabel}
      </pre>
    </div>
  )
}

function TrialTokenUsagePill({ usage }: { usage: NonNullable<TrialRunNodeExecution['tokenUsage']> }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-medium text-cyan-100">
      Token {usage.totalTokens} · 输入 {usage.inputTokens} / 输出 {usage.outputTokens}
    </span>
  )
}

function parseExecutionJson(value?: string): Record<string, unknown> {
  if (!value) {
    return {}
  }
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : { value: parsed }
  } catch {
    return { value }
  }
}

function formatJsonValue(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return ''
  }
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2)
    } catch {
      return value
    }
  }
  return JSON.stringify(value, null, 2)
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
