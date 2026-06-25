import { AlertTriangle, ShieldCheck } from 'lucide-react'

export function FeedbackToast({
  error,
  notice,
  onClearError,
  onClearNotice,
}: {
  error: string
  notice: string
  onClearError: () => void
  onClearNotice: () => void
}) {
  if (!error && !notice) {
    return null
  }

  return (
    <div className="fixed left-1/2 top-4 z-[60] w-[calc(100vw-2rem)] max-w-[960px] -translate-x-1/2 space-y-3 px-0">
      {error ? (
        <div className="rounded-2xl border border-rose-400/24 bg-rose-950/90 p-4 text-sm text-rose-100 shadow-[0_18px_60px_rgba(127,29,29,0.28)] backdrop-blur">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">{error}</span>
            <button
              type="button"
              onClick={onClearError}
              className="shrink-0 rounded-lg px-2 py-0.5 text-xs text-rose-100/70 hover:bg-white/10 hover:text-rose-50"
            >
              关闭
            </button>
          </div>
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-2xl border border-emerald-400/24 bg-emerald-950/88 p-4 text-sm text-emerald-100 shadow-[0_18px_60px_rgba(6,78,59,0.24)] backdrop-blur">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">{notice}</span>
            <button
              type="button"
              onClick={onClearNotice}
              className="shrink-0 rounded-lg px-2 py-0.5 text-xs text-emerald-100/70 hover:bg-white/10 hover:text-emerald-50"
            >
              关闭
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
