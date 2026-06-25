import { LoaderCircle, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { SandboxImageCapability } from '@/features/sandbox/sandbox-image-capabilities'

export function CustomImageDeleteDialog({
  busy,
  image,
  onCancel,
  onConfirm,
}: {
  busy: boolean
  image: SandboxImageCapability
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/72 p-4 backdrop-blur-md">
      <section className="w-full max-w-[520px] overflow-hidden rounded-[32px] border border-rose-300/16 bg-slate-950 shadow-[0_32px_120px_rgba(2,6,23,0.55)]">
        <div className="border-b border-white/8 px-6 py-5">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-rose-300/22 bg-rose-400/12 text-rose-100">
              <Trash2 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-lg font-semibold tracking-tight text-white">确认移除自定义镜像？</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                将从镜像清单中移除“{image.name}”，并删除对应的 K8s 预热 DaemonSet。镜像仓库和节点本地缓存不会被立即删除。
              </p>
              <p className="mt-3 break-all rounded-2xl border border-white/8 bg-slate-900/60 px-3 py-2 font-mono text-xs text-slate-300">
                {image.image}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-3 px-6 py-5 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            取消
          </Button>
          <Button type="button" onClick={onConfirm} disabled={busy} className="border-rose-300/24 bg-rose-500/16 text-rose-50 hover:bg-rose-500/24">
            {busy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            确认移除
          </Button>
        </div>
      </section>
    </div>
  )
}
