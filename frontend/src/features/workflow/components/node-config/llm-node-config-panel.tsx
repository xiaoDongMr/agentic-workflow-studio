import { Braces, Check, ChevronDown, Maximize2, RotateCcw, Settings2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { autocompletion, type CompletionContext } from '@codemirror/autocomplete'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorState, RangeSetBuilder } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

import { listModelOptions, type ModelOption } from '@/api/config'
import {
  BasicInfoSection,
  ConfigSection,
  ConfigShell,
  EditableArea,
  EditableField,
  IOSection,
  SelectField,
  SwitchRow,
  type NodeConfigPanelProps,
} from '@/features/workflow/components/node-config/config-fields'
import { useClickOutside } from '@/features/workflow/components/node-config/use-click-outside'
import {
  getAvailableInputSources,
  normalizeValueType,
} from '@/features/workflow/components/node-config/variable-utils'
import { cn } from '@/lib/utils'
import type { WorkflowNode, WorkflowReasoningEffort, WorkflowValueType } from '@/types/workflow'

const DEFAULT_MODEL_OPTION: ModelOption = {
  name: '',
  displayName: '默认模型',
  description: '使用后端默认模型配置',
  supportsThinking: false,
  supportsReasoningEffort: false,
  supportsVision: false,
  maxTokens: null,
  timeoutSeconds: null,
}

const ERROR_STRATEGY_OPTIONS: NonNullable<WorkflowNode['config']['errorStrategy']>[] = [
  'interrupt',
  'fallback',
  'ignore',
]

const ERROR_STRATEGY_LABEL: Record<NonNullable<WorkflowNode['config']['errorStrategy']>, string> = {
  interrupt: '中断流程',
  fallback: '使用兜底输出',
  ignore: '忽略并继续',
}

type ThinkingLevelOption = {
  value: 'minimal' | 'thinking' | WorkflowReasoningEffort
  label: string
  description: string
}

const THINKING_TOGGLE_OPTIONS: ThinkingLevelOption[] = [
  { value: 'minimal', label: '关闭思考', description: '关闭思考，直接回答。' },
  { value: 'thinking', label: '开启思考', description: '开启模型原生思考能力。' },
]

const REASONING_EFFORT_OPTIONS: ThinkingLevelOption[] = [
  { value: 'minimal', label: '关闭思考', description: '关闭思考，直接回答。' },
  { value: 'low', label: '轻量思考', description: '轻量思考，侧重快速响应。' },
  { value: 'medium', label: '均衡模式', description: '均衡模式，兼顾速度与深度。' },
  { value: 'high', label: '深度分析', description: '深度分析，处理复杂问题。' },
]

const REASONING_OUTPUT_NAME = 'reasoning_content'
const REASONING_OUTPUT_TYPE: WorkflowValueType = 'String'
const VISION_REFERENCE_TYPES = new Set<WorkflowValueType>(['Image', 'Video', 'Array<Image>', 'Array<Video>'])

// 提示词编辑器的 Markdown 暗色语法高亮配色
const promptMarkdownHighlightStyle = HighlightStyle.define([
  { tag: t.heading, color: 'rgb(125 211 252)', fontWeight: '600' },
  { tag: t.strong, color: 'rgb(226 232 240)', fontWeight: '700' },
  { tag: t.emphasis, color: 'rgb(226 232 240)', fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through', color: 'rgb(148 163 184)' },
  { tag: [t.link, t.url], color: 'rgb(147 197 253)', textDecoration: 'underline' },
  { tag: [t.monospace, t.contentSeparator], color: 'rgb(252 211 77)' },
  { tag: t.list, color: 'rgb(110 231 183)' },
  { tag: t.quote, color: 'rgb(148 163 184)', fontStyle: 'italic' },
  { tag: t.processingInstruction, color: 'rgb(100 116 139)' },
])

interface ModelOptionsState {
  items: ModelOption[]
  loading: boolean
  error: string
}

export function LlmNodeConfigPanel({ node, nodes, edges, onUpdateNode, className }: NodeConfigPanelProps) {
  const config = node.config
  const [modelOptionsState, setModelOptionsState] = useState<ModelOptionsState>({
    items: [],
    loading: true,
    error: '',
  })

  useEffect(() => {
    let isMounted = true

    listModelOptions()
      .then((items) => {
        if (isMounted) {
          setModelOptionsState({ items, loading: false, error: '' })
        }
      })
      .catch(() => {
        if (isMounted) {
          setModelOptionsState({ items: [], loading: false, error: '模型列表加载失败' })
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  const modelOptions = useMemo(() => {
    const options = [DEFAULT_MODEL_OPTION, ...modelOptionsState.items]
    if (config.model && !options.some((model) => model.name === config.model)) {
      return [
        {
          name: config.model,
          displayName: config.model,
          description: '当前草稿中的模型，未在后端配置列表中找到',
          supportsThinking: false,
          supportsReasoningEffort: false,
          supportsVision: false,
          maxTokens: null,
          timeoutSeconds: null,
        },
        ...options,
      ]
    }
    return options
  }, [config.model, modelOptionsState.items])

  const selectedModel = useMemo(
    () => modelOptions.find((model) => model.name === config.model) ?? DEFAULT_MODEL_OPTION,
    [config.model, modelOptions],
  )
  const inputSources = useMemo(() => getAvailableInputSources(node, nodes, edges), [edges, node, nodes])
  const availableInputSources = useMemo(
    () => selectedModel.supportsVision
      ? inputSources
      : inputSources.filter((source) => !isVisionValueType(source.type)),
    [inputSources, selectedModel.supportsVision],
  )
  const errorStrategyOptions = useMemo(
    () => ERROR_STRATEGY_OPTIONS.map((item) => ERROR_STRATEGY_LABEL[item]),
    [],
  )
  const visibleOutputs = useMemo(
    () => selectedModel.supportsThinking
      ? ensureReasoningOutput(node.outputs)
      : removeReasoningOutput(node.outputs),
    [node.outputs, selectedModel.supportsThinking],
  )
  const promptVariables = useMemo(
    () => node.inputs
      .map((input) => ({ name: input.name.trim(), type: normalizeValueType(input.type) }))
      .filter((input) => input.name.length > 0),
    [node.inputs],
  )
  const textPromptVariables = useMemo(
    () => promptVariables.filter((variable) => !isVisionValueType(variable.type)),
    [promptVariables],
  )
  const handleModelChange = useCallback((model: ModelOption) => {
    const tokenCap = model.maxTokens ?? null
    const currentMaxTokens = config.maxTokens ?? 0
    const nextMaxTokens =
      tokenCap && currentMaxTokens > tokenCap ? tokenCap : currentMaxTokens
    const timeoutCap = model.timeoutSeconds ?? null
    const currentTimeout = config.timeoutSeconds ?? 0
    const nextTimeout =
      timeoutCap && currentTimeout > timeoutCap ? timeoutCap : currentTimeout
    onUpdateNode({
      config: {
        model: model.name,
        thinkingEnabled: false,
        reasoningEffort: 'medium',
        ...(nextMaxTokens !== currentMaxTokens ? { maxTokens: nextMaxTokens } : {}),
        ...(nextTimeout !== currentTimeout ? { timeoutSeconds: nextTimeout } : {}),
        ...(model.supportsThinking ? { reasoningKey: REASONING_OUTPUT_NAME } : {}),
      },
      outputs: model.supportsThinking ? ensureReasoningOutput(node.outputs) : removeReasoningOutput(node.outputs),
    })
  }, [config.maxTokens, config.timeoutSeconds, node.outputs, onUpdateNode])

  return (
    <ConfigShell node={node} className={className}>
      <BasicInfoSection node={node} onUpdateNode={onUpdateNode} />

      <ConfigSection title="输入变量">
        <IOSection
          title=""
          emptyLabel="输入变量"
          items={node.inputs}
          sourceOptions={availableInputSources}
          inputMappings={config.inputMappings}
          onChange={(items) => onUpdateNode({ inputs: items })}
          onInputMappingsChange={(inputMappings) => onUpdateNode({ config: { inputMappings } })}
        />
      </ConfigSection>

      <ConfigSection title="模型配置">
        <ModelSelectField
          label="模型基座"
          value={config.model}
          options={modelOptions}
          loading={modelOptionsState.loading}
          error={modelOptionsState.error}
          onChange={handleModelChange}
        />
        <ModelParamsPanel
          temperature={config.temperature ?? 0}
          maxTokens={config.maxTokens ?? 0}
          maxTokensCap={selectedModel.maxTokens ?? null}
          timeoutSeconds={config.timeoutSeconds ?? 180}
          timeoutCap={selectedModel.timeoutSeconds ?? null}
          supportsThinking={selectedModel.supportsThinking}
          supportsReasoningEffort={selectedModel.supportsReasoningEffort}
          thinkingEnabled={config.thinkingEnabled ?? false}
          reasoningEffort={config.reasoningEffort ?? 'medium'}
          onChange={(patch) => onUpdateNode({ config: patch })}
        />
        {selectedModel.supportsVision && (
          <div className="flex flex-col gap-2 border-t border-white/8 pt-3">
            <p className="text-[11px] font-medium text-slate-300">视觉理解</p>
            <SwitchRow
              label="图片/视频转 Base64"
              checked={Boolean(config.visionInputAsBase64)}
              onChange={(checked) => onUpdateNode({ config: { visionInputAsBase64: checked } })}
              description="开启后后端会将视觉理解输入中的图片或视频 URL 转为 base64 传给模型。"
            />
            <p className="text-[10px] leading-4 text-slate-500">
              图片和视频变量请在“输入变量”中添加或引用，仅支持视觉的模型会展示 Image / Video 类型变量。
            </p>
          </div>
        )}
      </ConfigSection>

      <ConfigSection title="提示词">
        <PromptEditor
          label="系统提示词"
          value={config.systemPrompt ?? config.prompt ?? ''}
          variables={textPromptVariables}
          placeholder="可以使用 {{变量名}}、{{变量名.子变量名}}、{{变量名[数组索引]}} 引用输入变量（图片/视频请在用户提示词中引用）。"
          onChange={(value) => onUpdateNode({ config: { systemPrompt: value, prompt: value } })}
          rows={6}
        />
        <PromptEditor
          label="用户提示词"
          value={config.userPrompt ?? '{{input}}'}
          variables={promptVariables}
          placeholder="可以使用 {{变量名}}、{{变量名.子变量名}}、{{变量名[数组索引]}} 引用输入变量。"
          onChange={(value) => onUpdateNode({ config: { userPrompt: value } })}
          rows={6}
        />
      </ConfigSection>

      <ConfigSection title="输出变量">
        <IOSection
          title=""
          emptyLabel="输出变量"
          items={visibleOutputs}
          onChange={(items) => onUpdateNode({ outputs: normalizeReasoningOutputs(items, selectedModel.supportsThinking) })}
          readonlyNames={selectedModel.supportsThinking ? [REASONING_OUTPUT_NAME] : []}
        />
      </ConfigSection>

      <ConfigSection title="异常处理">
        <div className="grid gap-3">
          <EditableField
            label="重试次数（失败后额外重试，0-10）"
            type="number"
            value={String(config.retryCount ?? 1)}
            onChange={(value) => {
              const retryCount = Math.min(Math.max(Number(value) || 0, 0), 10)
              onUpdateNode({ config: { retryCount } })
            }}
          />
        </div>
        <SelectField
          label="异常策略"
          value={ERROR_STRATEGY_LABEL[config.errorStrategy ?? 'ignore']}
          options={errorStrategyOptions}
          onChange={(label) => {
            const strategy = ERROR_STRATEGY_OPTIONS.find((item) => ERROR_STRATEGY_LABEL[item] === label) ?? 'ignore'
            onUpdateNode({ config: { errorStrategy: strategy } })
          }}
        />
        {(config.errorStrategy ?? 'ignore') === 'fallback' && (
          <EditableArea
            label="兜底输出"
            value={config.fallbackOutput ?? ''}
            onChange={(value) => onUpdateNode({ config: { fallbackOutput: value } })}
            rows={3}
          />
        )}
      </ConfigSection>
    </ConfigShell>
  )
}

type ModelParamsPatch = {
  temperature?: number
  maxTokens?: number
  timeoutSeconds?: number
  thinkingEnabled?: boolean
  reasoningEffort?: WorkflowReasoningEffort
}

const MODEL_PARAM_DEFAULTS = {
  temperature: 0.7,
  maxTokens: 4096,
  timeoutSeconds: 180,
}

const MAX_TOKENS_FALLBACK_CAP = 8192
const TIMEOUT_FALLBACK_CAP = 600

function ModelParamsPanel({
  temperature,
  maxTokens,
  maxTokensCap,
  timeoutSeconds,
  timeoutCap,
  supportsThinking,
  supportsReasoningEffort,
  thinkingEnabled,
  reasoningEffort,
  onChange,
}: {
  temperature: number
  maxTokens: number
  maxTokensCap: number | null
  timeoutSeconds: number
  timeoutCap: number | null
  supportsThinking: boolean
  supportsReasoningEffort: boolean
  thinkingEnabled: boolean
  reasoningEffort: WorkflowReasoningEffort
  onChange: (patch: ModelParamsPatch) => void
}) {
  const [open, setOpen] = useState(false)

  const effectiveMaxTokensCap = maxTokensCap && maxTokensCap > 0 ? maxTokensCap : MAX_TOKENS_FALLBACK_CAP
  const effectiveMaxTokensDefault = Math.min(MODEL_PARAM_DEFAULTS.maxTokens, effectiveMaxTokensCap)
  const effectiveTimeoutCap = timeoutCap && timeoutCap > 0 ? timeoutCap : TIMEOUT_FALLBACK_CAP
  const effectiveTimeoutDefault = Math.min(MODEL_PARAM_DEFAULTS.timeoutSeconds, effectiveTimeoutCap)
  const normalizedThinkingLevels = useMemo(
    () => getThinkingOptions(supportsThinking, supportsReasoningEffort),
    [supportsReasoningEffort, supportsThinking],
  )
  const selectedThinkingValue = thinkingEnabled
    ? supportsReasoningEffort
      ? reasoningEffort
      : 'thinking'
    : 'minimal'
  const effectiveThinkingOption =
    normalizedThinkingLevels.find((level) => level.value === selectedThinkingValue) ?? normalizedThinkingLevels[0]
  const effectiveThinkingLevel = effectiveThinkingOption.value

  const isDirty =
    temperature !== MODEL_PARAM_DEFAULTS.temperature ||
    maxTokens !== effectiveMaxTokensDefault ||
    timeoutSeconds !== effectiveTimeoutDefault ||
    effectiveThinkingLevel !== 'minimal'

  const handleResetAll = useCallback(() => {
    onChange({
      temperature: MODEL_PARAM_DEFAULTS.temperature,
      maxTokens: effectiveMaxTokensDefault,
      timeoutSeconds: effectiveTimeoutDefault,
      thinkingEnabled: false,
      reasoningEffort: 'medium',
    })
  }, [effectiveMaxTokensDefault, effectiveTimeoutDefault, onChange])

  return (
    <div className="rounded-xl border border-white/8 bg-slate-950/50">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'flex w-full min-w-0 items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left transition',
          'hover:bg-white/4',
          open && 'bg-white/4',
        )}
      >
        <span className="flex min-w-0 shrink-0 items-center gap-1.5">
          <Settings2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="whitespace-nowrap text-[11px] font-medium text-slate-200">模型参数</span>
          {isDirty && (
            <span className="shrink-0 rounded bg-blue-400/15 px-1 py-0.5 text-[9px] leading-3 text-blue-200">已自定义</span>
          )}
        </span>
        <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5 overflow-hidden text-[10px] text-slate-500">
          <span className="shrink-0">T {formatTemperature(temperature)}</span>
          <span className="shrink-0 text-slate-600">·</span>
          <span className="min-w-0 truncate">
            Max {maxTokens || '默认'}{maxTokensCap && maxTokensCap > 0 ? `/${maxTokensCap}` : ''}
          </span>
          <span className="shrink-0 text-slate-600">·</span>
          <span className="shrink-0">
            {timeoutSeconds}s{timeoutCap && timeoutCap > 0 ? `/${timeoutCap}s` : ''}
          </span>
          {supportsThinking && (
            <>
              <span className="shrink-0 text-slate-600">·</span>
              <span className="max-w-[4.5rem] shrink truncate rounded-full bg-white/5 px-1.5 py-0.5 text-slate-400">
                {effectiveThinkingOption.label}
              </span>
            </>
          )}
          <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition', open && 'rotate-180')} />
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-white/8 px-2.5 py-3">
          {supportsThinking && (
            <ThinkingEffortSelect
              value={effectiveThinkingOption}
              options={normalizedThinkingLevels}
              onChange={(level) => {
                if (level.value === 'minimal') {
                  onChange({ thinkingEnabled: false })
                  return
                }
                onChange({
                  thinkingEnabled: true,
                  ...(level.value !== 'thinking' ? { reasoningEffort: level.value } : {}),
                })
              }}
            />
          )}
          <SliderField
            label="Temperature"
            description="采样随机性，越高越发散；0 表示更稳定"
            value={temperature}
            min={0}
            max={2}
            step={0.05}
            decimals={2}
            defaultValue={MODEL_PARAM_DEFAULTS.temperature}
            onChange={(value) => onChange({ temperature: value })}
          />
          <SliderField
            label="Max Tokens"
            description={
              maxTokensCap && maxTokensCap > 0
                ? `单次生成的最大 token 数，受当前模型上限 ${maxTokensCap} 限制`
                : '单次生成的最大 token 数；0 表示使用模型默认'
            }
            value={Math.min(maxTokens, effectiveMaxTokensCap)}
            min={0}
            max={effectiveMaxTokensCap}
            step={1}
            decimals={0}
            defaultValue={effectiveMaxTokensDefault}
            onChange={(value) => onChange({ maxTokens: value })}
          />
          <SliderField
            label="Timeout"
            unit="秒"
            description={
              timeoutCap && timeoutCap > 0
                ? `整体调用超时时间，受当前模型上限 ${timeoutCap} 秒限制`
                : '整体调用超时时间，超过将中止本次调用'
            }
            value={Math.min(timeoutSeconds, effectiveTimeoutCap)}
            min={10}
            max={effectiveTimeoutCap}
            step={5}
            decimals={0}
            defaultValue={effectiveTimeoutDefault}
            onChange={(value) => onChange({ timeoutSeconds: value })}
          />
          {isDirty && (
            <button
              type="button"
              onClick={handleResetAll}
              className="flex items-center justify-end gap-1 self-end text-[10px] text-slate-400 transition hover:text-blue-200"
            >
              <RotateCcw className="h-3 w-3" />
              全部恢复默认
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function formatTemperature(value: number) {
  return Number.isFinite(value) ? value.toFixed(2).replace(/\.?0+$/, '') || '0' : '0'
}

function getThinkingOptions(supportsThinking: boolean, supportsReasoningEffort: boolean): ThinkingLevelOption[] {
  if (!supportsThinking) {
    return THINKING_TOGGLE_OPTIONS.slice(0, 1)
  }
  return supportsReasoningEffort ? REASONING_EFFORT_OPTIONS : THINKING_TOGGLE_OPTIONS
}

function ThinkingEffortSelect({
  value,
  options,
  onChange,
}: {
  value: ThinkingLevelOption
  options: ThinkingLevelOption[]
  onChange: (option: ThinkingLevelOption) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  useClickOutside(rootRef, open, () => setOpen(false))

  return (
    <div ref={rootRef} className="relative">
      <p className="text-[11px] text-slate-400">思考程度</p>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'mt-1.5 flex w-full items-center justify-between gap-3 rounded-xl border px-2.5 py-2 text-left transition',
          'border-white/10 bg-slate-950/80 shadow-inner shadow-white/[0.03]',
          'hover:border-blue-300/35 hover:bg-slate-900/85',
          open && 'border-blue-400/55 bg-blue-950/20 ring-2 ring-blue-400/10',
        )}
      >
        <span className="min-w-0">
          <span className="block text-[11px] font-medium leading-4 text-slate-100">{value.label}</span>
          <span className="mt-0.5 block truncate text-[10px] leading-3 text-slate-500">{value.description}</span>
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-slate-400 transition', open && 'rotate-180 text-blue-200')} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-xl border border-white/10 bg-slate-950/98 p-1 shadow-[0_18px_48px_rgba(2,6,23,0.55)] backdrop-blur">
          {options.map((option) => {
            const selected = option.value === value.value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition',
                  selected ? 'bg-blue-400/12 text-blue-100' : 'text-slate-300 hover:bg-white/6 hover:text-white',
                )}
              >
                <span className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', selected ? 'bg-blue-300' : 'bg-slate-600')} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-medium leading-4">{option.label}</span>
                  <span className="mt-0.5 block text-[10px] leading-4 text-slate-500">{option.description}</span>
                </span>
                {selected && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-200" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SliderField({
  label,
  unit,
  description,
  value,
  min,
  max,
  step,
  decimals,
  defaultValue,
  onChange,
}: {
  label: string
  unit?: string
  description?: string
  value: number
  min: number
  max: number
  step: number
  decimals: number
  defaultValue: number
  onChange: (value: number) => void
}) {
  const [draft, setDraft] = useState(() => formatNumber(value, decimals))
  useEffect(() => {
    setDraft(formatNumber(value, decimals))
  }, [value, decimals])

  const clamp = useCallback(
    (next: number) => {
      if (Number.isNaN(next)) return value
      const clamped = Math.min(max, Math.max(min, next))
      const factor = Math.pow(10, decimals)
      return Math.round(clamped * factor) / factor
    },
    [decimals, max, min, value],
  )

  const commitDraft = useCallback(() => {
    const parsed = Number(draft)
    if (Number.isNaN(parsed)) {
      setDraft(formatNumber(value, decimals))
      return
    }
    const next = clamp(parsed)
    onChange(next)
    setDraft(formatNumber(next, decimals))
  }, [clamp, decimals, draft, onChange, value])

  const percent = ((value - min) / (max - min)) * 100
  const isDirty = value !== defaultValue

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-slate-200">{label}</span>
          {isDirty && (
            <button
              type="button"
              onClick={() => onChange(defaultValue)}
              className="flex items-center gap-1 text-[9px] text-slate-500 transition hover:text-blue-200"
              title="恢复默认值"
            >
              <RotateCcw className="h-2.5 w-2.5" />
              默认 {formatNumber(defaultValue, decimals)}
              {unit ? ` ${unit}` : ''}
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={draft}
            min={min}
            max={max}
            step={step}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur()
              }
            }}
            className="h-6 w-16 rounded-md border border-white/8 bg-slate-950/80 px-1.5 text-right text-[11px] text-slate-100 outline-none transition focus:border-blue-400/60"
          />
          {unit && <span className="text-[10px] text-slate-500">{unit}</span>}
        </div>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(clamp(Number(event.target.value)))}
        className="aw-slider"
        style={{ '--slider-percent': `${percent}%` } as React.CSSProperties}
      />
      <div className="flex items-center justify-between text-[9px] text-slate-500">
        <span>{formatNumber(min, decimals)}</span>
        {description && <span className="mx-2 flex-1 truncate text-center">{description}</span>}
        <span>{formatNumber(max, decimals)}</span>
      </div>
    </div>
  )
}

function formatNumber(value: number, decimals: number) {
  if (!Number.isFinite(value)) return '0'
  return decimals > 0 ? value.toFixed(decimals).replace(/\.?0+$/, '') || '0' : String(Math.round(value))
}

function ModelSelectField({
  label,
  value,
  options,
  loading,
  error,
  onChange,
}: {
  label: string
  value: string
  options: ModelOption[]
  loading: boolean
  error: string
  onChange: (model: ModelOption) => void
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useClickOutside(menuRef, open, useCallback(() => setOpen(false), []))

  const selected = useMemo(
    () => options.find((option) => option.name === value) ?? DEFAULT_MODEL_OPTION,
    [options, value],
  )

  const handleSelect = useCallback((model: ModelOption) => {
    onChange(model)
    setOpen(false)
  }, [onChange])

  return (
    <div className="relative" ref={menuRef}>
      <p className="text-[11px] text-slate-400">{label}</p>
      <button
        type="button"
        className={cn(
          'mt-1.5 flex h-8 w-full items-center justify-between rounded-xl border border-white/8 bg-slate-950/80 px-2.5 text-left outline-none transition',
          'hover:border-blue-300/40 hover:bg-slate-900/90 focus:border-blue-400/60',
          open && 'border-blue-400/60 bg-slate-900/95',
        )}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0">
          <span className="block truncate text-[11px] font-medium leading-4 text-slate-100">
            {selected.displayName || selected.name || '默认模型'}
          </span>
          {selected.name && selected.displayName !== selected.name && (
            <span className="block truncate text-[9px] leading-3 text-slate-500">{selected.name}</span>
          )}
        </span>
        <ChevronDown className={cn('ml-2 h-3.5 w-3.5 shrink-0 text-slate-500 transition', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl border border-white/10 bg-slate-950/98 p-1 shadow-[0_18px_54px_rgba(2,6,23,0.48)] backdrop-blur">
          {loading && <div className="px-2 py-2 text-[10px] text-slate-500">模型列表加载中...</div>}
          {!loading && error && <div className="px-2 py-2 text-[10px] text-amber-300">{error}</div>}
          {!loading && !error && options.map((option) => {
            const isSelected = option.name === value
            return (
              <button
                key={option.name || '__default_model__'}
                type="button"
                className={cn(
                  'flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition',
                  isSelected ? 'bg-blue-500/16 text-blue-100' : 'text-slate-300 hover:bg-white/7 hover:text-white',
                )}
                onClick={() => handleSelect(option)}
              >
                <Check className={cn('mt-0.5 h-3 w-3 shrink-0', isSelected ? 'text-blue-300' : 'text-transparent')} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[10px] font-medium leading-4">
                    {option.displayName || option.name || '默认模型'}
                  </span>
                  {option.name && (
                    <span className="block truncate text-[9px] leading-3 text-slate-500">{option.name}</span>
                  )}
                  {option.description && (
                    <span className="mt-0.5 line-clamp-2 block text-[9px] leading-3 text-slate-500">
                      {option.description}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 gap-1 pt-0.5">
                  {option.supportsThinking && (
                    <span className="rounded bg-purple-400/12 px-1 py-0.5 text-[8px] leading-3 text-purple-200">
                      思考
                    </span>
                  )}
                  {option.supportsVision && (
                    <span className="rounded bg-emerald-400/12 px-1 py-0.5 text-[8px] leading-3 text-emerald-200">
                      视觉
                    </span>
                  )}
                </span>
              </button>
            )
          })}
          {!loading && !error && options.length === 0 && (
            <div className="px-2 py-2 text-[10px] text-slate-500">暂无可用模型</div>
          )}
        </div>
      )}
    </div>
  )
}

function PromptEditor(props: {
  label: string
  value: string
  variables: { name: string; type: WorkflowValueType }[]
  placeholder?: string
  onChange: (value: string) => void
  rows: number
}) {
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!expanded) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpanded(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [expanded])

  return (
    <>
      <PromptEditorCore
        {...props}
        headerAction={
          <button
            type="button"
            onClick={() => setExpanded(true)}
            title="放大编辑"
            className="inline-flex h-5 items-center gap-1 rounded-md border border-white/8 bg-slate-950/70 px-1.5 text-[9px] leading-none text-slate-400 transition-colors hover:border-blue-400/25 hover:text-white"
          >
            <Maximize2 className="h-3 w-3" />
            <span className="text-[9px]">放大</span>
          </button>
        }
      />
      {expanded && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-6 backdrop-blur-sm"
          onMouseDown={() => setExpanded(false)}
        >
          <div
            className="flex h-[80vh] w-[min(900px,92vw)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950/98 shadow-[0_24px_80px_rgba(2,6,23,0.6)]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
              <p className="text-[13px] font-medium text-slate-200">{props.label}</p>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                title="关闭"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/8 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden p-4">
              <PromptEditorCore {...props} label="" fill />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

function PromptEditorCore({
  label,
  value,
  variables,
  placeholder,
  onChange,
  rows,
  fill,
  headerAction,
}: {
  label: string
  value: string
  variables: { name: string; type: WorkflowValueType }[]
  placeholder?: string
  onChange: (value: string) => void
  rows: number
  fill?: boolean
  headerAction?: React.ReactNode
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const variablesRef = useRef(variables)
  const initialValueRef = useRef(value)
  const menuRef = useRef<HTMLDivElement>(null)
  useClickOutside(menuRef, menuOpen, useCallback(() => setMenuOpen(false), []))

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    variablesRef.current = variables
    viewRef.current?.dispatch({})
  }, [variables])

  useEffect(() => {
    const host = hostRef.current
    if (!host) {
      return
    }

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: initialValueRef.current,
        extensions: [
          EditorView.lineWrapping,
          markdown({ base: markdownLanguage }),
          syntaxHighlighting(promptMarkdownHighlightStyle),
          EditorView.theme({
            '&': {
              ...(fill ? { height: '100%' } : { minHeight: `${rows * 16 + 20}px` }),
              fontSize: '11px',
              lineHeight: '16px',
              color: 'rgb(226 232 240)',
            },
            '.cm-scroller': {
              fontFamily: 'inherit',
              padding: '10px',
              outline: 'none',
            },
            '.cm-content': {
              ...(fill ? {} : { minHeight: `${rows * 16}px` }),
              padding: 0,
              caretColor: 'rgb(226 232 240)',
            },
            '.cm-line': {
              padding: 0,
            },
            '.cm-tooltip': {
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px',
              backgroundColor: 'rgba(2,6,23,0.98)',
              color: 'rgb(203 213 225)',
              overflow: 'hidden',
            },
            '.cm-tooltip-autocomplete ul': {
              fontFamily: 'inherit',
              fontSize: '11px',
              maxHeight: '224px',
            },
            '.cm-tooltip-autocomplete li[aria-selected]': {
              backgroundColor: 'rgba(255,255,255,0.08)',
              color: 'white',
            },
            '.cm-completionLabel': {
              color: 'rgb(226 232 240)',
            },
            '.cm-completionDetail': {
              marginLeft: '8px',
              fontStyle: 'normal',
              color: 'rgb(148 163 184)',
            },
            '.cm-completionInfo': {
              minWidth: '160px',
              maxWidth: '240px',
              marginLeft: '6px',
              padding: '8px 10px',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '10px',
              backgroundColor: 'rgba(2,6,23,0.98)',
              color: 'rgb(203 213 225)',
            },
          }),
          createPromptVariableHighlighter(() => new Set(variablesRef.current.map((variable) => variable.name))),
          createPromptVariableAutocomplete(() => variablesRef.current),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString())
            }
          }),
        ],
      }),
    })

    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [rows, fill])

  useEffect(() => {
    const view = viewRef.current
    if (!view || view.state.doc.toString() === value) {
      return
    }
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    })
  }, [value])

  const insertFromMenu = useCallback((name: string) => {
    const view = viewRef.current
    if (!view) {
      return
    }
    const token = `{{${name}}}`
    const selection = view.state.selection.main
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: token },
      selection: { anchor: selection.from + token.length },
    })
    view.focus()
    setMenuOpen(false)
  }, [])

  return (
    <div className={cn(fill && 'flex h-full flex-col')}>
      <div className="flex items-center justify-between gap-2">
        {label ? <p className="text-[11px] text-slate-400">{label}</p> : <span />}
        <div className="flex items-center gap-1.5">
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((current) => !current)}
              disabled={variables.length === 0}
              className={cn(
                'inline-flex h-5 items-center gap-1 rounded-md border border-white/8 bg-slate-950/70 px-1.5 text-[9px] leading-none text-slate-400 transition-colors hover:border-blue-400/25 hover:text-white',
                variables.length === 0 && 'cursor-not-allowed opacity-50 hover:border-white/8 hover:text-slate-400',
              )}
            >
              <Braces className="h-3 w-3" />
              <span className="text-[9px]">插入变量</span>
            </button>
            {menuOpen && variables.length > 0 && (
              <VariableSuggestList
                variables={variables}
                className="right-0 top-[calc(100%+5px)] w-44"
                onSelect={insertFromMenu}
              />
            )}
          </div>
          {headerAction}
        </div>
      </div>
      <div
        className={cn(
          'relative mt-1.5 rounded-xl border border-white/8 bg-slate-950/80 focus-within:border-blue-400/50',
          fill && 'flex-1 overflow-auto',
        )}
      >
        {!value && (
          <span className="pointer-events-none absolute left-2.5 top-2.5 z-10 text-[11px] leading-4 text-slate-600">
            {placeholder}
          </span>
        )}
        <div ref={hostRef} className={cn(fill && 'h-full')} />
      </div>
    </div>
  )
}

function VariableSuggestList({
  variables,
  className,
  onSelect,
  onMouseDownSelect,
}: {
  variables: { name: string; type: WorkflowValueType }[]
  className?: string
  onSelect?: (name: string) => void
  onMouseDownSelect?: (name: string) => void
}) {
  return (
    <div
      className={cn(
        'absolute z-50 max-h-56 overflow-y-auto rounded-xl border border-white/10 bg-slate-950/98 p-1 shadow-2xl shadow-slate-950/70 backdrop-blur',
        className,
      )}
    >
      {variables.map((variable) => (
        <button
          key={variable.name}
          type="button"
          onClick={onSelect ? () => onSelect(variable.name) : undefined}
          onMouseDown={onMouseDownSelect ? (event) => {
            event.preventDefault()
            onMouseDownSelect(variable.name)
          } : undefined}
          className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-slate-300 transition-colors hover:bg-white/8 hover:text-white"
        >
          <span className="min-w-0 flex-1 truncate text-[11px]">{variable.name}</span>
          <span className="shrink-0 rounded bg-white/6 px-1 py-0.5 text-[9px] text-slate-400">
            {variable.type}
          </span>
        </button>
      ))}
    </div>
  )
}

function createPromptVariableHighlighter(getKnownNames: () => Set<string>) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = buildPromptVariableDecorations(view, getKnownNames())
      }

      update(update: ViewUpdate) {
        this.decorations = buildPromptVariableDecorations(update.view, getKnownNames())
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    },
  )
}

function buildPromptVariableDecorations(view: EditorView, knownNames: Set<string>) {
  const builder = new RangeSetBuilder<Decoration>()
  const text = view.state.doc.toString()
  const pattern = /\{\{\s*([^{}]+?)\s*\}\}/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const rootName = match[1].split(/[.[]/)[0].trim()
    builder.add(
      match.index,
      match.index + match[0].length,
      Decoration.mark({
        attributes: {
          style: knownNames.has(rootName) ? 'color: rgb(147 197 253);' : 'color: rgb(253 164 175);',
        },
      }),
    )
  }
  return builder.finish()
}

function createPromptVariableAutocomplete(getVariables: () => { name: string; type: WorkflowValueType }[]) {
  return autocompletion({
    activateOnTyping: true,
    defaultKeymap: true,
    closeOnBlur: true,
    icons: false,
    override: [
      (context: CompletionContext) => {
        const variables = getVariables()
        if (variables.length === 0) {
          return null
        }
        const textBefore = context.state.sliceDoc(Math.max(0, context.pos - 80), context.pos)
        const match = textBefore.match(/(\{\{?)([\p{L}\p{N}_.\[\]-]*)$/u)
        if (!match && !context.explicit) {
          return null
        }
        const braces = match?.[1] ?? ''
        const word = match?.[2] ?? ''
        const query = word.toLowerCase()
        // 候选词从“变量名”起点开始匹配（不含 {{），否则 {{ 会被当作过滤词导致候选被全部过滤
        const wordFrom = context.pos - word.length
        const braceFrom = wordFrom - braces.length
        const options = variables
          .filter((variable) => variable.name.toLowerCase().includes(query))
          .map((variable) => {
            const token = `{{${variable.name}}}`
            return {
              label: variable.name,
              detail: variable.type,
              type: 'variable',
              info: () => buildVariableInfo(variable),
              // 连同已输入的 {{ 一起替换为完整的 {{变量名}}
              apply: (view: EditorView) => {
                view.dispatch({
                  changes: { from: braceFrom, to: context.pos, insert: token },
                  selection: { anchor: braceFrom + token.length },
                })
              },
            }
          })

        return {
          from: wordFrom,
          options,
          validFor: /^[\p{L}\p{N}_.\[\]-]*$/u,
        }
      },
    ],
  })
}

function buildVariableInfo(variable: { name: string; type: WorkflowValueType }) {
  const dom = document.createElement('div')
  dom.className = 'flex flex-col gap-1'

  const nameEl = document.createElement('div')
  nameEl.textContent = variable.name
  nameEl.style.cssText = 'font-size:11px;font-weight:600;color:rgb(226 232 240);word-break:break-all;'

  const typeEl = document.createElement('div')
  typeEl.textContent = `类型：${variable.type}`
  typeEl.style.cssText = 'font-size:10px;color:rgb(148 163 184);'

  const tokenEl = document.createElement('div')
  tokenEl.textContent = `引用：{{${variable.name}}}`
  tokenEl.style.cssText = 'font-size:10px;color:rgb(147 197 253);word-break:break-all;'

  dom.append(nameEl, typeEl, tokenEl)
  return dom
}

function ensureReasoningOutput(outputs: WorkflowNode['outputs']) {
  const normalizedOutputs = removeReasoningOutput(outputs)
  return [
    ...normalizedOutputs,
    {
      name: REASONING_OUTPUT_NAME,
      type: REASONING_OUTPUT_TYPE,
      description: '模型思考内容',
    },
  ]
}

function removeReasoningOutput(outputs: WorkflowNode['outputs']) {
  return outputs.filter((output) => output.name !== REASONING_OUTPUT_NAME)
}

function normalizeReasoningOutputs(outputs: WorkflowNode['outputs'], supportsThinking: boolean) {
  if (!supportsThinking) {
    return removeReasoningOutput(outputs)
  }
  return ensureReasoningOutput(outputs)
}

function isVisionValueType(type: string): boolean {
  return VISION_REFERENCE_TYPES.has(normalizeValueType(type))
}
