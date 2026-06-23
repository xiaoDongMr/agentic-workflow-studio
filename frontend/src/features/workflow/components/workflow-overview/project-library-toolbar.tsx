import { useEffect, useState } from 'react'
import { Filter, RefreshCw, Search } from 'lucide-react'

import type { WorkflowProjectFilter } from '@/api/workflow'
import { cn } from '@/lib/utils'

const projectFilterOptions: Array<{
  value: WorkflowProjectFilter
  label: string
  description: string
}> = [
  { value: 'all', label: '全部', description: '所有已保存项目' },
  { value: 'simple', label: '结构清晰', description: '节点和连线较少，适合看结构图' },
  { value: 'complex', label: '复杂流程', description: '节点或连线较多，适合看摘要' },
]

export function ProjectLibraryToolbar({
  filter,
  loadingProjects,
  pageSize,
  query,
  total,
  onFilterChange,
  onQueryChange,
  onRefreshProjects,
}: {
  filter: WorkflowProjectFilter
  loadingProjects: boolean
  pageSize: number
  query: string
  total: number
  onFilterChange: (filter: WorkflowProjectFilter) => void
  onQueryChange: (query: string) => void
  onRefreshProjects: () => void
}) {
  const [draftQuery, setDraftQuery] = useState(query)

  useEffect(() => {
    const normalizedDraft = draftQuery.trim()
    const normalizedQuery = query.trim()
    const timer = window.setTimeout(() => {
      if (normalizedDraft !== normalizedQuery) {
        onQueryChange(normalizedDraft)
      }
    }, 1000)

    return () => window.clearTimeout(timer)
  }, [draftQuery, onQueryChange, query])

  const clearQuery = () => {
    setDraftQuery('')
    if (query) {
      onQueryChange('')
    }
  }

  return (
    <div className="mt-4 rounded-[24px] border border-white/8 bg-white/[0.035] p-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-white/8 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-300 transition focus-within:border-blue-300/30">
          <Search className="h-4 w-4 shrink-0 text-slate-500" />
          <input
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                onQueryChange(draftQuery.trim())
              }
            }}
            placeholder="搜索名称或描述"
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-500"
          />
          {draftQuery ? (
            <button
              type="button"
              onClick={clearQuery}
              className="rounded-xl px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-white/8 hover:text-slate-200"
            >
              清空
            </button>
          ) : null}
        </label>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-white/8 bg-slate-950/60 p-1">
            <Filter className="mx-1 h-3.5 w-3.5 text-slate-500" />
            {projectFilterOptions.map((option) => (
              <ProjectFilterButton
                key={option.value}
                active={filter === option.value}
                label={option.label}
                title={option.description}
                onClick={() => onFilterChange(option.value)}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => onRefreshProjects()}
            disabled={loadingProjects}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/8 bg-slate-950/60 px-3.5 py-2 text-sm font-medium text-slate-300 transition hover:border-blue-300/28 hover:text-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={cn('h-4 w-4', loadingProjects && 'animate-spin')} />
            刷新
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>按最近更新排序</span>
        <span className="h-1 w-1 rounded-full bg-slate-700" />
        <span>每页 {pageSize} 个</span>
        <span className="h-1 w-1 rounded-full bg-slate-700" />
        <span>{total > 0 ? `共 ${total} 个结果` : '暂无结果'}</span>
        {draftQuery.trim() !== query.trim() ? (
          <>
            <span className="h-1 w-1 rounded-full bg-slate-700" />
            <span className="text-blue-200">1 秒后查询</span>
          </>
        ) : null}
      </div>
    </div>
  )
}

function ProjectFilterButton({
  active,
  label,
  title,
  onClick,
}: {
  active: boolean
  label: string
  title: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'rounded-xl px-2.5 py-1.5 text-xs font-medium transition',
        active ? 'bg-blue-400/16 text-blue-100' : 'text-slate-500 hover:bg-white/6 hover:text-slate-300',
      )}
    >
      {label}
    </button>
  )
}
