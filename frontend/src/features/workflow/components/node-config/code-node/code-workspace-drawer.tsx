import { ExternalLink, FolderOpen, RefreshCw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import type { WorkflowCodeWorkspace } from '@/api/workflow'

import { formatCodeFileName } from './code-node-utils'

interface CodeWorkspaceDrawerProps {
  workspace: WorkflowCodeWorkspace
  onClose: () => void
  onOpenExternal: () => void
}

export function CodeWorkspaceDrawer({
  workspace,
  onClose,
  onOpenExternal,
}: CodeWorkspaceDrawerProps) {
  const [iframeKey, setIframeKey] = useState(0)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[120] flex bg-slate-950/76 p-3 text-slate-100 backdrop-blur-md">
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-white/10 bg-slate-950 shadow-[0_28px_96px_rgba(2,6,23,0.62)]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/8 bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(15,23,42,0.96))] px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-emerald-300/18 bg-emerald-400/10 text-emerald-100">
                <FolderOpen className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">沙箱 Code 工作区</p>
                <p className="mt-1 truncate font-mono text-[11px] text-emerald-100/70" title={workspace.folderPath}>
                  {workspace.folderPath}
                </p>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setIframeKey((current) => current + 1)}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-slate-300 transition hover:border-emerald-300/24 hover:text-emerald-100"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              刷新
            </button>
            <button
              type="button"
              onClick={onOpenExternal}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-slate-300 transition hover:border-emerald-300/24 hover:text-emerald-100"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              新标签页
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-slate-900/80 text-slate-300 transition hover:border-rose-300/28 hover:text-white"
              aria-label="关闭沙箱 Code 抽屉"
              title="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>
        <div className="grid shrink-0 gap-2 border-b border-white/8 bg-slate-950/88 px-4 py-2 sm:grid-cols-3">
          <CodeWorkspaceMeta label="沙箱" value={workspace.sandboxId} />
          <CodeWorkspaceMeta label="入口文件" value={formatCodeFileName(workspace.entryFilePath)} title={workspace.entryFilePath} />
          <CodeWorkspaceMeta label="打开方式" value="应用内全屏抽屉" />
        </div>
        <div className="min-h-0 flex-1 bg-slate-950">
          <iframe
            key={iframeKey}
            src={workspace.codeUrl}
            title="沙箱 Code 工作区"
            className="h-full w-full border-0 bg-white"
            allow="clipboard-read; clipboard-write; fullscreen"
          />
        </div>
      </section>
    </div>,
    document.body,
  )
}

function CodeWorkspaceMeta({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="mt-1 truncate font-mono text-[11px] text-slate-200" title={title ?? value}>
        {value || '-'}
      </p>
    </div>
  )
}
