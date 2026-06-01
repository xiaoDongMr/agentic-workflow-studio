import { Check, ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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
  type WorkflowVariableSource,
} from '@/features/workflow/components/node-config/variable-utils'
import { cn } from '@/lib/utils'
import type { WorkflowInputMapping, WorkflowNode, WorkflowNodeIO, WorkflowValueType } from '@/types/workflow'

const DEFAULT_MODEL_OPTION: ModelOption = {
  name: '',
  displayName: '默认模型',
  description: '使用后端默认模型配置',
  supportsThinking: false,
  supportsVision: false,
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

const REASONING_OUTPUT_NAME = 'reasoning_content'
const REASONING_OUTPUT_TYPE: WorkflowValueType = 'String'
const VISION_REFERENCE_TYPES = new Set<WorkflowValueType>(['Image', 'Video', 'Array<Image>', 'Array<Video>'])

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
          supportsVision: false,
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
  const errorStrategyOptions = useMemo(
    () => ERROR_STRATEGY_OPTIONS.map((item) => ERROR_STRATEGY_LABEL[item]),
    [],
  )
  const handleModelChange = useCallback((model: ModelOption) => {
    onUpdateNode({
      config: {
        model: model.name,
        ...(model.supportsThinking ? { reasoningKey: REASONING_OUTPUT_NAME } : {}),
      },
      ...(model.supportsThinking ? { outputs: ensureReasoningOutput(node.outputs) } : {}),
    })
  }, [node.outputs, onUpdateNode])

  return (
    <ConfigShell node={node} className={className}>
      <BasicInfoSection node={node} onUpdateNode={onUpdateNode} />

      <ConfigSection title="输入变量">
        <IOSection
          title=""
          emptyLabel="输入变量"
          items={node.inputs}
          sourceOptions={inputSources}
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
      </ConfigSection>

      {selectedModel.supportsVision && (
        <ConfigSection title="视觉理解输入">
          <VisionInputSection
            sourceOptions={inputSources}
            mappings={config.visionInputMappings ?? []}
            onChange={(visionInputMappings) => onUpdateNode({ config: { visionInputMappings } })}
          />
        </ConfigSection>
      )}

      <ConfigSection title="提示词">
        <EditableArea
          label="系统提示词"
          value={config.systemPrompt ?? config.prompt}
          placeholder="可以使用 {{变量名}}、{{变量名.子变量名}} 引用输入变量。"
          onChange={(value) => onUpdateNode({ config: { systemPrompt: value, prompt: value } })}
          rows={6}
        />
        <EditableArea
          label="用户提示词"
          value={config.userPrompt ?? '{{input}}'}
          placeholder="例如：请基于 {{input}} 输出总结。"
          onChange={(value) => onUpdateNode({ config: { userPrompt: value } })}
          rows={6}
        />
      </ConfigSection>

      <ConfigSection title="输出变量">
        <IOSection title="" emptyLabel="输出变量" items={node.outputs} onChange={(items) => onUpdateNode({ outputs: items })} />
      </ConfigSection>

      <ConfigSection title="异常处理">
        <div className="grid gap-3">
          <EditableField
            label="整体超时（秒）"
            type="number"
            value={String(config.timeoutSeconds ?? 180)}
            onChange={(value) => onUpdateNode({ config: { timeoutSeconds: Number(value) || 180 } })}
          />
          <EditableField
            label="重试次数"
            type="number"
            value={String(config.retryCount ?? 0)}
            onChange={(value) => onUpdateNode({ config: { retryCount: Number(value) || 0 } })}
          />
        </div>
        <SwitchRow
          label="首 Token 超时检测"
          checked={Boolean(config.firstTokenTimeoutEnabled)}
          onChange={(checked) => onUpdateNode({ config: { firstTokenTimeoutEnabled: checked } })}
          description="预留给 token 级流式调用。"
        />
        <SelectField
          label="异常策略"
          value={ERROR_STRATEGY_LABEL[config.errorStrategy ?? 'interrupt']}
          options={errorStrategyOptions}
          onChange={(label) => {
            const strategy = ERROR_STRATEGY_OPTIONS.find((item) => ERROR_STRATEGY_LABEL[item] === label) ?? 'interrupt'
            onUpdateNode({ config: { errorStrategy: strategy } })
          }}
        />
        {(config.errorStrategy ?? 'interrupt') === 'fallback' && (
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

function VisionInputSection({
  sourceOptions,
  mappings,
  onChange,
}: {
  sourceOptions: WorkflowVariableSource[]
  mappings: WorkflowInputMapping[]
  onChange: (mappings: WorkflowInputMapping[]) => void
}) {
  const visionSources = useMemo(
    () => sourceOptions.filter((option) => isVisionReferenceType(option.type)),
    [sourceOptions],
  )
  const items = useMemo(() => mappingsToVisionItems(mappings, visionSources), [mappings, visionSources])
  const handleItemsChange = useCallback(
    (nextItems: WorkflowNodeIO[]) => {
      onChange(nextItems.map((item, index) => ({
        field: item.name,
        sourceType: mappings[index]?.sourceType ?? 'node',
        source: mappings[index]?.source ?? '',
        valueType: item.type,
      })))
    },
    [mappings, onChange],
  )
  const handleMappingsChange = useCallback(
    (nextMappings: WorkflowInputMapping[]) => {
      onChange(nextMappings.map((mapping, index) => ({
        ...mapping,
        sourceType: 'node',
        valueType: getVisionMappingType(mapping, visionSources) ?? items[index]?.type ?? 'Image',
      })))
    },
    [items, onChange, visionSources],
  )

  return (
    <div className="space-y-2">
      <p className="text-[10px] leading-4 text-slate-500">
        变量值仅可引用上游 Image / Video / Array&lt;Image&gt; / Array&lt;Video&gt; 类型变量，图片和视频本质都是上传后的 URL。
      </p>
      <IOSection
        title=""
        emptyLabel="视觉理解输入"
        items={items}
        sourceOptions={visionSources}
        inputMappings={mappings}
        onChange={handleItemsChange}
        onInputMappingsChange={handleMappingsChange}
      />
    </div>
  )
}

function ensureReasoningOutput(outputs: WorkflowNode['outputs']) {
  if (outputs.some((output) => output.name === REASONING_OUTPUT_NAME)) {
    return outputs
  }
  return [
    ...outputs,
    {
      name: REASONING_OUTPUT_NAME,
      type: REASONING_OUTPUT_TYPE,
      description: '模型思考内容',
    },
  ]
}

function isVisionReferenceType(type: string): boolean {
  return VISION_REFERENCE_TYPES.has(normalizeValueType(type))
}

function getVisionMappingType(
  mapping: WorkflowInputMapping,
  sourceOptions: WorkflowVariableSource[],
): WorkflowValueType | undefined {
  const sourceType = sourceOptions.find((option) => option.value === mapping.source)?.type
  const normalizedSourceType = sourceType ? normalizeValueType(sourceType) : undefined
  if (normalizedSourceType && VISION_REFERENCE_TYPES.has(normalizedSourceType)) {
    return normalizedSourceType
  }
  const normalizedMappingType = mapping.valueType ? normalizeValueType(mapping.valueType) : undefined
  return normalizedMappingType && VISION_REFERENCE_TYPES.has(normalizedMappingType) ? normalizedMappingType : undefined
}

function mappingsToVisionItems(
  mappings: WorkflowInputMapping[],
  sourceOptions: WorkflowVariableSource[],
): WorkflowNodeIO[] {
  return mappings.map((mapping, index) => ({
    name: mapping.field || `vision_${index + 1}`,
    type: getVisionMappingType(mapping, sourceOptions) ?? 'Image',
    description: '',
  }))
}
