import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  ExternalLink,
  GripHorizontal,
  Maximize2,
  Monitor,
  RefreshCw,
  X,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { useFullscreenOverlay } from '@/features/workflow/hooks/use-fullscreen-overlay'
import type { BrowserRuntimePreview } from '@/features/workflow/editor/workflow-editor.types'

const BROWSER_RUNTIME_PREVIEW_SCALE = 0.5
const BROWSER_RUNTIME_PREVIEW_DEFAULT_HEIGHT = 176
const BROWSER_RUNTIME_PREVIEW_MIN_HEIGHT = 160
const BROWSER_RUNTIME_PREVIEW_MAX_HEIGHT = 420

export function BrowserRuntimePreviewCard({ preview }: { preview: BrowserRuntimePreview }) {
  const [collapsed, setCollapsed] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [frameKey, setFrameKey] = useState(0)
  const [previewHeight, setPreviewHeight] = useState(BROWSER_RUNTIME_PREVIEW_DEFAULT_HEIGHT)
  const [resizing, setResizing] = useState(false)
  const resizeStartRef = useRef({
    y: 0,
    height: BROWSER_RUNTIME_PREVIEW_DEFAULT_HEIGHT,
  })

  const statusLabel = getBrowserRuntimeStatusLabel(preview.status)
  const running = preview.status === 'running'

  useEffect(() => {
    if (!resizing) {
      return undefined
    }

    const handleMouseMove = (event: MouseEvent) => {
      const nextHeight = resizeStartRef.current.height + event.clientY - resizeStartRef.current.y
      setPreviewHeight(
        Math.min(
          Math.max(nextHeight, BROWSER_RUNTIME_PREVIEW_MIN_HEIGHT),
          BROWSER_RUNTIME_PREVIEW_MAX_HEIGHT,
        ),
      )
    }
    const handleMouseUp = () => setResizing(false)

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizing])

  const startResize = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    resizeStartRef.current = {
      y: event.clientY,
      height: previewHeight,
    }
    setResizing(true)
  }

  return (
    <>
      <section className="mt-4 overflow-hidden rounded-[20px] border border-sky-300/16 bg-[linear-gradient(135deg,rgba(14,165,233,0.12),rgba(15,23,42,0.78))] shadow-[0_14px_36px_rgba(2,6,23,0.26)]">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-sky-300/18 bg-sky-400/10 text-sky-100">
              <Monitor className="h-4 w-4" />
              {running ? (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.9)]" />
              ) : null}
            </span>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate text-sm font-semibold text-white">浏览器执行视图</p>
                <span
                  className={cn(
                    'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                    preview.status === 'error'
                      ? 'border-rose-300/18 bg-rose-400/10 text-rose-100'
                      : running
                        ? 'border-emerald-300/18 bg-emerald-400/10 text-emerald-100'
                        : 'border-sky-300/18 bg-sky-400/10 text-sky-100',
                  )}
                >
                  {statusLabel}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-slate-400" title={preview.nodeTitle}>
                当前节点：{preview.nodeTitle}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCollapsed((current) => !current)}
              className="rounded-lg border border-white/8 bg-white/[0.04] px-2 py-1.5 text-[11px] font-medium text-slate-300 transition hover:border-sky-300/24 hover:text-sky-100"
            >
              {collapsed ? '展开' : '收起'}
            </button>
            <button
              type="button"
              onClick={() => setFrameKey((current) => current + 1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/8 bg-white/[0.04] text-slate-300 transition hover:border-sky-300/24 hover:text-sky-100"
              aria-label="刷新浏览器执行视图"
              title="刷新"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/8 bg-white/[0.04] text-slate-300 transition hover:border-sky-300/24 hover:text-sky-100"
              aria-label="全屏查看浏览器执行视图"
              title="全屏"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => window.open(preview.previewUrl, '_blank', 'noopener,noreferrer')}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/8 bg-white/[0.04] text-slate-300 transition hover:border-sky-300/24 hover:text-sky-100"
              aria-label="新标签页打开浏览器执行视图"
              title="新标签页打开"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {!collapsed ? (
          <div className="border-t border-white/8 bg-slate-950/60 p-2.5">
            <div
              className="relative overflow-hidden rounded-2xl border border-white/8 bg-black shadow-inner"
              style={{ height: previewHeight }}
            >
              <iframe
                key={frameKey}
                src={preview.previewUrl}
                title="浏览器执行实时页面"
                className="block border-0 bg-black"
                style={{
                  width: `${100 / BROWSER_RUNTIME_PREVIEW_SCALE}%`,
                  height: previewHeight / BROWSER_RUNTIME_PREVIEW_SCALE,
                  transform: `scale(${BROWSER_RUNTIME_PREVIEW_SCALE})`,
                  transformOrigin: 'left top',
                }}
                allow="clipboard-read; clipboard-write; fullscreen"
              />
            </div>
            <button
              type="button"
              onMouseDown={startResize}
              className={cn(
                'mt-1.5 flex h-6 w-full cursor-row-resize items-center justify-center gap-1 rounded-lg border border-transparent text-[10px] text-slate-600 transition hover:border-sky-300/14 hover:bg-sky-400/5 hover:text-sky-200',
                resizing && 'border-sky-300/18 bg-sky-400/8 text-sky-100',
              )}
              aria-label="上下拖拽调整浏览器执行视图高度"
              title="上下拖拽调整高度"
            >
              <GripHorizontal className="h-4 w-4" />
              拖拽调整高度
            </button>
          </div>
        ) : null}
      </section>

      {resizing ? (
        <div className="fixed inset-0 z-[129] cursor-row-resize" />
      ) : null}

      {fullscreen ? (
        <BrowserRuntimePreviewFullscreen
          frameKey={frameKey}
          preview={preview}
          onClose={() => setFullscreen(false)}
          onRefresh={() => setFrameKey((current) => current + 1)}
        />
      ) : null}
    </>
  )
}

function BrowserRuntimePreviewFullscreen({
  preview,
  frameKey,
  onClose,
  onRefresh,
}: {
  preview: BrowserRuntimePreview
  frameKey: number
  onClose: () => void
  onRefresh: () => void
}) {
  useFullscreenOverlay(onClose)

  return createPortal(
    <div className="fixed inset-0 z-[130] flex bg-slate-950/78 p-3 text-slate-100 backdrop-blur-md">
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-white/10 bg-slate-950 shadow-[0_28px_96px_rgba(2,6,23,0.62)]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/8 bg-[linear-gradient(135deg,rgba(56,189,248,0.16),rgba(15,23,42,0.96))] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-sky-300/18 bg-sky-400/10 text-sky-100">
              <Monitor className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">浏览器执行视图</p>
              <p className="mt-1 truncate text-[11px] text-sky-100/70" title={preview.nodeTitle}>
                {preview.nodeTitle} · {getBrowserRuntimeStatusLabel(preview.status)}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-slate-300 transition hover:border-sky-300/24 hover:text-sky-100"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              刷新
            </button>
            <button
              type="button"
              onClick={() => window.open(preview.previewUrl, '_blank', 'noopener,noreferrer')}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-slate-300 transition hover:border-sky-300/24 hover:text-sky-100"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              新标签页
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-slate-900/80 text-slate-300 transition hover:border-rose-300/28 hover:text-white"
              aria-label="关闭浏览器执行视图"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 bg-black">
          <iframe
            key={frameKey}
            src={preview.previewUrl}
            title="浏览器执行全屏实时页面"
            className="h-full w-full border-0 bg-black"
            allow="clipboard-read; clipboard-write; fullscreen"
          />
        </div>
      </section>
    </div>,
    document.body,
  )
}

function getBrowserRuntimeStatusLabel(status: BrowserRuntimePreview['status']) {
  if (status === 'running') {
    return '执行中'
  }
  if (status === 'error') {
    return '执行失败'
  }
  return '已完成'
}
