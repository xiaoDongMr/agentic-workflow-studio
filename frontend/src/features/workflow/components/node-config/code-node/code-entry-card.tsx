import { Archive, Clock3, Copy, ExternalLink, FolderOpen, Info, LoaderCircle, Maximize2, Monitor } from 'lucide-react'

import { EditableField } from '@/features/workflow/components/node-config/config-fields'
import type { WorkflowNodeConfig } from '@/types/workflow'

import { type CodeWorkspaceOpeningMode } from './code-node-constants'
import { CodeMetaBadge, StatusPill } from './code-node-ui'
import { formatBytes } from './code-workspace-package-utils'

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
  browserCapable?: boolean
  browserPreviewMessage?: string
  browserMode?: boolean
  packageMessage?: string
  packageFileCount?: number
  packageSavedAt?: string | null
  packageTotalSize?: number
  packageSaving?: boolean
  onCopyPath: () => void
  onEntryFunctionChange: (value: string) => void
  onOpenBrowserOnly?: () => void
  onOpenCode: () => void
  onOpenExternal: () => void
  onOpenHistory?: () => void
  onSaveWorkspace?: () => void
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
  browserCapable = false,
  browserPreviewMessage = '',
  browserMode = false,
  packageMessage = '',
  packageFileCount = 0,
  packageSavedAt = null,
  packageTotalSize = 0,
  packageSaving = false,
  onCopyPath,
  onEntryFunctionChange,
  onOpenBrowserOnly,
  onOpenCode,
  onOpenExternal,
  onOpenHistory,
  onSaveWorkspace,
  openingMode,
}: CodeEntryCardProps) {
  const title = browserMode ? '浏览器编码工作台' : '沙箱 Code 工作区'
  const description = browserMode
    ? '在同一个工作台中编辑浏览器脚本，并查看 AioSandbox VNC 实时画面。'
    : '点击打开时会在当前绑定沙箱中创建节点目录和入口文件，已有文件不会覆盖。'
  const environmentText = browserMode
    ? '浏览器操作会连接 AioSandbox 内置浏览器/CDP，并通过 VNC 展示实时页面。当前沙箱镜像需要包含 Playwright、浏览器运行环境和 VNC/CDP 能力。'
    : '沙箱文件会在当前绑定调试沙箱内执行，只能使用该沙箱镜像中已经安装的 Python 版本、系统工具和第三方依赖。如果代码需要额外依赖，请基于 AioSandbox 构建自定义镜像，并在创建调试沙箱时选择该镜像。'
  return (
    <div className="rounded-2xl border border-emerald-300/14 bg-[linear-gradient(135deg,rgba(16,185,129,0.08),rgba(15,23,42,0.72))] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-50">
            {browserMode ? (
              <Monitor className="h-3.5 w-3.5 text-sky-200" />
            ) : (
              <FolderOpen className="h-3.5 w-3.5 text-emerald-200" />
            )}
            {title}
          </p>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">
            {description}
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
          <CodeMetaBadge label="来源" value={browserMode ? '浏览器操作' : '沙箱文件'} />
          <CodeMetaBadge label="目录" value="按节点隔离" />
          {browserMode ? (
            <CodeMetaBadge label="预览" value="VNC" />
          ) : null}
        </div>
      </div>

      {!browserMode ? (
        <div className="mt-3 grid gap-2.5">
          <EditableField
            label="入口函数"
            value={entryFunction}
            placeholder="main"
            onChange={onEntryFunctionChange}
          />
        </div>
      ) : null}

      <div className="mt-3 rounded-xl border border-sky-300/14 bg-sky-400/[0.07] px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-100">
          <Info className="h-3.5 w-3.5 text-sky-200" />
          运行环境说明
        </p>
        <p className="mt-1.5 text-[11px] leading-5 text-slate-400">
          {environmentText}
        </p>
        {browserMode ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={browserCapable ? 'text-[11px] text-emerald-200' : 'text-[11px] text-amber-200'}>
              {browserCapable ? '镜像疑似支持 Browser 能力' : '请确认使用 AioSandbox Browser 镜像'}
            </span>
            <span className="text-[11px] text-slate-500">
              {browserPreviewMessage}
            </span>
          </div>
        ) : null}
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
              {browserMode ? '打开工作台' : '应用内打开'}
            </button>
            {browserMode && onOpenBrowserOnly ? (
              <button
                type="button"
                onClick={onOpenBrowserOnly}
                disabled={!canOpenCode}
                className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-sky-300/20 bg-sky-400/10 px-3 text-xs font-semibold text-sky-50 transition hover:border-sky-200/34 hover:bg-sky-400/16 disabled:cursor-not-allowed disabled:border-white/8 disabled:bg-white/[0.04] disabled:text-slate-500"
              >
                <Monitor className="h-3.5 w-3.5" />
                仅浏览器
              </button>
            ) : null}
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

      <div className="mt-3 overflow-hidden rounded-2xl border border-cyan-300/14 bg-[linear-gradient(135deg,rgba(8,145,178,0.10),rgba(15,23,42,0.60))]">
        <div className="flex items-start justify-between gap-3 px-3 py-3">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-50">
              <Archive className="h-3.5 w-3.5 text-cyan-200" />
              代码工作区持久化
            </p>
            <p className="mt-1.5 text-[11px] leading-5 text-slate-400" title={packageMessage || '保存 workflow 时会自动同步有变更的工作区。'}>
              {packageMessage || '保存 workflow 时会自动同步有变更的工作区。'}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            <button
              type="button"
              onClick={onSaveWorkspace}
              disabled={!canOpenCode || !onSaveWorkspace || packageSaving}
              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-cyan-300/18 bg-cyan-400/10 px-3 text-xs font-semibold text-cyan-50 transition hover:border-cyan-200/34 hover:bg-cyan-400/16 disabled:cursor-not-allowed disabled:border-white/8 disabled:bg-white/[0.04] disabled:text-slate-500"
            >
              {packageSaving ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Archive className="h-3.5 w-3.5" />
              )}
              保存工作区
            </button>
            <button
              type="button"
              onClick={onOpenHistory}
              disabled={!onOpenHistory}
              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200 transition hover:border-cyan-300/24 hover:text-cyan-100 disabled:cursor-not-allowed disabled:text-slate-600"
            >
              <Clock3 className="h-3.5 w-3.5" />
              历史
            </button>
          </div>
        </div>
        <div className="grid grid-cols-3 border-t border-white/8 bg-slate-950/28">
          <WorkspaceMetric label="文件数" value={packageFileCount ? `${packageFileCount}` : '--'} />
          <WorkspaceMetric label="大小" value={packageTotalSize ? formatBytes(packageTotalSize) : '--'} />
          <WorkspaceMetric
            label="最近保存"
            value={packageSavedAt ? new Date(packageSavedAt).toLocaleTimeString() : '--'}
          />
        </div>
      </div>
    </div>
  )
}

function WorkspaceMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-slate-100" title={value}>
        {value}
      </p>
    </div>
  )
}
