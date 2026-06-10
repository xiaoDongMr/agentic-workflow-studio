import { Boxes, Check, ChevronDown, Clock3, Link2, PenLine, Plus, Trash2, Waypoints } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import {
  BasicInfoSection,
  ConfigSection,
  ConfigShell,
  type NodeConfigPanelProps,
} from '@/features/workflow/components/node-config/config-fields'
import { useClickOutside } from '@/features/workflow/components/node-config/use-click-outside'
import {
  ARRAY_VALUE_TYPES,
  formatValueType,
  getAvailableInputSources,
  type WorkflowVariableSource,
} from '@/features/workflow/components/node-config/variable-utils'
import { cn } from '@/lib/utils'
import type {
  WorkflowLoopIntermediateVariable,
  WorkflowLoopOutputRef,
  WorkflowNode,
  WorkflowNodeConfig,
  WorkflowValueType,
} from '@/types/workflow'

export function LoopNodeConfigPanel({
  node,
  nodes,
  edges,
  onUpdateNode,
  className,
}: NodeConfigPanelProps) {
  const variableSources = useMemo(() => getAvailableInputSources(node, nodes, edges), [edges, node, nodes])
  const arraySources = useMemo(
    () => variableSources.filter((source) => source.type === 'Array' || source.type.startsWith('Array<')),
    [variableSources],
  )
  const bodyNodes = node.config.loopBodyNodes ?? []
  const intermediateVariables = node.config.loopIntermediateVariables ?? []
  const loopOutputs = node.config.loopOutputs ?? []
  const loopArrayInput = node.inputs[0] ?? { name: 'items', type: 'Array', description: '循环数组' }
  const loopArrayMapping = node.config.inputMappings[0] ?? {
    field: loopArrayInput.name,
    sourceType: 'node' as const,
    source: node.config.loopArraySource ?? '',
    valueType: loopArrayInput.type,
  }
  const bodyOutputSources = useMemo(() => createBodyOutputSources(bodyNodes), [bodyNodes])

  const updateLoopConfig = (patch: Partial<WorkflowNodeConfig>) => {
    onUpdateNode({ config: patch })
  }

  const updateLoopArrayInput = (patch: { name?: string; type?: string; source?: string }) => {
    const nextInput = {
      ...loopArrayInput,
      name: patch.name ?? loopArrayInput.name,
      type: patch.type ?? loopArrayInput.type,
      description: '循环数组',
    }
    const nextSource = patch.source ?? loopArrayMapping.source ?? ''
    onUpdateNode({
      inputs: [nextInput],
      config: {
        loopArraySource: nextSource,
        inputMappings: [{
          field: nextInput.name,
          sourceType: 'node',
          source: nextSource,
          valueType: nextInput.type,
        }],
      },
    })
  }

  const updateIntermediateVariables = (nextVariables: WorkflowLoopIntermediateVariable[]) => {
    updateLoopConfig({ loopIntermediateVariables: nextVariables })
  }

  const updateLoopOutputs = (nextOutputs: WorkflowLoopOutputRef[]) => {
    const validOutputKeys = new Set(bodyOutputSources.map((source) => source.value))
    const validOutputs = nextOutputs.filter((output) => validOutputKeys.has(`${output.nodeId}.${output.fieldPath}`))
    updateLoopConfig({ loopOutputs: validOutputs })
    onUpdateNode({
      outputs: validOutputs.map((output) => ({
        name: output.name,
        type: toArrayValueType(output.type),
        description: `循环完成后聚合 ${output.nodeId}.${output.fieldPath} 的每轮结果`,
      })),
      config: { loopOutputs: validOutputs },
    })
  }

  return (
    <ConfigShell node={node} className={className}>
      <BasicInfoSection node={node} onUpdateNode={onUpdateNode} />

      <ConfigSection title="循环方式" icon={<Waypoints className="h-4 w-4 text-cyan-300" />}>
        <div className="grid grid-cols-2 gap-2">
          <LoopModeCard
            active={(node.config.loopMode ?? 'array') === 'array'}
            icon={<Boxes className="h-3.5 w-3.5" />}
            title="使用数组循环"
            description="遍历数组中的每一项"
            onClick={() => updateLoopConfig({ loopMode: 'array' })}
          />
          <LoopModeCard
            active={node.config.loopMode === 'count'}
            icon={<Clock3 className="h-3.5 w-3.5" />}
            title="指定循环次数"
            description="按固定次数执行循环体"
            onClick={() => updateLoopConfig({ loopMode: 'count' })}
          />
        </div>

        {(node.config.loopMode ?? 'array') === 'array' ? (
          <div>
            <ArrayLoopInputRow
              name={loopArrayInput.name}
              source={node.config.loopArraySource || loopArrayMapping.source || ''}
              arraySources={arraySources}
              onChange={updateLoopArrayInput}
            />
            {arraySources.length === 0 && (
              <p className="mt-1.5 text-[10px] leading-4 text-amber-200/80">暂无可用数组引用，请先在上游节点输出 Array 类型变量。</p>
            )}
          </div>
        ) : (
          <LoopCountField
            value={node.config.loopCount ?? 3}
            onChange={(value) => updateLoopConfig({ loopCount: value })}
          />
        )}
      </ConfigSection>

      <ConfigSection title="中间变量" icon={<Link2 className="h-4 w-4 text-blue-300" />}>
        <p className="rounded-xl border border-blue-300/12 bg-blue-400/7 px-2.5 py-2 text-[10px] leading-4 text-blue-100/80">
          中间变量会出现在循环入口中，作为跨轮共享状态；循环体读取 shared.变量名，返回同名字段即可更新。
        </p>
        <div className="space-y-2">
          {intermediateVariables.map((variable) => (
            <IntermediateVariableRow
              key={variable.id}
              variable={variable}
              variableSources={variableSources}
              onChange={(nextVariable) =>
                updateIntermediateVariables(intermediateVariables.map((item) => (item.id === variable.id ? nextVariable : item)))
              }
              onRemove={() => updateIntermediateVariables(intermediateVariables.filter((item) => item.id !== variable.id))}
            />
          ))}
          {intermediateVariables.length === 0 && <EmptyHint text="暂无中间变量，可按需添加共享状态。" />}
        </div>
        <button
          type="button"
          onClick={() => updateIntermediateVariables([...intermediateVariables, createIntermediateVariable(intermediateVariables.length + 1)])}
          className="flex h-8 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-blue-300/22 bg-slate-950/45 text-[11px] font-medium text-blue-100/90 transition hover:border-blue-300/45 hover:bg-blue-400/10"
        >
          <Plus className="h-3.5 w-3.5" />
          添加中间变量
        </button>
      </ConfigSection>

      <ConfigSection title="输出变量" icon={<Boxes className="h-4 w-4 text-emerald-300" />}>
        <p className="rounded-xl border border-emerald-300/12 bg-emerald-400/7 px-2.5 py-2 text-[10px] leading-4 text-emerald-100/80">
          仅可选择循环子图中节点的输出变量；每轮结果会自动聚合为数组输出。
        </p>
        <div className="space-y-2">
          {loopOutputs.map((output) => (
            <LoopOutputRow
              key={output.id}
              output={output}
              bodyOutputSources={bodyOutputSources}
              onChange={(nextOutput) => updateLoopOutputs(loopOutputs.map((item) => (item.id === output.id ? nextOutput : item)))}
              onRemove={() => updateLoopOutputs(loopOutputs.filter((item) => item.id !== output.id))}
            />
          ))}
          {loopOutputs.length === 0 && <EmptyHint text="暂无输出变量，请先选择循环子图中节点的输出。" />}
        </div>
        <button
          type="button"
          onClick={() => updateLoopOutputs([...loopOutputs, createLoopOutput(loopOutputs.length + 1, bodyOutputSources[0])])}
          disabled={bodyOutputSources.length === 0}
          className={cn(
            'flex h-8 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-emerald-300/22 bg-slate-950/45 text-[11px] font-medium text-emerald-100/90 transition hover:border-emerald-300/45 hover:bg-emerald-400/10',
            bodyOutputSources.length === 0 && 'cursor-not-allowed opacity-50 hover:border-emerald-300/22 hover:bg-slate-950/45',
          )}
        >
          <Plus className="h-3.5 w-3.5" />
          添加输出引用
        </button>
      </ConfigSection>
    </ConfigShell>
  )
}

function LoopModeCard({
  active,
  icon,
  title,
  description,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-2xl border p-2.5 text-left transition',
        active ? 'border-cyan-300/40 bg-cyan-400/12 shadow-[0_0_24px_rgba(34,211,238,0.08)]' : 'border-white/8 bg-slate-950/55 hover:border-white/14',
      )}
    >
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white">
        <span className={cn('text-slate-400', active && 'text-cyan-200')}>{icon}</span>
        {title}
      </span>
      <span className="mt-1 block text-[10px] leading-4 text-slate-500">{description}</span>
    </button>
  )
}

function ArrayLoopInputRow({
  name,
  source,
  arraySources,
  onChange,
}: {
  name: string
  source: string
  arraySources: WorkflowVariableSource[]
  onChange: (patch: { name?: string; type?: string; source?: string }) => void
}) {
  const selectedSource = arraySources.find((item) => item.value === source)
  const fieldGridClass = 'grid-cols-[minmax(118px,0.95fr)_minmax(0,1.35fr)]'

  return (
    <div>
      <div className={cn('grid gap-1.5 text-[10px] font-medium text-slate-500', fieldGridClass)}>
        <span>当前元素变量名</span>
        <span>循环数组来源</span>
      </div>
      <div className={cn('mt-1.5 grid gap-1.5 rounded-2xl border border-white/8 bg-slate-950/58 p-1.5', fieldGridClass)}>
        <input
          value={name}
          placeholder="items"
          onChange={(event) => onChange({ name: event.target.value })}
          className="h-9 min-w-0 rounded-xl border border-white/8 bg-slate-950/80 px-2.5 text-[11px] font-medium text-slate-100 outline-none transition placeholder:text-slate-600 hover:border-white/14 focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/10"
        />
        <PrettySelect
          value={source}
          placeholder="选择上游数组引用"
          selectedMeta={selectedSource ? formatValueType(selectedSource.type) : ''}
          accent="cyan"
          onChange={(nextSource) => {
            const sourceOption = arraySources.find((item) => item.value === nextSource)
            onChange({
              source: nextSource,
              type: sourceOption?.type ?? 'Array',
            })
          }}
          options={arraySources.map((sourceOption) => ({
            value: sourceOption.value,
            label: sourceOption.displayLabel,
            meta: formatValueType(sourceOption.type),
          }))}
        />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <LoopEntryHintCard label="当前元素" value={name || 'item'} description="数组每一项的值" />
        <LoopEntryHintCard label="index 下标" value="index" description="从 0 开始递增" />
      </div>
    </div>
  )
}

function LoopEntryHintCard({
  label,
  value,
  description,
}: {
  label: string
  value: string
  description: string
}) {
  return (
    <div className="rounded-xl border border-cyan-300/12 bg-cyan-400/7 px-2.5 py-2">
      <p className="text-[9px] font-medium text-cyan-100/70">{label}</p>
      <p className="mt-0.5 truncate text-[11px] font-semibold text-cyan-50">{value}</p>
      <p className="mt-0.5 truncate text-[9px] text-slate-500">{description}</p>
    </div>
  )
}

function LoopCountField({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  const currentValue = clampLoopCount(value)

  return (
    <div className="rounded-2xl border border-cyan-300/14 bg-slate-950/58 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold text-slate-100">循环次数</p>
          <p className="mt-0.5 text-[10px] leading-4 text-slate-500">请输入 1-100 之间的整数，避免单次任务执行过久。</p>
        </div>
        <span className="rounded-full border border-cyan-300/18 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-medium text-cyan-100">
          最大 100
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/8 bg-slate-950/80 px-2.5 py-2 focus-within:border-cyan-300/50 focus-within:ring-2 focus-within:ring-cyan-300/12">
        <input
          type="number"
          min={1}
          max={100}
          step={1}
          value={currentValue}
          onChange={(event) => onChange(clampLoopCount(event.target.value))}
          onBlur={(event) => {
            const nextValue = clampLoopCount(event.target.value)
            if (nextValue !== currentValue) {
              onChange(nextValue)
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-50 outline-none [appearance:textfield] placeholder:text-slate-600 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChange(clampLoopCount(currentValue - 1))}
            className="grid h-6 w-6 place-items-center rounded-lg border border-white/8 bg-white/5 text-xs text-slate-300 transition hover:border-cyan-300/30 hover:bg-cyan-400/10 hover:text-cyan-100"
            aria-label="减少循环次数"
          >
            -
          </button>
          <button
            type="button"
            onClick={() => onChange(clampLoopCount(currentValue + 1))}
            className="grid h-6 w-6 place-items-center rounded-lg border border-white/8 bg-white/5 text-xs text-slate-300 transition hover:border-cyan-300/30 hover:bg-cyan-400/10 hover:text-cyan-100"
            aria-label="增加循环次数"
          >
            +
          </button>
        </div>
      </div>
    </div>
  )
}

function clampLoopCount(value: string | number) {
  const count = Math.trunc(Number(value))
  if (!Number.isFinite(count)) {
    return 1
  }
  return Math.min(Math.max(count, 1), 100)
}

function PrettySelect({
  value,
  placeholder,
  selectedMeta,
  options,
  accent,
  onChange,
}: {
  value: string
  placeholder: string
  selectedMeta?: string
  options: Array<{ value: string; label: string; meta?: string; description?: string }>
  accent: 'cyan' | 'blue' | 'emerald'
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const selectedOption = options.find((option) => option.value === value)
  const accentClass = {
    cyan: 'focus-within:border-cyan-300/55 focus-within:ring-cyan-300/15 hover:border-cyan-300/28',
    blue: 'focus-within:border-blue-300/55 focus-within:ring-blue-300/15 hover:border-blue-300/28',
    emerald: 'focus-within:border-emerald-300/55 focus-within:ring-emerald-300/15 hover:border-emerald-300/28',
  }[accent]
  const accentBadgeClass = {
    cyan: 'border-cyan-300/18 bg-cyan-400/10 text-cyan-100',
    blue: 'border-blue-300/18 bg-blue-400/10 text-blue-100',
    emerald: 'border-emerald-300/18 bg-emerald-400/10 text-emerald-100',
  }[accent]

  useClickOutside(containerRef, open, () => setOpen(false))

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title={selectedOption ? [selectedOption.description, selectedOption.label].filter(Boolean).join(' / ') : placeholder}
        className={cn(
          'flex min-h-9 w-full items-center gap-2 rounded-xl border border-white/8 bg-slate-950/85 px-2.5 py-1.5 text-left ring-2 ring-transparent transition shadow-inner shadow-white/[0.03]',
          accentClass,
          open && 'border-white/18 bg-slate-900/95 ring-white/5',
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-[11px] leading-4', selectedOption ? 'font-medium text-slate-100' : 'text-slate-500')}>
            {selectedOption?.label ?? placeholder}
          </span>
          {selectedOption?.description && (
            <span className="mt-0.5 block truncate text-[9px] leading-3 text-slate-500">
              {selectedOption.description}
            </span>
          )}
        </span>
        {(selectedOption?.meta || selectedMeta) && (
          <span className={cn('shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] leading-3', accentBadgeClass)}>
            {selectedOption?.meta ?? selectedMeta}
          </span>
        )}
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-slate-400 transition', open && 'rotate-180 text-slate-200')} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-60 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/98 p-1.5 shadow-[0_18px_48px_rgba(2,6,23,0.65)] backdrop-blur-xl"
        >
          <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
            {options.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-white/4 px-2.5 py-2 text-[11px] text-slate-500">
                暂无可选变量
              </div>
            ) : options.map((option) => {
              const selected = option.value === value
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-start gap-2 rounded-xl px-2.5 py-2 text-left transition',
                    selected ? 'bg-blue-400/14 text-blue-100' : 'text-slate-300 hover:bg-white/6 hover:text-slate-100',
                  )}
                  title={[option.description, option.label].filter(Boolean).join(' / ')}
                >
                  <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                    {selected && <Check className="h-3.5 w-3.5 text-blue-200" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-medium leading-4">{option.label}</span>
                    {option.description && (
                      <span className="mt-0.5 block truncate text-[9px] leading-3 text-slate-500">
                        {option.description}
                      </span>
                    )}
                  </span>
                  {option.meta && (
                    <span className={cn('mt-0.5 shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] leading-3', accentBadgeClass)}>
                      {option.meta}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function IntermediateVariableRow({
  variable,
  variableSources,
  onChange,
  onRemove,
}: {
  variable: WorkflowLoopIntermediateVariable
  variableSources: WorkflowVariableSource[]
  onChange: (variable: WorkflowLoopIntermediateVariable) => void
  onRemove: () => void
}) {
  const selectedType = formatValueType(variable.type || variable.valueType || 'String')
  const fieldGridClass = 'grid-cols-[minmax(118px,0.95fr)_minmax(0,1.35fr)_28px]'

  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/58 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors hover:border-blue-300/18">
      <div className={cn('grid gap-1.5 pb-1 text-[10px] font-medium text-slate-500', fieldGridClass)}>
        <span>中间变量名</span>
        <span>初始值来源</span>
        <span />
      </div>
      <div className={cn('grid gap-1.5', fieldGridClass)}>
        <input
          value={variable.name}
          placeholder="如 state"
          onChange={(event) => onChange({ ...variable, name: event.target.value })}
          className="h-9 min-w-0 rounded-xl border border-white/8 bg-slate-950/80 px-2.5 text-[11px] font-medium text-slate-100 outline-none transition placeholder:text-slate-600 hover:border-white/14 focus:border-blue-300/50 focus:ring-2 focus:ring-blue-300/10"
        />
        {variable.sourceType === 'node' ? (
          <PrettySelect
            value={variable.source}
            placeholder="选择上游变量作为初始值"
            selectedMeta={formatValueType(variable.type)}
            accent="blue"
            onChange={(nextSource) => {
              const sourceOption = variableSources.find((item) => item.value === nextSource)
              onChange({
                ...variable,
                source: nextSource,
                type: sourceOption?.type ?? variable.type,
                valueType: sourceOption?.type ?? variable.valueType,
              })
            }}
            options={variableSources.map((sourceOption) => ({
              value: sourceOption.value,
              label: sourceOption.displayLabel,
              meta: formatValueType(sourceOption.type),
            }))}
          />
        ) : (
          <textarea
            value={variable.source}
            placeholder="填写初始值，支持字符串或 JSON"
            onChange={(event) => onChange({ ...variable, source: event.target.value, type: guessLiteralValueType(event.target.value) })}
            rows={2}
            className="min-h-9 resize-y rounded-xl border border-white/8 bg-slate-950/80 px-2.5 py-2 text-[11px] leading-4 text-slate-100 outline-none transition placeholder:text-slate-600 hover:border-white/14 focus:border-blue-300/50 focus:ring-2 focus:ring-blue-300/10"
          />
        )}
        <IconButton label="删除中间变量" onClick={onRemove} />
      </div>
      <div className="mt-2 grid grid-cols-[104px_1fr] gap-1.5">
        <IntermediateSourceTypeSelect
          value={variable.sourceType}
          onChange={(sourceType) => onChange({ ...variable, sourceType, source: '' })}
        />
        <div className="flex min-h-9 items-center justify-between gap-2 rounded-xl border border-white/8 bg-slate-950/55 px-2.5 text-[10px] text-slate-400">
          <span>当前类型</span>
          <span className="truncate rounded-full border border-blue-300/14 bg-blue-400/8 px-2 py-0.5 text-blue-100/80">
            {selectedType}
          </span>
        </div>
      </div>
    </div>
  )
}

function IntermediateSourceTypeSelect({
  value,
  onChange,
}: {
  value: 'literal' | 'node'
  onChange: (value: 'literal' | 'node') => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const options = [
    { value: 'literal' as const, label: '自定义', description: '直接填写初始值', icon: <PenLine className="h-3 w-3" /> },
    { value: 'node' as const, label: '引用', description: '引用上游变量', icon: <Link2 className="h-3 w-3" /> },
  ]
  const selected = options.find((option) => option.value === value) ?? options[0]

  useClickOutside(containerRef, open, () => setOpen(false))

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'flex min-h-9 w-full items-center justify-between gap-2 rounded-xl border border-white/8 bg-slate-950/80 px-2.5 text-left outline-none ring-2 ring-transparent transition',
          'hover:border-blue-300/28 hover:bg-slate-900/85 focus:border-blue-300/55 focus:ring-blue-300/15',
          open && 'border-blue-300/50 bg-blue-950/18 ring-blue-300/10',
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="text-blue-200/80">{selected.icon}</span>
          <span className="truncate text-[11px] font-medium text-slate-100">{selected.label}</span>
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-slate-500 transition', open && 'rotate-180 text-blue-200')} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-[calc(100%+6px)] z-50 w-40 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/98 p-1.5 shadow-[0_18px_48px_rgba(2,6,23,0.6)] backdrop-blur-xl"
        >
          {options.map((option) => {
            const selectedOption = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selectedOption}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-start gap-2 rounded-xl px-2.5 py-2 text-left transition',
                  selectedOption ? 'bg-blue-400/14 text-blue-100' : 'text-slate-300 hover:bg-white/7 hover:text-white',
                )}
              >
                <span className="mt-0.5 text-slate-400">{option.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-medium leading-4">{option.label}</span>
                  <span className="block truncate text-[9px] leading-3 text-slate-500">{option.description}</span>
                </span>
                {selectedOption && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-200" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function LoopOutputRow({
  output,
  bodyOutputSources,
  onChange,
  onRemove,
}: {
  output: WorkflowLoopOutputRef
  bodyOutputSources: BodyOutputSource[]
  onChange: (output: WorkflowLoopOutputRef) => void
  onRemove: () => void
}) {
  const selectedValue = `${output.nodeId}.${output.fieldPath}`
  const fieldGridClass = 'grid-cols-[minmax(118px,0.95fr)_minmax(0,1.35fr)_28px]'

  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/58 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors hover:border-emerald-300/18">
      <div className={cn('grid gap-1.5 pb-1 text-[10px] font-medium text-slate-500', fieldGridClass)}>
        <span>变量名</span>
        <span>子图输出变量</span>
        <span />
      </div>
      <div className={cn('grid gap-1.5', fieldGridClass)}>
        <input
          value={output.name}
          placeholder="输出变量名"
          onChange={(event) => onChange({ ...output, name: event.target.value })}
          className="h-9 min-w-0 rounded-xl border border-white/8 bg-slate-950/80 px-2.5 text-[11px] font-medium text-slate-100 outline-none transition placeholder:text-slate-600 hover:border-white/14 focus:border-emerald-300/50 focus:ring-2 focus:ring-emerald-300/10"
        />
        <PrettySelect
          value={selectedValue}
          placeholder="选择子图节点输出"
          selectedMeta={formatValueType(output.type)}
          accent="emerald"
          onChange={(nextSource) => {
            const source = bodyOutputSources.find((item) => item.value === nextSource)
            if (!source) {
              return
            }
            onChange({
              ...output,
              nodeId: source.nodeId,
              fieldPath: source.outputName,
              type: source.type,
              name: output.name || `${source.outputName}_list`,
            })
          }}
          options={bodyOutputSources.map((source) => ({
            value: source.value,
            label: source.label,
            description: source.nodeTitle,
            meta: formatValueType(source.type),
          }))}
        />
        <IconButton label="删除输出变量" onClick={onRemove} />
      </div>
    </div>
  )
}

function IconButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/6 hover:text-rose-300"
    >
      <Trash2 className="h-3 w-3" />
    </button>
  )
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/45 px-2.5 py-2.5 text-[11px] text-slate-500">
      {text}
    </div>
  )
}

function createIntermediateVariable(index: number): WorkflowLoopIntermediateVariable {
  return {
    id: `loop_var_${Date.now()}_${index}`,
    name: `state${index}`,
    type: 'String',
    sourceType: 'literal',
    source: '',
    valueType: 'String',
  }
}

function guessLiteralValueType(value: string): WorkflowValueType | string {
  const text = value.trim()
  if (!text) {
    return 'String'
  }
  if (text === 'true' || text === 'false') {
    return 'Boolean'
  }
  if (/^-?\d+$/.test(text)) {
    return 'Integer'
  }
  if (/^-?\d+\.\d+$/.test(text)) {
    return 'Number'
  }
  try {
    const parsed = JSON.parse(text) as unknown
    if (Array.isArray(parsed)) {
      return 'Array'
    }
    if (parsed && typeof parsed === 'object') {
      return 'Object'
    }
  } catch {
    return 'String'
  }
  return 'String'
}

interface BodyOutputSource {
  value: string
  label: string
  nodeTitle: string
  nodeId: string
  outputName: string
  type: string
}

function createBodyOutputSources(nodes: WorkflowNode[]): BodyOutputSource[] {
  return nodes
    .filter((node) => node.type !== 'loop-start' && node.type !== 'loop-end')
    .flatMap((node) =>
      node.outputs
        .filter((output) => output.name.trim().length > 0)
        .map((output) => ({
          value: `${node.id}.${output.name}`,
          label: output.name,
          nodeTitle: node.title,
          nodeId: node.id,
          outputName: output.name,
          type: output.type,
        })),
    )
}

function createLoopOutput(index: number, source?: BodyOutputSource): WorkflowLoopOutputRef {
  return {
    id: `loop_output_${Date.now()}_${index}`,
    name: source ? `${source.outputName}_list` : `result${index}`,
    nodeId: source?.nodeId ?? '',
    fieldPath: source?.outputName ?? '',
    type: source?.type ?? 'String',
  }
}

function toArrayValueType(type: string): WorkflowValueType | string {
  if (type === 'Array' || type.startsWith('Array<')) {
    return type
  }
  const normalized = type as WorkflowValueType
  return ARRAY_VALUE_TYPES.includes(`Array<${normalized}>` as WorkflowValueType) ? `Array<${normalized}>` : 'Array'
}
