import { Archive, Clock3, FileArchive, LoaderCircle, RotateCcw, X } from 'lucide-react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'

import type { WorkflowCodePackageSummary } from '@/api/workflow'
import { cn } from '@/lib/utils'

import { formatBytes } from './code-workspace-package-utils'

interface CodeWorkspaceHistoryDrawerProps {
  packages: WorkflowCodePackageSummary[]
  restoringPackageId: string
  onClose: () => void
  onRestore: (packageId: string) => void
}

export function CodeWorkspaceHistoryDrawer({
  packages,
  restoringPackageId,
  onClose,
  onRestore,
}: CodeWorkspaceHistoryDrawerProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = originalOverflow
    }
  }, [onClose])

  if (typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-950/78 p-4 backdrop-blur-sm">
      <div className="flex h-[min(760px,calc(100vh_-_32px))] w-[min(760px,calc(100vw_-_32px))] flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl shadow-black/45">
        <div className="border-b border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.13),transparent_36%),rgba(255,255,255,0.03)] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                <Clock3 className="h-4 w-4 text-cyan-200" />
                代码工作区历史
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                选择历史 package 恢复到当前沙箱，历史记录本身不会被修改。
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.04] text-slate-300 transition hover:border-rose-300/30 hover:text-rose-100"
              aria-label="关闭历史版本"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-3 overflow-hidden rounded-2xl border border-white/8 bg-slate-950/42">
            <HeaderMetric label="版本数" value={`${packages.length}`} />
            <HeaderMetric label="最新文件数" value={packages[0] ? `${packages[0].fileCount}` : '--'} />
            <HeaderMetric label="最新大小" value={packages[0] ? formatBytes(packages[0].totalSize) : '--'} />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {packages.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-10 text-center">
              <Archive className="mx-auto h-8 w-8 text-slate-500" />
              <p className="mt-3 text-sm font-semibold text-slate-200">暂无历史版本</p>
              <p className="mt-1 text-xs text-slate-500">保存工作区后会在这里生成可恢复的 package。</p>
            </div>
          ) : (
            <div className="space-y-3">
              {packages.map((item, index) => (
                <HistoryPackageCard
                  key={item.id}
                  item={item}
                  latest={index === 0}
                  restoring={restoringPackageId === item.id}
                  disabled={Boolean(restoringPackageId)}
                  onRestore={() => onRestore(item.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function HistoryPackageCard({
  item,
  latest,
  restoring,
  disabled,
  onRestore,
}: {
  item: WorkflowCodePackageSummary
  latest: boolean
  restoring: boolean
  disabled: boolean
  onRestore: () => void
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border bg-white/[0.035] p-3.5 transition hover:border-cyan-300/24 hover:bg-white/[0.05]',
        latest ? 'border-cyan-300/24 shadow-[0_0_0_1px_rgba(34,211,238,0.04)]' : 'border-white/8',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/18 bg-cyan-400/10 text-cyan-100">
            <FileArchive className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-slate-100">
                {formatSaveReason(item.saveReason)}
              </p>
              {latest ? (
                <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-100">
                  最新
                </span>
              ) : null}
              <span className="rounded-full border border-white/8 bg-white/[0.04] px-2 py-0.5 text-[10px] text-slate-400">
                {item.codeCapability === 'browser' ? '浏览器操作' : 'Python'}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              {new Date(item.createdAt).toLocaleString()}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRestore}
          disabled={disabled}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-emerald-300/18 bg-emerald-400/10 px-3 text-xs font-semibold text-emerald-50 transition hover:border-emerald-200/34 hover:bg-emerald-400/16 disabled:cursor-not-allowed disabled:border-white/8 disabled:bg-white/[0.04] disabled:text-slate-500"
        >
          {restoring ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          恢复到沙箱
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 overflow-hidden rounded-xl border border-white/8 bg-slate-950/38">
        <PackageMetric label="文件" value={`${item.fileCount}`} />
        <PackageMetric label="大小" value={formatBytes(item.totalSize)} />
        <PackageMetric label="入口" value={item.entryFile} />
      </div>
      <p className="mt-2 truncate font-mono text-[10px] text-slate-600" title={item.packageName}>
        {item.packageName}
      </p>
    </div>
  )
}

function HeaderMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-slate-100" title={value}>
        {value}
      </p>
    </div>
  )
}

function PackageMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-3 py-2">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="mt-1 truncate text-[11px] font-semibold text-slate-200" title={value}>
        {value}
      </p>
    </div>
  )
}

function formatSaveReason(reason: string) {
  if (reason === 'manual_save') {
    return '手动保存'
  }
  if (reason === 'workflow_save') {
    return '保存 workflow'
  }
  if (reason === 'publish') {
    return '发布版本'
  }
  return reason || '工作区保存'
}
