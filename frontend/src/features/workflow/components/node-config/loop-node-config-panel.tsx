import { Boxes, ChevronDown, Clock3, Link2, Plus, Trash2, Waypoints } from 'lucide-react'
import { useMemo } from 'react'

import {
  BasicInfoSection,
  ConfigSection,
  ConfigShell,
  EditableField,
  type NodeConfigPanelProps,
} from '@/features/workflow/components/node-config/config-fields'
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
    updateLoopConfig({ loopOutputs: nextOutputs })
    onUpdateNode({
      outputs: nextOutputs.map((output) => ({
        name: output.name,
        type: toArrayValueType(output.type),
        description: `循环完成后聚合 ${output.nodeId}.${output.fieldPath} 的每轮结果`,
      })),
      config: { loopOutputs: nextOutputs },
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
          <EditableField
            label="循环次数"
            type="number"
            value={String(node.config.loopCount ?? 3)}
            onChange={(value) => updateLoopConfig({ loopCount: Math.max(Number(value) || 0, 0) })}
          />
        )}
      </ConfigSection>

      <ConfigSection title="中间变量" icon={<Link2 className="h-4 w-4 text-blue-300" />}>
        <p className="rounded-xl border border-blue-300/12 bg-blue-400/7 px-2.5 py-2 text-[10px] leading-4 text-blue-100/80">
          中间变量在多次循环之间共享。循环体节点可通过上下文 `shared.变量名` 或代码节点的 `variables.shared` 读取，并可在输出中返回同名字段更新它。
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
          输出变量引用循环体节点的输出。由于会收集每轮循环结果，节点输出类型会自动转换为数组类型。
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
          {loopOutputs.length === 0 && <EmptyHint text="暂无输出变量，可引用循环体中任一节点的输出。" />}
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
  return (
    <div>
      <div className="grid grid-cols-[0.75fr_1.55fr] gap-1.5 px-1 text-[10px] text-slate-500">
        <span>变量名</span>
        <span>变量值</span>
      </div>
      <div className="mt-1.5 grid grid-cols-[0.75fr_1.55fr] gap-1.5 rounded-2xl border border-white/8 bg-slate-950/58 p-1.5">
        <input
          value={name}
          placeholder="items"
          onChange={(event) => onChange({ name: event.target.value })}
          className="h-8 rounded-xl border border-white/8 bg-slate-950/80 px-2 text-[11px] text-slate-100 outline-none focus:border-cyan-300/50"
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
    </div>
  )
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
  options: Array<{ value: string; label: string; meta?: string }>
  accent: 'cyan' | 'blue' | 'emerald'
  onChange: (value: string) => void
}) {
  const accentClass = {
    cyan: 'focus-within:border-cyan-300/55 focus-within:ring-cyan-300/15',
    blue: 'focus-within:border-blue-300/55 focus-within:ring-blue-300/15',
    emerald: 'focus-within:border-emerald-300/55 focus-within:ring-emerald-300/15',
  }[accent]

  return (
    <div className={cn(
      'relative h-8 rounded-xl border border-white/8 bg-slate-950/85 ring-2 ring-transparent transition',
      accentClass,
    )}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-full w-full appearance-none rounded-xl bg-transparent px-2.5 pr-16 text-[11px] text-slate-100 outline-none"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}{option.meta ? ` · ${option.meta}` : ''}
          </option>
        ))}
      </select>
      {selectedMeta && (
        <span className="pointer-events-none absolute right-7 top-1/2 -translate-y-1/2 rounded-full border border-white/8 bg-white/6 px-1.5 py-0.5 text-[9px] text-slate-300">
          {selectedMeta}
        </span>
      )}
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
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
  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/58 p-2.5">
      <div className="grid grid-cols-[0.8fr_1.2fr_28px] gap-1.5 px-1 pb-1 text-[10px] text-slate-500">
        <span>变量名</span>
        <span>变量值</span>
        <span />
      </div>
      <div className="grid grid-cols-[0.8fr_1.2fr_28px] gap-1.5">
        <input
          value={variable.name}
          placeholder="变量名"
          onChange={(event) => onChange({ ...variable, name: event.target.value })}
          className="h-8 rounded-xl border border-white/8 bg-slate-950/80 px-2 text-[11px] text-slate-100 outline-none focus:border-blue-300/50"
        />
        {variable.sourceType === 'node' ? (
          <PrettySelect
            value={variable.source}
            placeholder="选择引用变量"
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
          <input
            value={variable.source}
            placeholder="初始值，支持 JSON 文本"
            onChange={(event) => onChange({ ...variable, source: event.target.value, type: guessLiteralValueType(event.target.value) })}
            className="h-8 rounded-xl border border-white/8 bg-slate-950/80 px-2 text-[11px] text-slate-100 outline-none focus:border-blue-300/50"
          />
        )}
        <IconButton label="删除中间变量" onClick={onRemove} />
      </div>
      <div className="mt-1.5 grid grid-cols-[82px_1fr] gap-1.5">
        <select
          value={variable.sourceType}
          onChange={(event) => onChange({ ...variable, sourceType: event.target.value as 'literal' | 'node', source: '' })}
          className="h-8 rounded-xl border border-white/8 bg-slate-950/80 px-2 text-[11px] text-slate-100 outline-none focus:border-blue-300/50"
        >
          <option value="literal">自定义</option>
          <option value="node">引用</option>
        </select>
        <div className="flex h-8 items-center rounded-xl border border-white/8 bg-slate-950/55 px-2 text-[10px] text-slate-400">
          当前类型：{formatValueType(variable.type || variable.valueType || 'String')}
        </div>
      </div>
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
  return (
    <div className="grid grid-cols-[0.8fr_1.2fr_28px] gap-1.5 rounded-2xl border border-white/8 bg-slate-950/58 p-2">
      <input
        value={output.name}
        placeholder="输出变量名"
        onChange={(event) => onChange({ ...output, name: event.target.value })}
        className="h-8 rounded-xl border border-white/8 bg-slate-950/80 px-2 text-[11px] text-slate-100 outline-none focus:border-emerald-300/50"
      />
      <select
        value={selectedValue}
        onChange={(event) => {
          const source = bodyOutputSources.find((item) => item.value === event.target.value)
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
        className="h-8 rounded-xl border border-white/8 bg-slate-950/80 px-2 text-[11px] text-slate-100 outline-none focus:border-emerald-300/50"
      >
        {bodyOutputSources.map((source) => (
          <option key={source.value} value={source.value}>{source.label}</option>
        ))}
      </select>
      <IconButton label="删除输出变量" onClick={onRemove} />
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
  nodeId: string
  outputName: string
  type: string
}

function createBodyOutputSources(nodes: WorkflowNode[]): BodyOutputSource[] {
  return nodes
    .filter((node) => node.type !== 'loop-start' && node.type !== 'loop-end')
    .flatMap((node) =>
      (node.outputs.length ? node.outputs : [{ name: node.config.outputKey || 'output', type: 'String', description: '' }]).map((output) => ({
        value: `${node.id}.${output.name}`,
        label: `${node.title}.${output.name} (${formatValueType(output.type)})`,
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
