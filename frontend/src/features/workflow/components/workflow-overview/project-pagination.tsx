import { ChevronLeft, ChevronRight } from 'lucide-react'

import { cn } from '@/lib/utils'

export function ProjectPagination({
  className,
  loading,
  page,
  pageSize,
  total,
  totalPages,
  onChangePage,
}: {
  className?: string
  loading: boolean
  page: number
  pageSize: number
  total: number
  totalPages: number
  onChangePage: (page: number) => void
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  const canGoPrevious = page > 1 && !loading
  const canGoNext = page < totalPages && !loading

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-[22px] border border-white/8 bg-white/[0.035] p-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <p className="text-sm text-slate-400">
        {total > 0 ? `显示 ${start}-${end} / ${total} 个服务端项目` : '暂无可分页的服务端项目'}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!canGoPrevious}
          onClick={() => onChangePage(page - 1)}
          className="inline-flex h-9 items-center gap-1.5 rounded-2xl border border-white/8 bg-slate-950/56 px-3 text-sm font-medium text-slate-300 transition hover:border-blue-300/28 hover:text-blue-100 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <ChevronLeft className="h-4 w-4" />
          上一页
        </button>
        <span className="min-w-20 rounded-2xl border border-white/8 bg-slate-950/50 px-3 py-2 text-center text-sm text-slate-300">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={!canGoNext}
          onClick={() => onChangePage(page + 1)}
          className="inline-flex h-9 items-center gap-1.5 rounded-2xl border border-white/8 bg-slate-950/56 px-3 text-sm font-medium text-slate-300 transition hover:border-blue-300/28 hover:text-blue-100 disabled:cursor-not-allowed disabled:opacity-45"
        >
          下一页
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
