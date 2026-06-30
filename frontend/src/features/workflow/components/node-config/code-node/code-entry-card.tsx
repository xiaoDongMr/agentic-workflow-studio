import { Copy, ExternalLink, FolderOpen, LoaderCircle, Maximize2 } from 'lucide-react'

import { EditableField } from '@/features/workflow/components/node-config/config-fields'
import type { WorkflowNodeConfig } from '@/types/workflow'

import { type CodeWorkspaceOpeningMode } from './code-node-constants'
import { CodeMetaBadge, StatusPill } from './code-node-ui'

interface CodeEntryCardProps {
  canOpenCode: boolean
  copiedPath: boolean
  entryFunction: string
  fileName: string
  filePath: string
  language: string
  openMessage: string
  syncStatus: NonNullable<WorkflowNodeConfig['codeSyncStatus']>
  workspaceError: string
  onCopyPath: () => void
  onEntryFunctionChange: (value: string) => void
  onOpenCode: () => void
  onOpenExternal: () => void
  openingMode: CodeWorkspaceOpeningMode
}

export function CodeEntryCard({
  canOpenCode,
  copiedPath,
  entryFunction,
  fileName,
  filePath,
  language,
  openMessage,
  syncStatus,
  workspaceError,
  onCopyPath,
  onEntryFunctionChange,
  onOpenCode,
  onOpenExternal,
  openingMode,
}: CodeEntryCardProps) {
  return (
    <div className="rounded-2xl border border-emerald-300/14 bg-[linear-gradient(135deg,rgba(16,185,129,0.08),rgba(15,23,42,0.72))] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-50">
            <FolderOpen className="h-3.5 w-3.5 text-emerald-200" />
            沙箱 Code 工作区
          </p>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">
            点击打开时会在当前绑定沙箱中创建节点目录和入口文件，已有文件不会覆盖。
          </p>
        </div>
        <StatusPill status={syncStatus} />
      </div>

      <div className="mt-3 rounded-xl border border-white/8 bg-slate-950/58 p-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] text-slate-500">入口文件</p>
            <p className="mt-1 font-mono text-xs font-semibold text-emerald-100" title={filePath}>
              {fileName}
            </p>
            <p className="mt-1 truncate font-mono text-[10px] text-slate-500" title={filePath}>
              {filePath}
            </p>
          </div>
          <button
            type="button"
            onClick={onCopyPath}
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.04] px-2 text-[11px] text-slate-300 transition hover:border-emerald-300/24 hover:text-emerald-100"
          >
            <Copy className="h-3.5 w-3.5" />
            {copiedPath ? '已复制' : '复制'}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <CodeMetaBadge label="语言" value={language} />
          <CodeMetaBadge label="来源" value="沙箱文件" />
          <CodeMetaBadge label="目录" value="按节点隔离" />
        </div>
      </div>

      <div className="mt-3 grid gap-2.5">
        <EditableField
          label="入口函数"
          value={entryFunction}
          placeholder="main"
          onChange={onEntryFunctionChange}
        />
      </div>

      <div className="mt-3 flex flex-col gap-2 rounded-xl border border-white/8 bg-slate-950/45 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] leading-4 text-slate-500">{openMessage}</p>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenCode}
              disabled={!canOpenCode}
              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 text-xs font-semibold text-emerald-50 transition hover:border-emerald-200/34 hover:bg-emerald-400/16 disabled:cursor-not-allowed disabled:border-white/8 disabled:bg-white/[0.04] disabled:text-slate-500"
            >
              {openingMode === 'drawer' ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
              应用内打开
            </button>
            <button
              type="button"
              onClick={onOpenExternal}
              disabled={!canOpenCode}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/8 bg-white/[0.04] text-slate-300 transition hover:border-emerald-300/24 hover:text-emerald-100 disabled:cursor-not-allowed disabled:text-slate-600"
              aria-label="新标签页打开沙箱 Code"
              title="新标签页打开"
            >
              {openingMode === 'external' ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ExternalLink className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
        {workspaceError ? (
          <p className="rounded-lg border border-rose-300/18 bg-rose-400/10 px-2.5 py-2 text-[11px] leading-4 text-rose-100">
            {workspaceError}
          </p>
        ) : null}
      </div>
    </div>
  )
}
