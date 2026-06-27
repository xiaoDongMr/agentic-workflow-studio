import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, ChevronDown, Search } from 'lucide-react'

import { cn } from '@/lib/utils'

const DROPDOWN_GAP = 8
const DROPDOWN_MAX_HEIGHT = 360
const DROPDOWN_MIN_HEIGHT = 180
const DROPDOWN_PREFERRED_MIN_SPACE = 240

interface DropdownRect {
  left: number
  top: number
  width: number
  maxHeight: number
}

const defaultDropdownRect: DropdownRect = {
  left: 0,
  top: 0,
  width: 0,
  maxHeight: DROPDOWN_MAX_HEIGHT,
}

export interface SearchableSelectOption {
  value: string
  label: string
  description?: string
}

export function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = '请选择',
  searchPlaceholder = '搜索',
  disabled = false,
  className,
}: {
  value: string
  options: SearchableSelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [dropdownRect, setDropdownRect] = useState<DropdownRect>(defaultDropdownRect)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const selectedOption = options.find((option) => option.value === value)
  const visibleOptions = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return keyword
      ? options.filter((option) => `${option.label} ${option.description ?? ''}`.toLowerCase().includes(keyword))
      : options
  }, [options, query])

  const closeDropdown = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      return
    }

    const updateDropdownRect = () => {
      const rect = rootRef.current?.getBoundingClientRect()
      if (!rect) {
        return
      }

      setDropdownRect(getDropdownRect(rect))
    }

    updateDropdownRect()
    window.addEventListener('resize', updateDropdownRect)
    window.addEventListener('scroll', updateDropdownRect, true)
    return () => {
      window.removeEventListener('resize', updateDropdownRect)
      window.removeEventListener('scroll', updateDropdownRect, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || dropdownRef.current?.contains(target)) {
        return
      }
      closeDropdown()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDropdown()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeDropdown, open])

  return (
    <div
      ref={rootRef}
      className={cn('relative', className)}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (open) {
            closeDropdown()
            return
          }
          setOpen(true)
        }}
        className={cn(
          'flex h-10 w-full items-center justify-between gap-3 rounded-2xl border border-white/8 bg-slate-950/70 px-3.5 text-left text-xs text-slate-100 outline-none transition hover:border-blue-300/22 hover:bg-slate-900/80',
          open && 'border-blue-300/28 bg-slate-900/90',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <span className="min-w-0 truncate">{selectedOption?.label || placeholder}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-500 transition', open && 'rotate-180 text-blue-200')} />
      </button>

      {open
        ? createPortal(
            <SearchableSelectDropdown
              dropdownRef={dropdownRef}
              options={visibleOptions}
              totalOptions={options.length}
              value={value}
              query={query}
              rect={dropdownRect}
              searchPlaceholder={searchPlaceholder}
              onChangeQuery={setQuery}
              onSelect={(nextValue) => {
                onChange(nextValue)
                closeDropdown()
              }}
            />,
            document.body,
          )
        : null}
    </div>
  )
}

function getDropdownRect(anchorRect: DOMRect): DropdownRect {
  const spaceBelow = window.innerHeight - anchorRect.bottom - DROPDOWN_GAP
  const spaceAbove = anchorRect.top - DROPDOWN_GAP
  const openDownward = spaceBelow >= DROPDOWN_PREFERRED_MIN_SPACE || spaceBelow >= spaceAbove
  const availableSpace = openDownward ? spaceBelow : spaceAbove
  const maxHeight = Math.max(DROPDOWN_MIN_HEIGHT, Math.min(DROPDOWN_MAX_HEIGHT, availableSpace))

  return {
    left: anchorRect.left,
    top: openDownward
      ? anchorRect.bottom + DROPDOWN_GAP
      : Math.max(DROPDOWN_GAP, anchorRect.top - DROPDOWN_GAP - maxHeight),
    width: anchorRect.width,
    maxHeight,
  }
}

const SearchableSelectDropdown = ({
  dropdownRef,
  options,
  totalOptions,
  value,
  query,
  rect,
  searchPlaceholder,
  onChangeQuery,
  onSelect,
}: {
  dropdownRef: RefObject<HTMLDivElement>
  options: SearchableSelectOption[]
  totalOptions: number
  value: string
  query: string
  rect: DropdownRect
  searchPlaceholder: string
  onChangeQuery: (query: string) => void
  onSelect: (value: string) => void
}) => (
  <div
    ref={dropdownRef}
    className="fixed z-[1000] flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-[0_22px_80px_rgba(2,6,23,0.55)]"
    style={{
      left: rect.left,
      top: rect.top,
      width: rect.width,
      maxHeight: rect.maxHeight,
    }}
  >
    <div className="shrink-0 border-b border-white/8 p-2">
      <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-slate-900/70 px-2.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        <input
          autoFocus
          value={query}
          onChange={(event) => onChangeQuery(event.target.value)}
          placeholder={searchPlaceholder}
          className="h-8 min-w-0 flex-1 bg-transparent text-xs text-slate-100 outline-none placeholder:text-slate-600"
        />
      </div>
    </div>

    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
      {options.length === 0 ? (
        <div className="px-3 py-3 text-xs text-slate-500">没有匹配项</div>
      ) : (
        options.map((option) => (
          <SearchableSelectOptionRow
            key={option.value || '__empty__'}
            active={option.value === value}
            option={option}
            onSelect={onSelect}
          />
        ))
      )}
    </div>

    {totalOptions > 10 ? (
      <div className="shrink-0 border-t border-white/8 px-3 py-2 text-[11px] text-slate-600">
        共 {options.length} 条{query.trim() ? '匹配结果' : '选项'}，可滚动浏览或输入关键字筛选
      </div>
    ) : null}
  </div>
)

function SearchableSelectOptionRow({
  active,
  option,
  onSelect,
}: {
  active: boolean
  option: SearchableSelectOption
  onSelect: (value: string) => void
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onSelect(option.value)}
      className={cn(
        'flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2 text-left text-xs transition',
        active ? 'bg-blue-400/12 text-blue-50' : 'text-slate-300 hover:bg-white/[0.055] hover:text-white',
      )}
    >
      <span className="min-w-0">
        <span className="block truncate font-medium">{option.label}</span>
        {option.description ? <span className="mt-0.5 block truncate text-[11px] text-slate-500">{option.description}</span> : null}
      </span>
      {active ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-200" /> : null}
    </button>
  )
}
