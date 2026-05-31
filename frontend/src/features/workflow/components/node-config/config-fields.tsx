import { Check, ChevronDown, ChevronRight, Plus, SlidersHorizontal, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type HTMLAttributes, type ReactNode } from 'react'

import { cn } from '@/lib/utils'
import type { WorkflowInputMapping, WorkflowNode, WorkflowNodeIO, WorkflowValueType } from '@/types/workflow'

export const WORKFLOW_VALUE_TYPES: WorkflowValueType[] = [
  'String',
  'Integer',
  'Number',
  'Boolean',
  'Time',
  'Object',
  'Array',
  'Array<String>',
  'Array<Integer>',
  'Array<Number>',
  'Array<Boolean>',
  'Array<Time>',
  'Array<Object>',
]

const WORKFLOW_VALUE_TYPE_LABELS: Record<WorkflowValueType, string> = {
  String: 'str. String',
  Integer: 'int. Integer',
  Number: 'num. Number',
  Boolean: 'bool. Boolean',
  Time: 'time. Time',
  Object: 'obj. Object',
  Array: 'arr. Array',
  'Array<String>': 'arr. Array<String>',
  'Array<Integer>': 'arr. Array<Integer>',
  'Array<Number>': 'arr. Array<Number>',
  'Array<Boolean>': 'arr. Array<Boolean>',
  'Array<Time>': 'arr. Array<Time>',
  'Array<Object>': 'arr. Array<Object>',
}

const BASE_VALUE_TYPES: WorkflowValueType[] = ['String', 'Integer', 'Number', 'Boolean', 'Time', 'Object']
const ARRAY_VALUE_TYPES: WorkflowValueType[] = [
  'Array<String>',
  'Array<Integer>',
  'Array<Number>',
  'Array<Boolean>',
  'Array<Time>',
  'Array<Object>',
]

export interface NodeConfigPanelProps extends HTMLAttributes<HTMLDivElement> {
  node: WorkflowNode
  nodes?: WorkflowNode[]
  edges?: { source: string; target: string }[]
  onUpdateNode: (
    partial: Partial<Omit<WorkflowNode, 'config'>> & {
      config?: Partial<WorkflowNode['config']>
    },
  ) => void
}

export interface WorkflowVariableSource {
  value: string
  label: string
  type: string
  nodeId: string
  nodeTitle: string
  outputName: string
}

export function getAvailableInputSources(
  currentNode: WorkflowNode,
  nodes: WorkflowNode[] = [],
  edges: { source: string; target: string }[] = [],
): WorkflowVariableSource[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const incoming = new Map<string, string[]>()
  for (const edge of edges) {
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source])
  }

  const ancestorIds: string[] = []
  const visited = new Set<string>()
  const queue = [...(incoming.get(currentNode.id) ?? [])]
  while (queue.length > 0) {
    const nodeId = queue.shift()
    if (!nodeId || visited.has(nodeId)) {
      continue
    }
    visited.add(nodeId)
    ancestorIds.push(nodeId)
    queue.push(...(incoming.get(nodeId) ?? []))
  }

  return ancestorIds.flatMap((nodeId) => {
    const node = nodesById.get(nodeId)
    if (!node) {
      return []
    }
    return node.outputs
      .filter((output) => output.name)
      .map((output) => ({
        value: `${node.id}.${output.name}`,
        label: `${node.title}.${output.name} (${formatValueType(output.type)})`,
        type: output.type,
        nodeId: node.id,
        nodeTitle: node.title,
        outputName: output.name,
      }))
  })
}

export function normalizeValueType(type: string): WorkflowValueType {
  const normalized = type.trim().toLowerCase()
  const matched = WORKFLOW_VALUE_TYPES.find((item) => item.toLowerCase() === normalized)
  return matched ?? 'String'
}

export function formatValueType(type: string) {
  return WORKFLOW_VALUE_TYPE_LABELS[normalizeValueType(type)]
}

function getValueTypeName(type: string) {
  return normalizeValueType(type).replace('Array<', '').replace('>', '')
}

export function ConfigShell({
  node,
  className,
  children,
}: {
  node: WorkflowNode
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'aw-node-config-panel flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[22px] border border-white/8 bg-slate-950/92 shadow-[0_24px_80px_rgba(2,6,23,0.48)] backdrop-blur',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-white/8 px-3.5 py-2.5">
        <div>
          <p className="text-[13px] font-semibold text-white">节点配置</p>
          <p className="mt-0.5 truncate text-[11px] text-slate-400">{node.title}</p>
        </div>
        <Sparkles className="h-3.5 w-3.5 text-blue-300" />
      </div>

      <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-3.5">{children}</div>
    </div>
  )
}

export function ConfigSection({
  title,
  icon,
  children,
}: {
  title: string
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-white/8 bg-white/4 p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-white">
        {icon}
        {title}
      </div>
      <div className="mt-2.5 space-y-2.5">{children}</div>
    </section>
  )
}

export function BasicInfoSection({ node, onUpdateNode }: NodeConfigPanelProps) {
  return (
    <ConfigSection title="基础信息">
      <EditableField label="节点名称" value={node.title} onChange={(value) => onUpdateNode({ title: value })} />
      <EditableArea
        label="节点描述"
        value={node.description}
        onChange={(value) => onUpdateNode({ description: value })}
        rows={3}
      />
    </ConfigSection>
  )
}

export function RuntimeSwitchSection({ node, onUpdateNode }: NodeConfigPanelProps) {
  return (
    <ConfigSection title="运行设置" icon={<SlidersHorizontal className="h-4 w-4 text-blue-300" />}>
      <SwitchRow
        label="启用节点"
        checked={node.config.enabled}
        onChange={(checked) => onUpdateNode({ config: { enabled: checked } })}
      />
    </ConfigSection>
  )
}

export function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-slate-400">{label}</p>
      <div className="mt-1.5 rounded-xl border border-white/8 bg-slate-950/80 px-2.5 py-2 text-xs text-slate-100">
        {value}
      </div>
    </div>
  )
}

export function EditableField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'number'
  placeholder?: string
}) {
  return (
    <div>
      <p className="text-[11px] text-slate-400">{label}</p>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-xl border border-white/8 bg-slate-950/80 px-2.5 py-2 text-[11px] leading-4 text-slate-100 outline-none placeholder:text-[11px] placeholder:text-slate-600 focus:border-blue-400/50"
      />
    </div>
  )
}

export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <div>
      <p className="text-[11px] text-slate-400">{label}</p>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-xl border border-white/8 bg-slate-950/80 px-2.5 py-2 text-[11px] leading-4 text-slate-100 outline-none focus:border-blue-400/50"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option || '默认模型'}
          </option>
        ))}
      </select>
    </div>
  )
}

export function EditableArea({
  label,
  value,
  onChange,
  rows,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  rows: number
  placeholder?: string
}) {
  return (
    <div>
      <p className="text-[11px] text-slate-400">{label}</p>
      <textarea
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full resize-none rounded-xl border border-white/8 bg-slate-950/80 px-2.5 py-2.5 text-[11px] leading-4 text-slate-200 outline-none placeholder:text-[11px] placeholder:text-slate-600 focus:border-blue-400/50"
      />
    </div>
  )
}

export function SwitchRow({
  label,
  checked,
  onChange,
  description,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  description?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-slate-950/55 px-3 py-2.5">
      <div>
        <p className="text-xs text-white">{label}</p>
        {description && <p className="mt-1 text-[11px] text-slate-500">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-5 w-9 rounded-full border transition-colors',
          checked ? 'border-blue-400/60 bg-blue-500/80' : 'border-white/10 bg-white/8',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
            checked ? 'translate-x-[17px]' : 'translate-x-[2px]',
          )}
        />
      </button>
    </div>
  )
}

export function InputMappingSection({
  title = '输入映射',
  emptyText = '暂无输入映射，点击右上角“添加”创建。',
  mappings,
  onChange,
}: {
  title?: string
  emptyText?: string
  mappings: WorkflowInputMapping[]
  onChange: (mappings: WorkflowInputMapping[]) => void
}) {
  return (
    <ConfigSection title={title}>
      <div className="-mt-1 flex justify-end">
        <button
          type="button"
          onClick={() => onChange([...mappings, { field: '', sourceType: 'context', source: '' }])}
          className="inline-flex items-center gap-1 rounded-lg border border-white/8 bg-slate-950/70 px-2 py-1 text-[10px] text-slate-300 transition-colors hover:border-blue-400/25 hover:text-white"
        >
          <Plus className="h-3 w-3" />
          添加
        </button>
      </div>
      <div className="space-y-3">
        {mappings.map((mapping, index) => (
          <MappingRow
            key={`${mapping.field}-${index}`}
            mapping={mapping}
            onChange={(nextMapping) =>
              onChange(mappings.map((item, itemIndex) => (itemIndex === index ? nextMapping : item)))
            }
            onRemove={() => onChange(mappings.filter((_, itemIndex) => itemIndex !== index))}
          />
        ))}
        {mappings.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/50 px-2.5 py-2.5 text-[11px] text-slate-500">
            {emptyText}
          </div>
        )}
      </div>
    </ConfigSection>
  )
}

export function IOSection({
  title,
  emptyLabel = title,
  items,
  onChange,
  sourceOptions,
  inputMappings,
  onInputMappingsChange,
  maxItems,
  canRemove = true,
}: {
  title: string
  emptyLabel?: string
  items: WorkflowNode['inputs']
  onChange: (items: WorkflowNodeIO[]) => void
  sourceOptions?: WorkflowVariableSource[]
  inputMappings?: WorkflowInputMapping[]
  onInputMappingsChange?: (mappings: WorkflowInputMapping[]) => void
  maxItems?: number
  canRemove?: boolean
}) {
  const isInputReferenceMode = Boolean(sourceOptions)
  const canAddItem = maxItems === undefined || items.length < maxItems
  const shouldShowAddButton = maxItems === undefined || canAddItem
  const gridClass = isInputReferenceMode
    ? 'grid-cols-[0.8fr_1.2fr_24px]'
    : 'grid-cols-[1fr_150px_24px]'

  const updateItem = (index: number, nextItem: WorkflowNodeIO) => {
    onChange(items.map((currentItem, currentIndex) => (currentIndex === index ? nextItem : currentItem)))
    if (!inputMappings || !onInputMappingsChange) {
      return
    }
    onInputMappingsChange(
      syncMappingAtIndex(inputMappings, index, {
        field: nextItem.name,
        sourceType: 'node',
        source: inputMappings[index]?.source ?? '',
      }),
    )
  }

  const updateSource = (index: number, source: string) => {
    const sourceOption = sourceOptions?.find((option) => option.value === source)
    if (sourceOption) {
      onChange(items.map((item, itemIndex) => (
        itemIndex === index ? { ...item, type: normalizeValueType(sourceOption.type) } : item
      )))
    }
    if (!inputMappings || !onInputMappingsChange) {
      return
    }
    onInputMappingsChange(
      syncMappingAtIndex(inputMappings, index, {
        field: items[index]?.name ?? '',
        sourceType: 'node',
        source,
      }),
    )
  }

  const addItem = () => {
    if (!canAddItem) {
      return
    }
    const sourceOption = sourceOptions?.[0]
    const nextItem = {
      name: sourceOption?.value.split('.').at(-1) ?? '',
      type: sourceOption ? normalizeValueType(sourceOption.type) : 'String',
      description: '',
    }
    onChange([...items, nextItem])
    if (inputMappings && onInputMappingsChange) {
      onInputMappingsChange([
        ...inputMappings,
        {
          field: nextItem.name,
          sourceType: 'node',
          source: sourceOption?.value ?? '',
        },
      ])
    }
  }

  const removeItem = (index: number) => {
    onChange(items.filter((_, currentIndex) => currentIndex !== index))
    if (inputMappings && onInputMappingsChange) {
      onInputMappingsChange(inputMappings.filter((_, currentIndex) => currentIndex !== index))
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        {title ? <p className="text-[11px] text-slate-400">{title}</p> : <span />}
        {shouldShowAddButton && (
          <button
            type="button"
            onClick={addItem}
            disabled={!canAddItem || (isInputReferenceMode && sourceOptions?.length === 0)}
            className={cn(
              'aw-variable-add-button inline-flex h-6 items-center gap-1 rounded-md border border-white/8 bg-slate-950/70 px-2 leading-none text-slate-400 transition-colors hover:border-blue-400/25 hover:text-white',
              !canAddItem && 'cursor-not-allowed opacity-50 hover:border-white/8 hover:text-slate-400',
            )}
          >
            <Plus className="h-2.5 w-2.5" />
            添加
          </button>
        )}
      </div>
      <div className="mt-2 space-y-1.5">
        {items.length > 0 && (
          <div className={cn('grid items-center gap-1.5 px-1 text-[10px] text-slate-500', gridClass)}>
            <span>变量名</span>
            <span>{isInputReferenceMode ? '变量值' : '变量类型'}</span>
            <span />
          </div>
        )}
        {items.map((item, index) => (
          <IOEditorRow
            key={`${title}-${index}`}
            item={item}
            gridClass={gridClass}
            sourceOptions={sourceOptions}
            selectedSource={inputMappings?.[index]?.source ?? ''}
            onChange={(nextItem) => updateItem(index, nextItem)}
            onChangeSource={(source) => updateSource(index, source)}
            onRemove={() => removeItem(index)}
            canRemove={canRemove}
          />
        ))}
        {items.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/50 px-2.5 py-2.5 text-[11px] text-slate-500">
            {isInputReferenceMode && sourceOptions?.length === 0
              ? '暂无可引用的前驱节点输出变量，请先连接上游节点。'
              : `暂无${emptyLabel}字段，点击右上角“添加”创建。`}
          </div>
        )}
      </div>
    </div>
  )
}

export function IOConfigSection({ node, onUpdateNode }: NodeConfigPanelProps) {
  return (
    <>
      <ConfigSection title="输入变量">
        <IOSection title="" emptyLabel="输入变量" items={node.inputs} onChange={(items) => onUpdateNode({ inputs: items })} />
      </ConfigSection>
      <ConfigSection title="输出变量">
        <IOSection title="" emptyLabel="输出变量" items={node.outputs} onChange={(items) => onUpdateNode({ outputs: items })} />
      </ConfigSection>
    </>
  )
}

function IOEditorRow({
  item,
  gridClass,
  sourceOptions,
  selectedSource,
  onChange,
  onChangeSource,
  onRemove,
  canRemove,
}: {
  item: WorkflowNodeIO
  gridClass: string
  sourceOptions?: WorkflowVariableSource[]
  selectedSource?: string
  onChange: (item: WorkflowNodeIO) => void
  onChangeSource?: (source: string) => void
  onRemove: () => void
  canRemove: boolean
}) {
  return (
    <div className={cn('grid items-center gap-1.5 rounded-xl border border-white/8 bg-slate-950/65 p-1.5', gridClass)}>
      <input
        value={item.name}
        placeholder="变量名"
        onChange={(event) => onChange({ ...item, name: event.target.value })}
        className="aw-variable-input h-7 min-w-0 rounded-lg border border-white/8 bg-slate-950/80 px-2 text-slate-200 outline-none placeholder:text-slate-600 hover:border-white/14 focus:border-blue-400/50"
      />
      {sourceOptions && (
        <VariableSourceSelect
          value={selectedSource ?? ''}
          options={sourceOptions}
          onChange={(value) => onChangeSource?.(value)}
        />
      )}
      {!sourceOptions && (
        <ValueTypeSelect
          value={normalizeValueType(item.type)}
          onChange={(type) => onChange({ ...item, type })}
        />
      )}
      {canRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/6 hover:text-rose-300"
          aria-label="删除字段"
        >
          <Trash2 className="h-2.5 w-2.5" />
        </button>
      ) : (
        <span />
      )}
    </div>
  )
}

function ValueTypeSelect({
  value,
  onChange,
}: {
  value: WorkflowValueType
  onChange: (value: WorkflowValueType) => void
}) {
  const [open, setOpen] = useState(false)
  const [arrayOpen, setArrayOpen] = useState(value.startsWith('Array'))
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  const selectType = (nextValue: WorkflowValueType) => {
    onChange(nextValue)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current)
          setArrayOpen(value.startsWith('Array'))
        }}
        className="aw-variable-select-trigger flex h-7 w-full min-w-0 items-center justify-between gap-1.5 rounded-lg border border-white/8 bg-slate-950/80 px-2 text-left text-slate-200 outline-none transition-colors hover:border-white/14 focus:border-blue-400/50"
      >
        <span className="truncate">{formatValueType(value)}</span>
        <ChevronDown className={cn('h-3 w-3 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+5px)] z-50 w-36 rounded-xl border border-white/10 bg-slate-950/98 p-1 shadow-2xl shadow-slate-950/70 backdrop-blur">
          {BASE_VALUE_TYPES.map((type) => (
            <TypeOption key={type} type={type} selected={value === type} onSelect={() => selectType(type)} />
          ))}
          <div className="relative" onMouseEnter={() => setArrayOpen(true)}>
            <button
              type="button"
              onClick={() => {
                if (arrayOpen) {
                  selectType('Array')
                  return
                }
                setArrayOpen(true)
              }}
              className={cn(
                'aw-variable-menu-item flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-slate-300 transition-colors hover:bg-white/8 hover:text-white',
                value.startsWith('Array') && 'bg-white/8 text-white',
              )}
            >
              <span className="flex h-3 w-3 items-center justify-center">
                {value === 'Array' && <Check className="h-3 w-3 text-blue-300" />}
              </span>
              <span className="min-w-0 flex-1 truncate">Array</span>
              <ChevronRight className="h-3 w-3 text-slate-400" />
            </button>

            {arrayOpen && (
              <div className="absolute right-[calc(100%+6px)] top-0 z-50 w-36 rounded-xl border border-white/10 bg-slate-950/98 p-1 shadow-2xl shadow-slate-950/70 backdrop-blur">
                {ARRAY_VALUE_TYPES.map((type) => (
                  <TypeOption
                    key={type}
                    type={type}
                    label={getValueTypeName(type)}
                    selected={value === type}
                    onSelect={() => selectType(type)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function TypeOption({
  type,
  label = getValueTypeName(type),
  selected,
  onSelect,
}: {
  type: WorkflowValueType
  label?: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'aw-variable-menu-item flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-slate-300 transition-colors hover:bg-white/8 hover:text-white',
        selected && 'bg-white/8 text-white',
      )}
    >
      <span className="flex h-3 w-3 items-center justify-center">
        {selected && <Check className="h-3 w-3 text-blue-300" />}
      </span>
      <span className="truncate">{label}</span>
    </button>
  )
}

function VariableSourceSelect({
  value,
  options,
  onChange,
}: {
  value: string
  options: WorkflowVariableSource[]
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selectedOption = options.find((option) => option.value === value)
  const groupedOptions = useMemo(() => {
    const groups = new Map<string, { title: string; options: WorkflowVariableSource[] }>()
    for (const option of options) {
      const nodeId = option.nodeId || option.value.split('.')[0] || 'unknown'
      const title = option.nodeTitle || nodeId
      const group = groups.get(nodeId) ?? { title, options: [] }
      group.options.push(option)
      groups.set(nodeId, group)
    }
    return [...groups.values()]
  }, [options])

  useEffect(() => {
    if (!open) {
      return
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  const selectSource = (nextValue: string) => {
    onChange(nextValue)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="aw-variable-select-trigger flex h-7 w-full min-w-0 items-center justify-between gap-1.5 rounded-lg border border-white/8 bg-slate-950/80 px-2 text-left text-slate-200 outline-none transition-colors hover:border-white/14 focus:border-blue-400/50"
      >
        {selectedOption ? (
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="truncate">{selectedOption.outputName || selectedOption.value}</span>
            <span className="aw-variable-type-badge shrink-0 rounded bg-white/6 px-1 py-0.5 text-slate-400">
              {formatValueType(selectedOption.type)}
            </span>
          </span>
        ) : (
          <span className="aw-variable-placeholder truncate text-slate-500">选择上游输出</span>
        )}
        <ChevronDown className={cn('h-3 w-3 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+5px)] z-50 max-h-56 w-48 overflow-y-auto rounded-xl border border-white/10 bg-slate-950/98 p-1 shadow-2xl shadow-slate-950/70 backdrop-blur">
          <button
            type="button"
            onClick={() => selectSource('')}
            className={cn(
              'aw-variable-menu-item aw-variable-menu-item-muted flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-slate-500 transition-colors hover:bg-white/8 hover:text-slate-200',
              !value && 'bg-white/8 text-slate-200',
            )}
          >
            <span className="flex h-3 w-3 items-center justify-center">
              {!value && <Check className="h-3 w-3 text-blue-300" />}
            </span>
            <span>不引用变量</span>
          </button>

          {groupedOptions.map((group) => (
            <div key={group.title} className="mt-1 border-t border-white/6 pt-1 first:mt-0 first:border-t-0 first:pt-0">
              <p className="px-2 py-0.5 text-[8px] font-medium uppercase tracking-wide text-slate-500">{group.title}</p>
              {group.options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => selectSource(option.value)}
                  className={cn(
                    'aw-variable-menu-item flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-slate-300 transition-colors hover:bg-white/8 hover:text-white',
                    value === option.value && 'bg-white/8 text-white',
                  )}
                >
                  <span className="flex h-3 w-3 items-center justify-center">
                    {value === option.value && <Check className="h-3 w-3 text-blue-300" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{option.outputName || option.value}</span>
                  <span className="aw-variable-type-badge shrink-0 rounded bg-white/6 px-1 py-0.5 text-slate-500">
                    {formatValueType(option.type)}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function syncMappingAtIndex(
  mappings: WorkflowInputMapping[],
  index: number,
  nextMapping: WorkflowInputMapping,
) {
  if (index < mappings.length) {
    return mappings.map((mapping, mappingIndex) => (mappingIndex === index ? { ...mapping, ...nextMapping } : mapping))
  }
  return [...mappings, nextMapping]
}

function MappingRow({
  mapping,
  onChange,
  onRemove,
}: {
  mapping: WorkflowInputMapping
  onChange: (mapping: WorkflowInputMapping) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-slate-950/70 p-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-slate-400">映射配置</p>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center gap-1 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/6 hover:text-rose-300"
          aria-label="删除输入映射"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <div className="grid gap-2.5">
        <EditableField
          label="字段名"
          value={mapping.field}
          onChange={(value) => onChange({ ...mapping, field: value })}
        />
        <SelectField
          label="来源类型"
          value={mapping.sourceType}
          options={['node', 'context', 'literal']}
          onChange={(value) => onChange({ ...mapping, sourceType: value as WorkflowInputMapping['sourceType'] })}
        />
      </div>
      <div className="mt-2.5">
        <EditableField label="来源值" value={mapping.source} onChange={(value) => onChange({ ...mapping, source: value })} />
      </div>
    </div>
  )
}
