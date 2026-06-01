import { Check, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useRef, useState, type ChangeEvent } from 'react'

import { cn } from '@/lib/utils'
import type { WorkflowInputMapping, WorkflowNode, WorkflowNodeIO, WorkflowValueType } from '@/types/workflow'
import { useClickOutside } from '@/features/workflow/components/node-config/use-click-outside'
import {
  ARRAY_VALUE_TYPES,
  BASE_VALUE_TYPES,
  formatValueType,
  getValueTypeName,
  groupVariableSources,
  normalizeValueType,
  type WorkflowVariableSource,
} from '@/features/workflow/components/node-config/variable-utils'

const DESELECT_SOURCE_VALUE = ''
const EMPTY_UPSTREAM_MESSAGE = '暂无可引用的前驱节点输出变量，请先连接上游节点。'

interface IOSectionProps {
  title: string
  emptyLabel?: string
  items: WorkflowNode['inputs']
  onChange: (items: WorkflowNodeIO[]) => void
  sourceOptions?: WorkflowVariableSource[]
  inputMappings?: WorkflowInputMapping[]
  onInputMappingsChange?: (mappings: WorkflowInputMapping[]) => void
  maxItems?: number
  canRemove?: boolean
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
}: IOSectionProps) {
  const isInputReferenceMode = Boolean(sourceOptions)
  const canAddItem = maxItems === undefined || items.length < maxItems
  const shouldShowAddButton = maxItems === undefined || canAddItem
  const gridClass = isInputReferenceMode
    ? 'grid-cols-[0.8fr_1.2fr_24px]'
    : 'grid-cols-[1fr_150px_24px]'

  const syncMapping = useCallback(
    (index: number, nextMapping: WorkflowInputMapping) => {
      if (!inputMappings || !onInputMappingsChange) {
        return
      }
      onInputMappingsChange(syncMappingAtIndex(inputMappings, index, nextMapping))
    },
    [inputMappings, onInputMappingsChange],
  )

  const updateItem = useCallback(
    (index: number, nextItem: WorkflowNodeIO) => {
      onChange(items.map((currentItem, currentIndex) => (currentIndex === index ? nextItem : currentItem)))
      syncMapping(index, {
        field: nextItem.name,
        sourceType: inputMappings?.[index]?.sourceType ?? 'node',
        source: inputMappings?.[index]?.source ?? '',
        valueType: nextItem.type,
      })
    },
    [inputMappings, items, onChange, syncMapping],
  )

  const updateSource = useCallback(
    (index: number, source: string) => {
      const sourceOption = sourceOptions?.find((option) => option.value === source)
      if (sourceOption) {
        onChange(items.map((item, itemIndex) => (
          itemIndex === index ? { ...item, type: normalizeValueType(sourceOption.type) } : item
        )))
      }
      syncMapping(index, {
        field: items[index]?.name ?? '',
        sourceType: 'node',
        source,
        valueType: sourceOption?.type ?? items[index]?.type ?? 'String',
      })
    },
    [items, onChange, sourceOptions, syncMapping],
  )

  const addItem = useCallback(() => {
    if (!canAddItem) {
      return
    }
    const sourceOption = sourceOptions?.[0]
    const nextItem = createEmptyIOItem(sourceOption)
    onChange([...items, nextItem])

    if (inputMappings && onInputMappingsChange) {
      onInputMappingsChange([
        ...inputMappings,
        {
          field: nextItem.name,
          sourceType: 'node',
          source: sourceOption?.value ?? '',
          valueType: nextItem.type,
        },
      ])
    }
  }, [canAddItem, inputMappings, items, onChange, onInputMappingsChange, sourceOptions])

  const removeItem = useCallback(
    (index: number) => {
      onChange(items.filter((_, currentIndex) => currentIndex !== index))
      if (inputMappings && onInputMappingsChange) {
        onInputMappingsChange(inputMappings.filter((_, currentIndex) => currentIndex !== index))
      }
    },
    [inputMappings, items, onChange, onInputMappingsChange],
  )

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
        {items.length > 0 && <IOHeader gridClass={gridClass} isInputReferenceMode={isInputReferenceMode} />}
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
              ? EMPTY_UPSTREAM_MESSAGE
              : `暂无${emptyLabel}字段，点击右上角“添加”创建。`}
          </div>
        )}
      </div>
    </div>
  )
}

function IOHeader({
  gridClass,
  isInputReferenceMode,
}: {
  gridClass: string
  isInputReferenceMode: boolean
}) {
  return (
    <div className={cn('grid items-center gap-1.5 px-1 text-[10px] text-slate-500', gridClass)}>
      <span>变量名</span>
      <span>{isInputReferenceMode ? '变量值' : '变量类型'}</span>
      <span />
    </div>
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
  const handleNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => onChange({ ...item, name: event.target.value }),
    [item, onChange],
  )

  return (
    <div className={cn('grid items-center gap-1.5 rounded-xl border border-white/8 bg-slate-950/65 p-1.5', gridClass)}>
      <input
        value={item.name}
        placeholder="变量名"
        onChange={handleNameChange}
        className="aw-variable-input h-7 min-w-0 rounded-lg border border-white/8 bg-slate-950/80 px-2 text-slate-200 outline-none placeholder:text-slate-600 hover:border-white/14 focus:border-blue-400/50"
      />
      {sourceOptions ? (
        <VariableSourceSelect
          value={selectedSource ?? DESELECT_SOURCE_VALUE}
          options={sourceOptions}
          onChange={(value) => onChangeSource?.(value)}
        />
      ) : (
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
  const closeMenu = useCallback(() => setOpen(false), [])
  useClickOutside(rootRef, open, closeMenu)

  const selectType = useCallback(
    (nextValue: WorkflowValueType) => {
      onChange(nextValue)
      setOpen(false)
    },
    [onChange],
  )

  const toggleMenu = useCallback(() => {
    setOpen((current) => !current)
    setArrayOpen(value.startsWith('Array'))
  }, [value])

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={toggleMenu}
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
          <ArrayTypeOption
            value={value}
            arrayOpen={arrayOpen}
            onOpenArray={() => setArrayOpen(true)}
            onSelect={selectType}
          />
        </div>
      )}
    </div>
  )
}

function ArrayTypeOption({
  value,
  arrayOpen,
  onOpenArray,
  onSelect,
}: {
  value: WorkflowValueType
  arrayOpen: boolean
  onOpenArray: () => void
  onSelect: (value: WorkflowValueType) => void
}) {
  const selected = value.startsWith('Array')

  return (
    <div className="relative" onMouseEnter={onOpenArray}>
      <button
        type="button"
        onClick={() => (arrayOpen ? onSelect('Array') : onOpenArray())}
        className={cn(
          'aw-variable-menu-item flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-slate-300 transition-colors hover:bg-white/8 hover:text-white',
          selected && 'bg-white/8 text-white',
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
              onSelect={() => onSelect(type)}
            />
          ))}
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
  const selectedOption = useMemo(() => options.find((option) => option.value === value), [options, value])
  const groupedOptions = useMemo(() => groupVariableSources(options), [options])
  const closeMenu = useCallback(() => setOpen(false), [])
  useClickOutside(rootRef, open, closeMenu)

  const selectSource = useCallback(
    (nextValue: string) => {
      onChange(nextValue)
      setOpen(false)
    },
    [onChange],
  )

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
            <TypeBadge type={selectedOption.type} />
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
            onClick={() => selectSource(DESELECT_SOURCE_VALUE)}
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
            <VariableSourceGroup key={group.title} group={group} value={value} onSelect={selectSource} />
          ))}
        </div>
      )}
    </div>
  )
}

function VariableSourceGroup({
  group,
  value,
  onSelect,
}: {
  group: { title: string; options: WorkflowVariableSource[] }
  value: string
  onSelect: (value: string) => void
}) {
  return (
    <div className="mt-1 border-t border-white/6 pt-1 first:mt-0 first:border-t-0 first:pt-0">
      <p className="px-2 py-0.5 text-[8px] font-medium uppercase tracking-wide text-slate-500">{group.title}</p>
      {group.options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onSelect(option.value)}
          className={cn(
            'aw-variable-menu-item flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-slate-300 transition-colors hover:bg-white/8 hover:text-white',
            value === option.value && 'bg-white/8 text-white',
          )}
        >
          <span className="flex h-3 w-3 items-center justify-center">
            {value === option.value && <Check className="h-3 w-3 text-blue-300" />}
          </span>
          <span className="min-w-0 flex-1 truncate">{option.outputName || option.value}</span>
          <TypeBadge type={option.type} muted />
        </button>
      ))}
    </div>
  )
}

function TypeBadge({ type, muted = false }: { type: string; muted?: boolean }) {
  return (
    <span className={cn('aw-variable-type-badge shrink-0 rounded bg-white/6 px-1 py-0.5', muted ? 'text-slate-500' : 'text-slate-400')}>
      {formatValueType(type)}
    </span>
  )
}

function createEmptyIOItem(sourceOption?: WorkflowVariableSource): WorkflowNodeIO {
  return {
    name: sourceOption?.value.split('.').at(-1) ?? '',
    type: sourceOption ? normalizeValueType(sourceOption.type) : 'String',
    description: '',
  }
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
