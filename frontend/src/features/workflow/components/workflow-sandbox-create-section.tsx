import { useEffect, useState } from 'react'
import { CheckCircle2, ImageIcon, LoaderCircle, Server } from 'lucide-react'

import type { SandboxImageSummary } from '@/api/sandbox-pool'
import { cn } from '@/lib/utils'

interface WorkflowSandboxCreateSectionProps {
  busy: boolean
  canUseSandboxSession: boolean
  images: SandboxImageSummary[]
  imagesLoading: boolean
  statusPolling: boolean
  updating: boolean
  onCreateSandbox: (imageId: string) => Promise<unknown>
  onRefreshImages: () => Promise<unknown> | void
}

export function WorkflowSandboxCreateSection({
  busy,
  canUseSandboxSession,
  images,
  imagesLoading,
  statusPolling,
  updating,
  onCreateSandbox,
  onRefreshImages,
}: WorkflowSandboxCreateSectionProps) {
  const [selectedImageId, setSelectedImageId] = useState('')
  const selectedImage = images.find((image) => image.id === selectedImageId)

  useEffect(() => {
    if (!imagesLoading && images.length === 0 && selectedImageId) {
      setSelectedImageId('')
      return
    }

    if (images.length > 0 && (!selectedImageId || !images.some((image) => image.id === selectedImageId))) {
      const defaultImage = images.find((image) => image.isDefault) ?? images[0]
      setSelectedImageId(defaultImage.id)
    }
  }, [images, imagesLoading, selectedImageId])

  return (
    <div className="rounded-2xl border border-emerald-300/12 bg-emerald-400/[0.055] p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-emerald-50">创建新沙箱</p>
          <p className="mt-0.5 text-[11px] text-slate-500">先选择镜像，再创建并绑定到当前 workflow</p>
        </div>
        <button
          type="button"
          onClick={() => void onRefreshImages()}
          disabled={imagesLoading || !canUseSandboxSession}
          className="text-[11px] text-slate-500 transition hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {imagesLoading ? '加载中' : '刷新镜像'}
        </button>
      </div>

      <div className="grid max-h-[174px] gap-1.5 overflow-y-auto pr-1">
        {imagesLoading && images.length === 0 ? (
          <div className="rounded-xl border border-dashed border-emerald-300/16 px-3 py-4 text-center text-[11px] text-emerald-100/70">
            正在加载镜像列表
          </div>
        ) : null}

        {images.map((image) => (
          <SandboxImageOption
            key={image.id}
            disabled={busy || !canUseSandboxSession}
            image={image}
            selected={image.id === selectedImageId}
            onSelect={setSelectedImageId}
          />
        ))}

        {!imagesLoading && images.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-[11px] text-slate-500">
            暂无可用镜像
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => void onCreateSandbox(selectedImageId)}
        disabled={busy || statusPolling || !canUseSandboxSession || !selectedImageId}
        className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-emerald-300/22 bg-emerald-400/12 px-3 text-sm font-semibold text-emerald-50 transition hover:border-emerald-200/40 hover:bg-emerald-400/18 disabled:cursor-not-allowed disabled:opacity-50"
        title={selectedImage ? `使用镜像：${selectedImage.name || selectedImage.id}` : '请选择镜像'}
      >
        {updating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Server className="h-4 w-4" />}
        创建并绑定
      </button>
    </div>
  )
}

function SandboxImageOption({
  disabled,
  image,
  selected,
  onSelect,
}: {
  disabled: boolean
  image: SandboxImageSummary
  selected: boolean
  onSelect: (imageId: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(image.id)}
      disabled={disabled}
      className={cn(
        'flex min-w-0 items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-60',
        selected
          ? 'border-emerald-300/30 bg-emerald-400/12'
          : 'border-white/8 bg-slate-950/34 hover:border-emerald-300/20 hover:bg-white/[0.055]',
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-slate-950/58 text-emerald-100">
          <ImageIcon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-xs font-semibold text-slate-100">{image.name || image.id}</span>
            {image.isDefault ? (
              <span className="shrink-0 rounded-full border border-emerald-300/18 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] text-emerald-100">
                默认
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-slate-500">{image.image}</span>
        </span>
      </span>
      {selected ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-200" /> : null}
    </button>
  )
}
