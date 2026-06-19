import { useState } from 'react'
import { LoaderCircle, Search, Trash2, X } from 'lucide-react'

import type { WorkflowProjectMetadata } from './types'

export function ProjectMetadataDialog({
  busy,
  initialDescription,
  initialName,
  onCancel,
  onSubmit,
}: {
  busy: boolean
  initialDescription: string
  initialName: string
  onCancel: () => void
  onSubmit: (metadata: WorkflowProjectMetadata) => void
}) {
  const [name, setName] = useState(initialName || '未命名项目')
  const [description, setDescription] = useState(initialDescription)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/72 p-4 backdrop-blur-md">
      <section className="w-full max-w-[560px] overflow-hidden rounded-[32px] border border-white/10 bg-slate-950 shadow-[0_32px_120px_rgba(2,6,23,0.55)]">
        <div className="flex items-start justify-between gap-4 border-b border-white/8 px-6 py-5">
          <div>
            <p className="text-lg font-semibold tracking-tight text-white">编辑工作流信息</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">修改列表页展示的名称和描述，服务端项目会立即同步。</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-400 transition hover:text-white disabled:opacity-60"
            aria-label="关闭编辑弹窗"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <label className="block">
            <span className="text-xs font-medium text-slate-400">名称</span>
            <input
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm font-medium text-white outline-none transition placeholder:text-slate-600 focus:border-blue-300/36"
              placeholder="输入工作流名称"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-400">描述</span>
            <textarea
              value={description}
              maxLength={240}
              rows={4}
              onChange={(event) => setDescription(event.target.value)}
              className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-blue-300/36"
              placeholder="补充这个工作流的用途、输入和输出说明"
            />
          </label>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:text-white disabled:opacity-60"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => onSubmit({ name, description })}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-blue-300/24 bg-blue-500/18 px-4 py-2.5 text-sm font-semibold text-blue-50 transition hover:border-blue-200/42 hover:bg-blue-500/25 disabled:cursor-wait disabled:opacity-70"
            >
              {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}
              保存信息
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

export function ProjectDeleteDialog({
  busy,
  projectName,
  source,
  onCancel,
  onConfirm,
}: {
  busy: boolean
  projectName: string
  source: 'local' | 'server'
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/72 p-4 backdrop-blur-md">
      <section className="w-full max-w-[500px] overflow-hidden rounded-[32px] border border-rose-300/16 bg-slate-950 shadow-[0_32px_120px_rgba(2,6,23,0.55)]">
        <div className="border-b border-white/8 px-6 py-5">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-rose-300/22 bg-rose-400/12 text-rose-100">
              <Trash2 className="h-5 w-5" />
            </span>
            <div>
              <p className="text-lg font-semibold tracking-tight text-white">确认删除工作流？</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                  将删除“{projectName || '未命名项目'}”。{source === 'server' ? '服务端项目会被移出列表，历史版本和画布数据会保留在数据库中。' : '本地草稿会从浏览器缓存中移除。'}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-3 px-6 py-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:text-white disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-300/24 bg-rose-500/16 px-4 py-2.5 text-sm font-semibold text-rose-50 transition hover:border-rose-200/42 hover:bg-rose-500/24 disabled:cursor-wait disabled:opacity-70"
          >
            {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}
            确认删除
          </button>
        </div>
      </section>
    </div>
  )
}

export function EmptySearchCard({ query, onCreateWorkflow }: { query: string; onCreateWorkflow: () => void }) {
  return (
    <div className="flex min-h-[330px] flex-col justify-between rounded-[28px] border border-white/8 bg-white/[0.045] p-5">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-400/10 text-amber-100">
        <Search className="h-5 w-5" />
      </div>
      <div>
        <p className="text-lg font-semibold text-white">没有匹配的工作流</p>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          当前本地草稿未命中“{query}”。可以调整关键词，或直接创建新的工作流项目。
        </p>
        <button
          type="button"
          onClick={onCreateWorkflow}
          className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-blue-300/22 bg-blue-500/16 px-4 py-2 text-sm font-medium text-blue-100 transition hover:border-blue-300/42 hover:bg-blue-500/22"
        >
          新建工作流
        </button>
      </div>
    </div>
  )
}
