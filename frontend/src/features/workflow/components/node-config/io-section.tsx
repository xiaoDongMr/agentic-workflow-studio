import { Check, ChevronDown, ChevronRight, Link2, PenLine, Plus, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'

import { cn } from '@/lib/utils'
import type { WorkflowInputMapping, WorkflowNode, WorkflowNodeIO, WorkflowValueType } from '@/types/workflow'
import { createEmptyIOItem, syncMappingAtIndex } from '@/features/workflow/components/node-config/io-mapping-utils'
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
  allowCustomValue?: boolean
  maxItems?: number
  canRemove?: boolean
  readonlyNames?: string[]
}

export function IOSection({
  title,
  emptyLabel = title,
  items,
  onChange,
  sourceOptions,
  inputMappings,
  onInputMappingsChange,
  allowCustomValue = true,
  maxItems,
  canRemove = true,
  readonlyNames = [],
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

  const updateMapping = useCallback(
    (index: number, nextMapping: WorkflowInputMapping) => {
      syncMapping(index, {
        ...nextMapping,
        field: items[index]?.name ?? '',
        valueType: nextMapping.sourceType === 'literal' ? 'String' : items[index]?.type ?? 'String',
      })
    },
    [items, syncMapping],
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
          sourceType: sourceOption ? 'node' : allowCustomValue ? 'literal' : 'node',
          source: sourceOption?.value ?? '',
          valueType: nextItem.type,
        },
      ])
    }
  }, [allowCustomValue, canAddItem, inputMappings, items, onChange, onInputMappingsChange, sourceOptions])

  const removeItem = useCallback(
    (index: number) => {
      if (readonlyNames.includes(items[index]?.name ?? '')) {
        return
      }
      onChange(items.filter((_, currentIndex) => currentIndex !== index))
      if (inputMappings && onInputMappingsChange) {
        onInputMappingsChange(inputMappings.filter((_, currentIndex) => currentIndex !== index))
      }
    },
    [inputMappings, items, onChange, onInputMappingsChange, readonlyNames],
  )

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        {title ? <p className="text-[11px] text-slate-400">{title}</p> : <span />}
        {shouldShowAddButton && (
          <button
            type="button"
            onClick={addItem}
            disabled={!canAddItem || (isInputReferenceMode && !allowCustomValue && sourceOptions?.length === 0)}
            className={cn(
              'aw-variable-add-button inline-flex h-6 items-center gap-1 rounded-md border border-white/8 bg-slate-950/70 px-2 leading-none text-slate-400 transition-colors hover:border-blue-400/25 hover:text-white',
              (!canAddItem || (isInputReferenceMode && !allowCustomValue && sourceOptions?.length === 0)) && 'cursor-not-allowed opacity-50 hover:border-white/8 hover:text-slate-400',
            )}
          >
            <Plus className="h-2.5 w-2.5" />
            添加
          </button>
        )}
      </div>

      <div className="mt-2 space-y-1.5">
        {items.length > 0 && (
          <IOHeader
            gridClass={gridClass}
            isInputReferenceMode={isInputReferenceMode}
            showModeColumn={isInputReferenceMode && allowCustomValue}
          />
        )}
        {items.map((item, index) => (
          <IOEditorRow
            key={`${title}-${index}`}
            item={item}
            gridClass={gridClass}
            sourceOptions={sourceOptions}
            mapping={inputMappings?.[index]}
            selectedSource={inputMappings?.[index]?.sourceType === 'node' ? inputMappings[index].source : ''}
            onChange={(nextItem) => updateItem(index, nextItem)}
            onChangeSource={(source) => updateSource(index, source)}
            onChangeMapping={(mapping) => updateMapping(index, mapping)}
            allowCustomValue={allowCustomValue}
            onRemove={() => removeItem(index)}
            canRemove={canRemove && !readonlyNames.includes(item.name)}
            readonly={readonlyNames.includes(item.name)}
          />
        ))}
        {items.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/50 px-2.5 py-2.5 text-[11px] text-slate-500">
            {isInputReferenceMode && sourceOptions?.length === 0
              ? allowCustomValue ? `${EMPTY_UPSTREAM_MESSAGE} 也可以添加自定义字符串输入。` : EMPTY_UPSTREAM_MESSAGE
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
  showModeColumn,
}: {
  gridClass: string
  isInputReferenceMode: boolean
  showModeColumn: boolean
}) {
  return (
    <div className={cn('grid items-center gap-1.5 px-1 text-[10px] text-slate-500', gridClass)}>
      <span>变量名</span>
      {isInputReferenceMode ? (
        <span className="flex items-center gap-1.5">
          {showModeColumn && <span className="w-[68px] shrink-0" />}
          <span>变量值</span>
        </span>
      ) : (
        <span>变量类型</span>
      )}
      <span />
    </div>
  )
}

function IOEditorRow({
  item,
  gridClass,
  sourceOptions,
  mapping,
  selectedSource,
  onChange,
  onChangeSource,
  onChangeMapping,
  allowCustomValue,
  onRemove,
  canRemove,
  readonly,
}: {
  item: WorkflowNodeIO
  gridClass: string
  sourceOptions?: WorkflowVariableSource[]
  mapping?: WorkflowInputMapping
  selectedSource?: string
  onChange: (item: WorkflowNodeIO) => void
  onChangeSource?: (source: string) => void
  onChangeMapping?: (mapping: WorkflowInputMapping) => void
  allowCustomValue: boolean
  onRemove: () => void
  canRemove: boolean
  readonly: boolean
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
        disabled={readonly}
        className={cn(
          'aw-variable-input h-7 min-w-0 rounded-lg border border-white/8 bg-slate-950/80 px-2 text-slate-200 outline-none placeholder:text-slate-600 hover:border-white/14 focus:border-blue-400/50',
          readonly && 'cursor-not-allowed border-white/6 bg-slate-900/70 text-slate-400 hover:border-white/6',
        )}
      />
      {sourceOptions ? (
        <InputValueEditor
          item={item}
          mapping={mapping}
          selectedSource={selectedSource}
          sourceOptions={sourceOptions}
          onChangeItem={onChange}
          onChangeSource={onChangeSource}
          onChangeMapping={onChangeMapping}
          allowCustomValue={allowCustomValue}
          disabled={readonly}
        />
      ) : (
        <ValueTypeSelect
          value={normalizeValueType(item.type)}
          onChange={(type) => onChange({ ...item, type })}
          disabled={readonly}
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

function InputValueEditor({
  item,
  mapping,
  selectedSource,
  sourceOptions,
  onChangeItem,
  onChangeSource,
  onChangeMapping,
  allowCustomValue,
  disabled,
}: {
  item: WorkflowNodeIO
  mapping?: WorkflowInputMapping
  selectedSource?: string
  sourceOptions: WorkflowVariableSource[]
  onChangeItem: (item: WorkflowNodeIO) => void
  onChangeSource?: (source: string) => void
  onChangeMapping?: (mapping: WorkflowInputMapping) => void
  allowCustomValue: boolean
  disabled: boolean
}) {
  const mode = allowCustomValue && mapping?.sourceType === 'literal' ? 'literal' : 'node'
  const literalValue = mode === 'literal' ? mapping?.source ?? '' : ''

  const switchToNode = () => {
    onChangeMapping?.({
      field: item.name,
      sourceType: 'node',
      source: selectedSource ?? '',
      valueType: item.type,
    })
  }

  const switchToLiteral = () => {
    onChangeItem({ ...item, type: 'String' })
    onChangeMapping?.({
      field: item.name,
      sourceType: 'literal',
      source: '',
      valueType: 'String',
    })
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {allowCustomValue && (
        <InputModeSelect
          mode={mode}
          disabled={disabled}
          onSelect={(next) => (next === 'literal' ? switchToLiteral() : switchToNode())}
        />
      )}
      {mode === 'literal' ? (
        <input
          value={literalValue}
          placeholder="输入字符串值"
          onChange={(event) => onChangeMapping?.({
            field: item.name,
            sourceType: 'literal',
            source: event.target.value,
            valueType: 'String',
          })}
          disabled={disabled}
          className={cn(
            'aw-variable-input h-7 min-w-0 flex-1 rounded-lg border border-white/8 bg-slate-950/80 px-2 text-[11px] text-slate-200 outline-none transition-colors placeholder:text-slate-600 hover:border-white/14 focus:border-blue-400/50',
            disabled && 'cursor-not-allowed border-white/6 bg-slate-900/70 text-slate-400 hover:border-white/6',
          )}
        />
      ) : (
        <div className="min-w-0 flex-1">
          <VariableSourceSelect
            value={selectedSource ?? DESELECT_SOURCE_VALUE}
            options={sourceOptions}
            onChange={(value) => onChangeSource?.(value)}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  )
}

const INPUT_MODE_OPTIONS: { value: 'node' | 'literal'; label: string; icon: ReactNode }[] = [
  { value: 'node', label: '引用', icon: <Link2 className="h-3 w-3" /> },
  { value: 'literal', label: '自定义', icon: <PenLine className="h-3 w-3" /> },
]

function InputModeSelect({
  mode,
  disabled,
  onSelect,
}: {
  mode: 'node' | 'literal'
  disabled: boolean
  onSelect: (mode: 'node' | 'literal') => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const closeMenu = useCallback(() => setOpen(false), [])
  useClickOutside(rootRef, open, closeMenu)
  const current = INPUT_MODE_OPTIONS.find((option) => option.value === mode) ?? INPUT_MODE_OPTIONS[0]

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        title={`变量值来源：${current.label}`}
        className={cn(
          'aw-variable-select-trigger inline-flex h-7 w-[68px] items-center justify-between gap-1 rounded-lg border border-white/8 bg-slate-950/80 px-1.5 leading-none text-slate-300 outline-none transition-colors hover:border-white/14 hover:text-white',
          open && 'border-blue-400/50 text-white',
          disabled && 'cursor-not-allowed opacity-60 hover:border-white/8 hover:text-slate-300',
        )}
      >
        <span className="flex min-w-0 items-center gap-1">
          <span className="text-slate-400">{current.icon}</span>
          <span className="truncate">{current.label}</span>
        </span>
        <ChevronDown className={cn('h-2.5 w-2.5 shrink-0 text-slate-500 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+5px)] z-50 w-24 rounded-xl border border-white/10 bg-slate-950/98 p-1 shadow-2xl shadow-slate-950/70 backdrop-blur">
          {INPUT_MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onSelect(option.value)
                setOpen(false)
              }}
              className={cn(
                'aw-variable-menu-item flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-slate-300 transition-colors hover:bg-white/8 hover:text-white',
                option.value === mode && 'bg-white/8 text-white',
              )}
            >
              <span className="text-slate-400">{option.icon}</span>
              <span className="flex-1">{option.label}</span>
              {option.value === mode && <Check className="h-2.5 w-2.5 text-blue-300" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ValueTypeSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: WorkflowValueType
  onChange: (value: WorkflowValueType) => void
  disabled?: boolean
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
        disabled={disabled}
        className={cn(
          'aw-variable-select-trigger flex h-7 w-full min-w-0 items-center justify-between gap-1.5 rounded-lg border border-white/8 bg-slate-950/80 px-2 text-left text-slate-200 outline-none transition-colors hover:border-white/14 focus:border-blue-400/50',
          disabled && 'cursor-not-allowed border-white/6 bg-slate-900/70 text-slate-400 hover:border-white/6',
        )}
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
  disabled = false,
}: {
  value: string
  options: WorkflowVariableSource[]
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selectedOption = useMemo(() => options.find((option) => option.value === value), [options, value])
  const groupedOptions = useMemo(() => groupVariableSources(options), [options])
  const selectedLoopEntry = selectedOption?.nodeTitle === '循环入口'
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
        disabled={disabled}
        className={cn(
          'aw-variable-select-trigger flex w-full min-w-0 items-center justify-between gap-1.5 rounded-lg border border-white/8 bg-slate-950/80 px-2 text-left text-slate-200 outline-none transition-colors hover:border-white/14 focus:border-blue-400/50',
          selectedLoopEntry ? 'min-h-9 py-1.5' : 'h-7',
          disabled && 'cursor-not-allowed border-white/6 bg-slate-900/70 text-slate-400 hover:border-white/6',
        )}
      >
        {selectedOption ? (
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="min-w-0 flex-1">
              {selectedLoopEntry && (
                <span className="block truncate text-[9px] leading-3 text-blue-200/75">
                  {getLoopEntryOptionMeta(selectedOption).title}
                </span>
              )}
              <span className="block truncate">{selectedOption.outputName || selectedOption.value}</span>
            </span>
            <TypeBadge type={selectedOption.type} />
          </span>
        ) : (
          <span className="aw-variable-placeholder truncate text-slate-500">选择上游输出</span>
        )}
        <ChevronDown className={cn('h-3 w-3 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+5px)] z-50 max-h-72 w-64 overflow-y-auto rounded-xl border border-white/10 bg-slate-950/98 p-1.5 shadow-2xl shadow-slate-950/70 backdrop-blur">
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
  const isLoopEntryGroup = group.title === '循环入口'

  return (
    <div className="mt-1 border-t border-white/6 pt-1 first:mt-0 first:border-t-0 first:pt-0">
      <div className={cn('px-2 py-1', isLoopEntryGroup && 'rounded-lg bg-blue-400/8')}>
        <p className={cn('text-[8px] font-medium uppercase tracking-wide text-slate-500', isLoopEntryGroup && 'text-blue-100/80')}>
          {group.title}
        </p>
        {isLoopEntryGroup && (
          <p className="mt-0.5 text-[9px] leading-3 text-slate-500">
            循环体内可直接引用当前元素和 index
          </p>
        )}
      </div>
      {group.options.map((option) => (
        isLoopEntryGroup ? (
          <LoopEntryMenuItem
            key={option.value}
            option={option}
            selected={value === option.value}
            onSelect={() => onSelect(option.value)}
          />
        ) : (
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
        )
      ))}
    </div>
  )
}

function LoopEntryMenuItem({
  option,
  selected,
  onSelect,
}: {
  option: WorkflowVariableSource
  selected: boolean
  onSelect: () => void
}) {
  const meta = getLoopEntryOptionMeta(option)

  return (
    <button
      type="button"
      onClick={onSelect}
      title={`${meta.title}：${option.outputName}。${meta.description}`}
      className={cn(
        'aw-variable-menu-item mt-1 flex w-full items-start gap-2 rounded-xl px-2 py-2 text-left transition-colors',
        selected ? 'bg-blue-400/14 text-blue-50' : 'text-slate-300 hover:bg-white/8 hover:text-white',
      )}
    >
      <span className={cn('mt-0.5 flex h-5 min-w-12 items-center justify-center rounded-full border px-1.5 text-[9px] leading-none', meta.badgeClass)}>
        {meta.title}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[11px] font-semibold leading-4">{option.outputName}</span>
          {selected && <Check className="h-3 w-3 shrink-0 text-blue-200" />}
        </span>
        <span className="mt-0.5 block truncate text-[9px] leading-3 text-slate-500">{meta.description}</span>
      </span>
      <TypeBadge type={option.type} muted />
    </button>
  )
}

function getLoopEntryOptionMeta(option: WorkflowVariableSource) {
  if (option.outputName === 'index' || option.description?.startsWith('index 下标')) {
    return {
      title: '下标',
      description: '当前元素在数组中的位置，从 0 开始',
      badgeClass: 'border-amber-300/18 bg-amber-400/10 text-amber-100',
    }
  }
  return {
    title: '元素',
    description: '数组当前项的值，每轮循环自动切换',
    badgeClass: 'border-cyan-300/18 bg-cyan-400/10 text-cyan-100',
  }
}

function TypeBadge({ type, muted = false }: { type: string; muted?: boolean }) {
  return (
    <span className={cn('aw-variable-type-badge shrink-0 rounded bg-white/6 px-1 py-0.5', muted ? 'text-slate-500' : 'text-slate-400')}>
      {formatValueType(type)}
    </span>
  )
}
