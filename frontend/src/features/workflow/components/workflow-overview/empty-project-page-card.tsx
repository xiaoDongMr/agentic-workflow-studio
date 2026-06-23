import { Plus } from 'lucide-react'

export function EmptyProjectPageCard({ query, onCreateWorkflow }: { query: string; onCreateWorkflow: () => void }) {
  return (
    <div className="flex min-h-[260px] flex-col justify-between rounded-[24px] border border-white/8 bg-white/[0.04] p-5">
      <div>
        <div className="inline-flex rounded-full border border-slate-300/10 bg-slate-400/10 px-3 py-1 text-xs font-medium text-slate-300">
          无匹配项目
        </div>
        <h3 className="mt-5 text-lg font-semibold text-white">{query.trim() ? '没有找到服务端项目' : '还没有已保存项目'}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          {query.trim() ? `没有找到“${query.trim()}”相关项目。` : '保存工作流后，项目会出现在这里。'}
        </p>
      </div>
      <button
        type="button"
        onClick={onCreateWorkflow}
        className="mt-6 inline-flex w-fit items-center gap-2 rounded-2xl border border-blue-300/22 bg-blue-500/16 px-4 py-2 text-sm font-medium text-blue-100 transition hover:border-blue-300/42 hover:bg-blue-500/22"
      >
        <Plus className="h-4 w-4" />
        新建工作流
      </button>
    </div>
  )
}
