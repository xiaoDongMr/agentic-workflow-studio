import { AlertCircle, CheckCircle2, Clock3, FileCode2, ScrollText } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { WorkflowNodeConfig } from '@/types/workflow'

import {
  CODE_AUTHORING_OPTIONS,
  CODE_EXECUTION_CAPABILITY_OPTIONS,
  CODE_SYNC_STATUS_LABELS,
  type CodeAuthoringMode,
  type CodeExecutionCapability,
} from './code-node-constants'

export function CodeNodeSummary({
  codeMode,
  capability,
  entryFunction,
  fileName,
  filePath,
  syncStatus,
}: {
  codeMode: CodeAuthoringMode
  capability: CodeExecutionCapability
  entryFunction: string
  fileName: string
  filePath: string
  syncStatus: NonNullable<WorkflowNodeConfig['codeSyncStatus']>
}) {
  const isSnippetMode = codeMode === 'sandbox_snippet'
  const isBrowser = capability === 'browser'
  return (
    <div className="rounded-[20px] border border-emerald-300/14 bg-[radial-gradient(circle_at_12%_0%,rgba(16,185,129,0.16),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.78),rgba(2,6,23,0.72))] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{isBrowser ? '浏览器自动化执行' : 'Python 代码执行'}</p>
          <p className="mt-1 truncate text-[11px] text-emerald-100/70" title={filePath || '脚本片段随节点配置保存'}>
            {isSnippetMode ? '脚本片段随节点配置保存，不创建入口文件。' : fileName}
          </p>
        </div>
        <StatusPill status={syncStatus} />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <SummaryTile label="执行能力" value={isBrowser ? '浏览器操作' : 'Python'} />
        <SummaryTile label="编码模式" value={isSnippetMode ? '脚本片段' : '沙箱文件'} />
        <SummaryTile label={isSnippetMode ? '入口方式' : '入口函数'} value={isSnippetMode ? '直接执行' : entryFunction || 'main'} />
      </div>
    </div>
  )
}

export function CodeCapabilitySwitch({
  value,
  onChange,
}: {
  value: CodeExecutionCapability
  onChange: (value: CodeExecutionCapability) => void
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/42 p-1">
      <div className="grid gap-1 sm:grid-cols-2">
        {CODE_EXECUTION_CAPABILITY_OPTIONS.map((option) => {
          const active = value === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={cn(
                'rounded-xl border px-3 py-2 text-left transition',
                active
                  ? 'border-sky-300/28 bg-sky-400/10 text-sky-50'
                  : 'border-transparent text-slate-400 hover:bg-white/[0.04] hover:text-slate-200',
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold">{option.title}</span>
                <span className="rounded-lg bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-slate-500">
                  {option.description}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function CodeModeSwitch({
  value,
  onChange,
}: {
  value: CodeAuthoringMode
  onChange: (value: CodeAuthoringMode) => void
}) {
  return (
    <div className="mb-3 grid gap-2 sm:grid-cols-2">
      {CODE_AUTHORING_OPTIONS.map((option) => {
        const active = value === option.value
        const Icon = option.value === 'sandbox_snippet' ? ScrollText : FileCode2
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'group relative overflow-hidden rounded-2xl border px-3 py-3 text-left transition',
              active
                ? 'border-emerald-300/28 bg-[linear-gradient(135deg,rgba(16,185,129,0.16),rgba(15,23,42,0.68))] text-emerald-50 shadow-[0_0_0_1px_rgba(16,185,129,0.08),0_14px_32px_rgba(16,185,129,0.08)]'
                : 'border-white/8 bg-slate-950/34 text-slate-400 hover:border-white/14 hover:bg-white/[0.045] hover:text-slate-200',
            )}
          >
            {active ? (
              <span className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-emerald-200/50 to-transparent" />
            ) : null}
            <span className="flex items-start gap-2.5">
              <span
                className={cn(
                  'mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition',
                  active
                    ? 'border-emerald-300/24 bg-emerald-300/12 text-emerald-100'
                    : 'border-white/8 bg-white/[0.03] text-slate-500 group-hover:text-slate-300',
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">{option.title}</span>
                  {active ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/18 bg-emerald-300/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-100">
                      <CheckCircle2 className="h-3 w-3" />
                      当前
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block text-[11px] leading-4 text-slate-500 group-hover:text-slate-400">
                  {option.description}
                </span>
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function CodeMetaBadge({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/8 bg-slate-950/52 px-2 py-1 text-[10px] text-slate-400">
      {label}
      <span className="text-[11px] font-semibold text-emerald-100">{value}</span>
    </span>
  )
}

export function SandboxBindingHint({ syncStatus }: { syncStatus: NonNullable<WorkflowNodeConfig['codeSyncStatus']> }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/56 p-3">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white">使用当前 workflow 绑定的调试沙箱</p>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">
            如未绑定、沙箱未运行或已过期，请先在顶部“沙箱”菜单创建或关联可用沙箱。
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-slate-950/70 px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
          <Clock3 className="h-3.5 w-3.5" />
          代码同步状态
        </span>
        <StatusPill status={syncStatus} />
      </div>
    </div>
  )
}

export function StatusPill({ status }: { status: NonNullable<WorkflowNodeConfig['codeSyncStatus']> }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-xl border px-2 py-1 text-[10px] font-semibold',
        status === 'saved' && 'border-emerald-300/18 bg-emerald-400/10 text-emerald-100',
        status === 'dirty' && 'border-amber-300/18 bg-amber-400/10 text-amber-100',
        status === 'saving' && 'border-sky-300/18 bg-sky-400/10 text-sky-100',
        status === 'failed' && 'border-rose-300/18 bg-rose-400/10 text-rose-100',
      )}
    >
      {CODE_SYNC_STATUS_LABELS[status]}
    </span>
  )
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/8 bg-slate-950/48 px-2.5 py-2">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="mt-1 truncate text-[11px] font-semibold text-slate-100" title={value}>
        {value}
      </p>
    </div>
  )
}
