import { useCallback, useState } from 'react'
import {
  AlertCircle,
  ChevronDown,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  Server,
} from 'lucide-react'

import type { SandboxImageSummary, SandboxStatus, SandboxSummary } from '@/api/sandbox-pool'
import type { WorkflowSandboxSession } from '@/api/workflow'
import {
  WorkflowSandboxActionTabs,
  type WorkflowSandboxActionMode,
} from '@/features/workflow/components/workflow-sandbox-action-tabs'
import { WorkflowSandboxCreateSection } from '@/features/workflow/components/workflow-sandbox-create-section'
import { WorkflowSandboxExistingSection } from '@/features/workflow/components/workflow-sandbox-existing-section'
import { WorkflowSandboxLifecycleSummary } from '@/features/workflow/components/workflow-sandbox-lifecycle-summary'
import { cn } from '@/lib/utils'

interface WorkflowSandboxStatusMenuProps {
  availableSandboxes: SandboxSummary[]
  availableSandboxesHasNextPage: boolean
  availableSandboxesHasPreviousPage: boolean
  availableSandboxesLoading: boolean
  availableSandboxesPageIndex: number
  canUseSandboxSession: boolean
  error: string
  loading: boolean
  sandbox: SandboxSummary | null
  sandboxImages: SandboxImageSummary[]
  sandboxImagesLoading: boolean
  session: WorkflowSandboxSession | null
  statusPolling: boolean
  updating: boolean
  onAssociateSandbox: (sandboxId: string) => Promise<unknown>
  onCreateSandbox: (imageId: string, ttlSeconds: string) => Promise<unknown>
  onLoadNextAvailableSandboxes: () => Promise<unknown> | void
  onLoadPreviousAvailableSandboxes: () => Promise<unknown> | void
  onRefresh: () => Promise<unknown> | void
  onRefreshAvailableSandboxes: () => Promise<unknown> | void
  onRefreshSandboxImages: () => Promise<unknown> | void
}

export function WorkflowSandboxStatusMenu({
  availableSandboxes,
  availableSandboxesHasNextPage,
  availableSandboxesHasPreviousPage,
  availableSandboxesLoading,
  availableSandboxesPageIndex,
  canUseSandboxSession,
  error,
  loading,
  sandbox,
  sandboxImages,
  sandboxImagesLoading,
  session,
  statusPolling,
  updating,
  onAssociateSandbox,
  onCreateSandbox,
  onLoadNextAvailableSandboxes,
  onLoadPreviousAvailableSandboxes,
  onRefresh,
  onRefreshAvailableSandboxes,
  onRefreshSandboxImages,
}: WorkflowSandboxStatusMenuProps) {
  const [open, setOpen] = useState(false)
  const [actionMode, setActionMode] = useState<WorkflowSandboxActionMode>('create')
  const hasBinding = Boolean(session?.sandboxId)
  const busy = loading || updating
  const statusLabel = loading
    ? '加载中'
    : sandbox?.expired
      ? '已过期'
    : statusPolling && sandbox?.status !== 'Running'
      ? '刷新中'
    : !canUseSandboxSession
      ? '需保存'
      : sandbox
        ? sandboxStatusLabel(sandbox.status)
        : hasBinding
          ? '状态未知'
          : '未绑定'
  const statusClassName = sandboxStatusClassName(
    sandbox?.status,
    canUseSandboxSession,
    hasBinding,
    statusPolling,
    Boolean(sandbox?.expired),
  )

  const openMenu = useCallback(() => {
    setOpen((value) => {
      const nextOpen = !value
      if (nextOpen) {
        void onRefreshAvailableSandboxes()
        void onRefreshSandboxImages()
      }
      return nextOpen
    })
  }, [onRefreshAvailableSandboxes, onRefreshSandboxImages])

  const selectActionMode = useCallback(
    (mode: WorkflowSandboxActionMode) => {
      setActionMode(mode)
      if (mode === 'create') {
        void onRefreshSandboxImages()
      } else {
        void onRefreshAvailableSandboxes()
      }
    },
    [onRefreshAvailableSandboxes, onRefreshSandboxImages],
  )

  return (
    <div className="relative">
      <button
        type="button"
        onClick={openMenu}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-emerald-300/18 bg-emerald-400/[0.10] px-3 text-sm font-semibold text-emerald-50 shadow-[0_12px_30px_rgba(5,150,105,0.10)] backdrop-blur transition hover:border-emerald-200/34 hover:bg-emerald-400/[0.16]"
        aria-expanded={open}
        aria-label="查看当前工作流调试沙箱"
      >
        {loading ? <LoaderCircle className="h-4 w-4 animate-spin text-emerald-200" /> : <Server className="h-4 w-4 text-emerald-200" />}
        <span className="hidden 2xl:inline">沙箱</span>
        <span className={cn('rounded-full border px-2 py-0.5 text-[11px]', statusClassName)}>
          {statusLabel}
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-emerald-100/70 transition', open && 'rotate-180')} />
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+10px)] z-40 w-[440px] overflow-hidden rounded-[22px] border border-white/10 bg-slate-950/96 p-3 shadow-[0_24px_80px_rgba(2,6,23,0.48)] backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">调试沙箱</p>
              <p className="mt-1 text-xs text-slate-500">用于编码节点 code 编辑与调试</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className={cn('rounded-xl border px-2.5 py-1 text-xs', statusClassName)}>{statusLabel}</span>
              <button
                type="button"
                onClick={() => void onRefresh()}
                disabled={busy || !canUseSandboxSession}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-400 transition hover:border-blue-300/24 hover:text-blue-100 disabled:cursor-not-allowed disabled:opacity-45"
                title="刷新沙箱状态"
                aria-label="刷新沙箱状态"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              </button>
            </div>
          </div>

          {session?.sandboxId ? (
            <div className="mt-3 rounded-2xl border border-emerald-300/14 bg-emerald-400/[0.07] p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] text-slate-500">当前绑定</p>
                  <p className="mt-1 truncate font-mono text-xs text-slate-100">{session.sandboxId}</p>
                </div>
                {session.sandboxUrl ? (
                  <a
                    href={session.sandboxUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-slate-950/42 px-2.5 text-xs font-semibold text-slate-200 transition hover:border-emerald-300/30 hover:text-emerald-100"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    打开
                  </a>
                ) : null}
              </div>
              {sandbox ? <WorkflowSandboxLifecycleSummary sandbox={sandbox} /> : null}
              {statusPolling ? (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-sky-300/18 bg-sky-400/10 px-3 py-2 text-xs text-sky-100">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  正在刷新沙箱状态，最多 3 分钟，每 500ms 查询一次。
                </div>
              ) : null}
            </div>
          ) : null}

          {!canUseSandboxSession ? (
            <WorkflowSandboxNotice tone="warn" message="先保存一次 workflow，生成稳定 ID 后即可关联沙箱。" />
          ) : null}
          {error ? <WorkflowSandboxNotice tone="error" message={error} /> : null}

          <div className="mt-3 rounded-2xl border border-white/8 bg-slate-950/42 p-2.5">
            <WorkflowSandboxActionTabs value={actionMode} onChange={selectActionMode} />

            <div className="mt-2">
              {actionMode === 'create' ? (
                <WorkflowSandboxCreateSection
                  busy={busy}
                  canUseSandboxSession={canUseSandboxSession}
                  images={sandboxImages}
                  imagesLoading={sandboxImagesLoading}
                  statusPolling={statusPolling}
                  updating={updating}
                  onCreateSandbox={onCreateSandbox}
                  onRefreshImages={onRefreshSandboxImages}
                />
              ) : (
                <WorkflowSandboxExistingSection
                  busy={busy}
                  canUseSandboxSession={canUseSandboxSession}
                  hasNextPage={availableSandboxesHasNextPage}
                  hasPreviousPage={availableSandboxesHasPreviousPage}
                  loading={availableSandboxesLoading}
                  pageIndex={availableSandboxesPageIndex}
                  sandboxes={availableSandboxes}
                  session={session}
                  updating={updating}
                  onAssociateSandbox={onAssociateSandbox}
                  onLoadNextPage={onLoadNextAvailableSandboxes}
                  onLoadPreviousPage={onLoadPreviousAvailableSandboxes}
                  onRefresh={onRefreshAvailableSandboxes}
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function WorkflowSandboxNotice({ message, tone }: { message: string; tone: 'error' | 'warn' }) {
  return (
    <div
      className={cn(
        'mt-3 flex gap-2 rounded-xl border px-3 py-2 text-xs leading-5',
        tone === 'error'
          ? 'border-rose-300/18 bg-rose-400/10 text-rose-100'
          : 'border-amber-300/18 bg-amber-400/10 text-amber-100',
      )}
    >
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {message}
    </div>
  )
}

function sandboxStatusLabel(status?: SandboxStatus) {
  const labels: Record<SandboxStatus, string> = {
    Pending: '创建中',
    Running: '运行中',
    Succeeded: '已完成',
    Failed: '异常',
    Unknown: '未知',
  }
  return status ? labels[status] : '未绑定'
}

function sandboxStatusClassName(
  status: SandboxStatus | undefined,
  canUseSandboxSession: boolean,
  hasBinding: boolean,
  statusPolling: boolean,
  expired: boolean,
) {
  if (!canUseSandboxSession) {
    return 'border-amber-300/24 bg-amber-400/10 text-amber-100'
  }
  if (expired) {
    return 'border-rose-300/24 bg-rose-400/10 text-rose-100'
  }
  if (statusPolling && status !== 'Running') {
    return 'border-sky-300/24 bg-sky-400/10 text-sky-100'
  }
  if (status === 'Running') {
    return 'border-emerald-300/24 bg-emerald-400/10 text-emerald-100'
  }
  if (status === 'Pending') {
    return 'border-sky-300/24 bg-sky-400/10 text-sky-100'
  }
  if (status === 'Failed') {
    return 'border-rose-300/24 bg-rose-400/10 text-rose-100'
  }
  if (hasBinding) {
    return 'border-amber-300/24 bg-amber-400/10 text-amber-100'
  }
  return 'border-white/10 bg-slate-950/36 text-slate-300'
}
