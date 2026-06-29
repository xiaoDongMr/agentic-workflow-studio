import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, LoaderCircle } from 'lucide-react'

import type { SandboxSummary } from '@/api/sandbox-pool'
import type { WorkflowSandboxSession } from '@/api/workflow'
import { formatExpiresAt } from '@/features/sandbox/sandbox-pool-utils'
import { cn } from '@/lib/utils'

interface WorkflowSandboxExistingSectionProps {
  busy: boolean
  canUseSandboxSession: boolean
  hasNextPage: boolean
  hasPreviousPage: boolean
  loading: boolean
  pageIndex: number
  sandboxes: SandboxSummary[]
  session: WorkflowSandboxSession | null
  updating: boolean
  onAssociateSandbox: (sandboxId: string) => Promise<unknown>
  onLoadNextPage: () => Promise<unknown> | void
  onLoadPreviousPage: () => Promise<unknown> | void
  onRefresh: () => Promise<unknown> | void
}

export function WorkflowSandboxExistingSection({
  busy,
  canUseSandboxSession,
  hasNextPage,
  hasPreviousPage,
  loading,
  pageIndex,
  sandboxes,
  session,
  updating,
  onAssociateSandbox,
  onLoadNextPage,
  onLoadPreviousPage,
  onRefresh,
}: WorkflowSandboxExistingSectionProps) {
  const [sandboxId, setSandboxId] = useState('')

  const associateSandboxByInput = useCallback(async () => {
    const nextSandboxId = sandboxId.trim()
    if (!nextSandboxId || busy || !canUseSandboxSession) {
      return
    }

    const result = await onAssociateSandbox(nextSandboxId)
    if (result) {
      setSandboxId('')
    }
  }, [busy, canUseSandboxSession, onAssociateSandbox, sandboxId])

  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/46 p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-300">关联已有沙箱</p>
          <p className="mt-0.5 text-[11px] text-slate-600">运行中沙箱列表按游标分页加载</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-lg border border-white/8 bg-white/[0.035] px-2 py-1 text-[11px] text-slate-500">
            第 {pageIndex} 页
          </span>
          <button
            type="button"
            onClick={() => void onRefresh()}
            disabled={loading || !canUseSandboxSession}
            className="text-[11px] text-slate-500 transition hover:text-blue-100 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {loading ? '加载中' : '刷新'}
          </button>
        </div>
      </div>

      <SandboxPageList
        busy={busy}
        canUseSandboxSession={canUseSandboxSession}
        loading={loading}
        sandboxes={sandboxes}
        selectedSandboxId={session?.sandboxId ?? ''}
        onAssociateSandbox={onAssociateSandbox}
      />

      <div className="mb-2 flex items-center justify-between gap-2">
        <PageButton
          disabled={busy || loading || !hasPreviousPage}
          icon={<ArrowLeft className="h-3 w-3" />}
          label="上一页"
          onClick={onLoadPreviousPage}
        />
        <PageButton
          disabled={busy || loading || !hasNextPage}
          icon={<ArrowRight className="h-3 w-3" />}
          iconPosition="right"
          label="下一页"
          onClick={onLoadNextPage}
        />
      </div>

      <div className="flex gap-2">
        <input
          value={sandboxId}
          onChange={(event) => setSandboxId(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void associateSandboxByInput()
            }
          }}
          placeholder="粘贴 sandbox id，回车关联"
          disabled={busy || !canUseSandboxSession}
          className="min-w-0 flex-1 rounded-xl border border-white/8 bg-slate-950/70 px-3 py-2 font-mono text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-blue-300/50 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => void associateSandboxByInput()}
          disabled={busy || !canUseSandboxSession || !sandboxId.trim()}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-blue-300/24 bg-blue-500/16 px-3 py-2 text-xs font-semibold text-blue-50 transition hover:border-blue-200/40 hover:bg-blue-500/24 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {updating ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          关联
        </button>
      </div>
    </div>
  )
}

function SandboxPageList({
  busy,
  canUseSandboxSession,
  loading,
  sandboxes,
  selectedSandboxId,
  onAssociateSandbox,
}: {
  busy: boolean
  canUseSandboxSession: boolean
  loading: boolean
  sandboxes: SandboxSummary[]
  selectedSandboxId: string
  onAssociateSandbox: (sandboxId: string) => Promise<unknown>
}) {
  if (sandboxes.length === 0) {
    return (
      <div className="mb-2 rounded-xl border border-dashed border-white/10 px-3 py-3 text-center text-[11px] text-slate-500">
        {loading ? '正在加载运行中沙箱' : '暂无可直接选择的运行中沙箱'}
      </div>
    )
  }

  return (
    <div className="mb-2 grid max-h-[226px] gap-1.5 overflow-y-auto pr-1">
      {sandboxes.map((sandbox) => (
        <SandboxListItem
          key={sandbox.sandboxId}
          disabled={busy || !canUseSandboxSession || sandbox.expired}
          sandbox={sandbox}
          selected={sandbox.sandboxId === selectedSandboxId}
          onAssociateSandbox={onAssociateSandbox}
        />
      ))}
    </div>
  )
}

function SandboxListItem({
  disabled,
  sandbox,
  selected,
  onAssociateSandbox,
}: {
  disabled: boolean
  sandbox: SandboxSummary
  selected: boolean
  onAssociateSandbox: (sandboxId: string) => Promise<unknown>
}) {
  return (
    <button
      type="button"
      onClick={() => void onAssociateSandbox(sandbox.sandboxId)}
      disabled={disabled || selected}
      className={cn(
        'flex min-w-0 items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-60',
        selected
          ? 'border-emerald-300/20 bg-emerald-400/10'
          : 'border-white/8 bg-white/[0.03] hover:border-blue-300/24 hover:bg-white/[0.055]',
      )}
    >
      <span className="min-w-0">
        <span className="block truncate font-mono text-xs text-slate-100">{sandbox.sandboxId}</span>
        <span className="mt-0.5 block truncate text-[11px] text-slate-500">
          {sandbox.expiresAt
            ? `过期：${formatExpiresAt(sandbox.expiresAt)}`
            : sandbox.sandboxUrl || sandbox.image || '运行中'}
        </span>
      </span>
      <span className="shrink-0 rounded-lg border border-emerald-300/18 bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-100">
        {sandbox.expired ? '过期' : selected ? '当前' : '选择'}
      </span>
    </button>
  )
}

function PageButton({
  disabled,
  icon,
  iconPosition = 'left',
  label,
  onClick,
}: {
  disabled: boolean
  icon: ReactNode
  iconPosition?: 'left' | 'right'
  label: string
  onClick: () => Promise<unknown> | void
}) {
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={disabled}
      className="inline-flex h-7 items-center gap-1 rounded-lg border border-white/8 bg-white/[0.035] px-2 text-[11px] text-slate-300 transition hover:border-blue-300/22 hover:text-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {iconPosition === 'left' ? icon : null}
      {label}
      {iconPosition === 'right' ? icon : null}
    </button>
  )
}
