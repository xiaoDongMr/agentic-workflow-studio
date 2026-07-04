import { Code2, ExternalLink, Monitor, RefreshCw, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { createPortal } from 'react-dom'

import type { WorkflowCodeWorkspace } from '@/api/workflow'

import { cn } from '@/lib/utils'
import { useFullscreenOverlay } from '@/features/workflow/hooks/use-fullscreen-overlay'
import { formatCodeFileName } from './code-node-utils'

export type BrowserWorkspaceViewMode = 'split' | 'code' | 'browser'

interface BrowserWorkspaceDrawerProps {
  workspace: WorkflowCodeWorkspace
  previewUrl: string
  initialView?: BrowserWorkspaceViewMode
  onClose: () => void
}

const VIEW_OPTIONS: Array<{
  value: BrowserWorkspaceViewMode
  label: string
}> = [
  { value: 'split', label: '编码 + 浏览器' },
  { value: 'code', label: '仅编码' },
  { value: 'browser', label: '仅浏览器' },
]

export function BrowserWorkspaceDrawer({
  workspace,
  previewUrl,
  initialView = 'split',
  onClose,
}: BrowserWorkspaceDrawerProps) {
  const [viewMode, setViewMode] = useState<BrowserWorkspaceViewMode>(initialView)
  const [codeFrameKey, setCodeFrameKey] = useState(0)
  const [browserFrameKey, setBrowserFrameKey] = useState(0)

  useFullscreenOverlay(onClose)

  const showCode = viewMode !== 'browser'
  const showBrowser = viewMode !== 'code'

  return createPortal(
    <div className="fixed inset-0 z-[120] flex bg-slate-950/76 p-3 text-slate-100 backdrop-blur-md">
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-white/10 bg-slate-950 shadow-[0_28px_96px_rgba(2,6,23,0.62)]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/8 bg-[linear-gradient(135deg,rgba(56,189,248,0.16),rgba(16,185,129,0.12),rgba(15,23,42,0.96))] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-sky-300/18 bg-sky-400/10 text-sky-100">
              <Monitor className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">浏览器编码工作台</p>
              <p className="mt-1 truncate font-mono text-[11px] text-sky-100/70" title={workspace.folderPath}>
                {workspace.folderPath}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden rounded-xl border border-white/10 bg-slate-950/54 p-1 md:flex">
              {VIEW_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setViewMode(option.value)}
                  className={cn(
                    'rounded-lg px-2.5 py-1.5 text-xs transition',
                    viewMode === option.value
                      ? 'bg-sky-400/14 text-sky-50'
                      : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setCodeFrameKey((current) => current + 1)
                setBrowserFrameKey((current) => current + 1)
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-slate-300 transition hover:border-sky-300/24 hover:text-sky-100"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              刷新
            </button>
            <button
              type="button"
              onClick={() => window.open(workspace.codeUrl, '_blank', 'noopener,noreferrer')}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-slate-300 transition hover:border-emerald-300/24 hover:text-emerald-100"
            >
              <Code2 className="h-3.5 w-3.5" />
              Code
            </button>
            <button
              type="button"
              onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-slate-300 transition hover:border-sky-300/24 hover:text-sky-100"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              浏览器
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-slate-900/80 text-slate-300 transition hover:border-rose-300/28 hover:text-white"
              aria-label="关闭浏览器编码工作台"
              title="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>
        <div className="grid shrink-0 gap-2 border-b border-white/8 bg-slate-950/88 px-4 py-2 md:hidden">
          <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-slate-950/54 p-1">
            {VIEW_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setViewMode(option.value)}
                className={cn(
                  'rounded-lg px-2 py-1.5 text-[11px] transition',
                  viewMode === option.value
                    ? 'bg-sky-400/14 text-sky-50'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid shrink-0 gap-2 border-b border-white/8 bg-slate-950/88 px-4 py-2 sm:grid-cols-3">
          <BrowserWorkspaceMeta label="沙箱" value={workspace.sandboxId} />
          <BrowserWorkspaceMeta label="入口文件" value={formatCodeFileName(workspace.entryFilePath)} title={workspace.entryFilePath} />
          <BrowserWorkspaceMeta label="预览方式" value="AioSandbox VNC" />
        </div>
        <div
          className={cn(
            'min-h-0 flex-1 bg-slate-950',
            viewMode === 'split' ? 'grid grid-cols-1 gap-px xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]' : 'grid grid-cols-1',
          )}
        >
          {showCode ? (
            <WorkspacePane
              title="代码"
              subtitle={workspace.entryFilePath}
              tone="emerald"
            >
              <iframe
                key={codeFrameKey}
                src={workspace.codeUrl}
                title="沙箱 Code 工作区"
                className="h-full w-full border-0 bg-white"
                allow="clipboard-read; clipboard-write; fullscreen"
              />
            </WorkspacePane>
          ) : null}
          {showBrowser ? (
            <WorkspacePane
              title="浏览器"
              subtitle={previewUrl}
              tone="sky"
            >
              <iframe
                key={browserFrameKey}
                src={previewUrl}
                title="浏览器实时预览"
                className="h-full w-full border-0 bg-black"
                allow="clipboard-read; clipboard-write; fullscreen"
              />
            </WorkspacePane>
          ) : null}
        </div>
      </section>
    </div>,
    document.body,
  )
}

function WorkspacePane({
  title,
  subtitle,
  tone,
  children,
}: {
  title: string
  subtitle: string
  tone: 'emerald' | 'sky'
  children: ReactNode
}) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden border-white/8 bg-slate-950">
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-white/8 bg-slate-950/92 px-3">
        <div className="min-w-0">
          <p className={cn('text-xs font-semibold', tone === 'emerald' ? 'text-emerald-100' : 'text-sky-100')}>
            {title}
          </p>
          <p className="truncate font-mono text-[10px] text-slate-500" title={subtitle}>
            {subtitle}
          </p>
        </div>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  )
}

function BrowserWorkspaceMeta({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="mt-1 truncate font-mono text-[11px] text-slate-200" title={title ?? value}>
        {value || '-'}
      </p>
    </div>
  )
}
