import { LoaderCircle } from 'lucide-react'

export function SectionTitle({ title, description, aside }: { title: string; description: string; aside: string }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-white">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <span className="inline-flex w-fit rounded-full border border-white/8 bg-white/[0.045] px-3 py-1.5 text-xs font-medium text-slate-400">
        {aside}
      </span>
    </div>
  )
}

export function WorkflowErrors({ actionError, projectsError }: { actionError: string; projectsError: string }) {
  if (!projectsError && !actionError) {
    return null
  }

  return (
    <>
      {projectsError && (
        <div className="relative mt-4 rounded-2xl border border-rose-300/18 bg-rose-400/8 px-4 py-3 text-sm text-rose-100">
          {projectsError}
        </div>
      )}
      {actionError && (
        <div className="relative mt-4 rounded-2xl border border-rose-300/18 bg-rose-400/8 px-4 py-3 text-sm text-rose-100">
          {actionError}
        </div>
      )}
    </>
  )
}

export function WorkflowProjectLoadingCard() {
  return (
    <div className="flex min-h-[260px] items-center justify-center rounded-[24px] border border-white/8 bg-white/[0.045]">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
        <LoaderCircle className="h-4 w-4 animate-spin text-blue-300" />
        加载工作流项目中
      </div>
    </div>
  )
}
