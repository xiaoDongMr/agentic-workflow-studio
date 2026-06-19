import { AlertCircle, LoaderCircle, Save } from 'lucide-react'

export function UnsavedWorkflowDialog({
  saving,
  workflowName,
  onCancel,
  onSaveAndContinue,
  onStashAndContinue,
}: {
  saving: boolean
  workflowName: string
  onCancel: () => void
  onSaveAndContinue: () => void
  onStashAndContinue: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/72 p-4 backdrop-blur-md">
      <section className="w-full max-w-[520px] overflow-hidden rounded-[32px] border border-white/10 bg-slate-950 shadow-[0_32px_120px_rgba(2,6,23,0.55)]">
        <div className="relative overflow-hidden border-b border-white/8 px-6 py-5">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_0%,rgba(96,165,250,0.24),transparent_36%),radial-gradient(circle_at_88%_10%,rgba(251,191,36,0.13),transparent_32%)]" />
          <div className="relative flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-300/22 bg-amber-400/12 text-amber-100">
              <AlertCircle className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-lg font-semibold tracking-tight text-white">当前工作流还未保存</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                “{workflowName || '未命名项目'}” 有未保存修改。仅本地暂存依赖浏览器缓存，清理缓存或异常环境可能导致丢失。
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3 px-6 py-5">
          <button
            type="button"
            onClick={onSaveAndContinue}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-blue-300/30 bg-blue-500/20 px-4 py-3 text-sm font-semibold text-blue-50 shadow-[0_18px_48px_rgba(37,99,235,0.18)] transition hover:border-blue-200/50 hover:bg-blue-500/28 disabled:cursor-wait disabled:opacity-70"
          >
            {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存到服务端并继续
          </button>
          <button
            type="button"
            onClick={onStashAndContinue}
            disabled={saving}
            className="flex w-full items-center justify-center rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-amber-300/26 hover:bg-amber-400/8 disabled:cursor-not-allowed disabled:opacity-70"
          >
            仅本地暂存并继续
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="flex w-full items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-medium text-slate-500 transition hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-70"
          >
            继续编辑
          </button>
        </div>
      </section>
    </div>
  )
}
