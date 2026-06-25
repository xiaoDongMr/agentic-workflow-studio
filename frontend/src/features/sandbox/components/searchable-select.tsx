import { useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, Search } from 'lucide-react'

import { cn } from '@/lib/utils'

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
  const selectedOption = options.find((option) => option.value === value)
  const visibleOptions = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    const filtered = keyword
      ? options.filter((option) => `${option.label} ${option.description ?? ''}`.toLowerCase().includes(keyword))
      : options
    return filtered.slice(0, 10)
  }, [options, query])

  return (
    <div
      className={cn('relative', className)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false)
          setQuery('')
        }
      }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'flex h-10 w-full items-center justify-between gap-3 rounded-2xl border border-white/8 bg-slate-950/70 px-3.5 text-left text-xs text-slate-100 outline-none transition hover:border-blue-300/22 hover:bg-slate-900/80',
          open && 'border-blue-300/28 bg-slate-900/90',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <span className="min-w-0 truncate">{selectedOption?.label || placeholder}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-500 transition', open && 'rotate-180 text-blue-200')} />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-[0_22px_80px_rgba(2,6,23,0.48)]">
          <div className="border-b border-white/8 p-2">
            <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-slate-900/70 px-2.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                className="h-8 min-w-0 flex-1 bg-transparent text-xs text-slate-100 outline-none placeholder:text-slate-600"
              />
            </div>
          </div>
          <div className="max-h-[280px] overflow-y-auto p-1.5">
            {visibleOptions.length === 0 ? (
              <div className="px-3 py-3 text-xs text-slate-500">没有匹配项</div>
            ) : (
              visibleOptions.map((option) => {
                const active = option.value === value
                return (
                  <button
                    key={option.value || '__empty__'}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onChange(option.value)
                      setOpen(false)
                      setQuery('')
                    }}
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
              })
            )}
          </div>
          {options.length > 10 && !query.trim() ? (
            <div className="border-t border-white/8 px-3 py-2 text-[11px] text-slate-600">默认展示前 10 条，可输入关键字检索更多选项</div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
