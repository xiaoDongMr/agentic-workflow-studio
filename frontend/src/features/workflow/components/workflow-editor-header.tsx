import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronLeft, LoaderCircle, PencilLine, Save, X } from 'lucide-react'

import { cn } from '@/lib/utils'

type WorkflowSaveState = 'idle' | 'saving' | 'saved' | 'error'

interface WorkflowEditorHeaderProps {
  description: string
  hasUnsavedChanges: boolean
  lastSavedAt: Date | null
  name: string
  saveMessage: string
  saveStatus: WorkflowSaveState
  version: string
  onBack: () => void
  onSave: () => void
  onUpdateMetadata: (metadata: { name: string; description: string }) => void
}

export function WorkflowEditorHeader({
  description,
  hasUnsavedChanges,
  lastSavedAt,
  name,
  saveMessage,
  saveStatus,
  version,
  onBack,
  onSave,
  onUpdateMetadata,
}: WorkflowEditorHeaderProps) {
  return (
    <div className="relative z-30 flex flex-col gap-3 rounded-[26px] border border-white/8 bg-slate-950/78 p-3 shadow-[0_18px_56px_rgba(2,6,23,0.28)] backdrop-blur xl:flex-row xl:items-center xl:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/88 px-3.5 py-2 text-sm font-medium text-slate-200 shadow-[0_18px_48px_rgba(2,6,23,0.36)] backdrop-blur transition hover:border-blue-300/30 hover:bg-slate-900/95 hover:text-white"
          aria-label="返回工作流项目列表"
          title="返回工作流项目列表"
        >
          <ChevronLeft className="h-4 w-4 text-blue-200" />
          项目列表
        </button>
        <WorkflowTitleEditor
          description={description}
          name={name}
          version={version}
          onUpdate={onUpdateMetadata}
        />
      </div>

      <div className="flex items-center justify-end gap-2">
        <WorkflowSaveStatus
          hasUnsavedChanges={hasUnsavedChanges}
          lastSavedAt={lastSavedAt}
          message={saveMessage}
          status={saveStatus}
        />
        <button
          type="button"
          onClick={onSave}
          disabled={saveStatus === 'saving'}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-blue-300/28 bg-blue-500/18 px-4 py-2.5 text-sm font-semibold text-blue-50 shadow-[0_18px_48px_rgba(37,99,235,0.18)] backdrop-blur transition hover:border-blue-200/46 hover:bg-blue-500/26 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {saveStatus === 'saving' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          保存草稿
        </button>
      </div>
    </div>
  )
}

function WorkflowSaveStatus({
  hasUnsavedChanges,
  lastSavedAt,
  message,
  status,
}: {
  hasUnsavedChanges: boolean
  lastSavedAt: Date | null
  message: string
  status: WorkflowSaveState
}) {
  const icon =
    status === 'saving' ? (
      <LoaderCircle className="h-4 w-4 animate-spin text-blue-200" />
    ) : status === 'error' ? (
      <AlertCircle className="h-4 w-4 text-rose-300" />
    ) : status === 'saved' && !hasUnsavedChanges ? (
      <CheckCircle2 className="h-4 w-4 text-emerald-300" />
    ) : (
      <span className="h-2.5 w-2.5 rounded-full bg-amber-300 shadow-[0_0_18px_rgba(252,211,77,0.55)]" />
    )
  const label =
    status === 'saving'
      ? '保存中'
      : status === 'error'
        ? '保存失败'
        : hasUnsavedChanges
          ? '有未保存修改'
          : '已保存'
  const detail =
    message ||
    (lastSavedAt && !hasUnsavedChanges
      ? `上次保存 ${formatSaveTime(lastSavedAt)}`
      : '保存后可在项目列表中继续打开')

  return (
    <div
      className={cn(
        'hidden items-center gap-2 rounded-2xl border bg-slate-950/82 px-3.5 py-2 text-left shadow-[0_18px_48px_rgba(2,6,23,0.28)] backdrop-blur sm:flex',
        status === 'error' ? 'border-rose-300/24' : 'border-white/10',
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05]">
        {icon}
      </span>
      <span className="min-w-[128px]">
        <span className="block text-xs font-semibold text-slate-100">{label}</span>
        <span className="mt-0.5 block max-w-[260px] truncate text-[11px] text-slate-500">{detail}</span>
      </span>
    </div>
  )
}

function WorkflowTitleEditor({
  description,
  name,
  onUpdate,
  version,
}: {
  description: string
  name: string
  onUpdate: (metadata: { name: string; description: string }) => void
  version: string
}) {
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(name)
  const [draftDescription, setDraftDescription] = useState(description)
  const displayName = name || '未命名项目'
  const displayDescription = description || '当前工作流草稿'

  useEffect(() => {
    if (!editing) {
      setDraftName(displayName)
      setDraftDescription(description)
    }
  }, [description, displayName, editing])

  const commit = useCallback(() => {
    const nextName = draftName.trim() || '未命名项目'
    const nextDescription = draftDescription.trim()
    onUpdate({ name: nextName, description: nextDescription })
    setDraftName(nextName)
    setDraftDescription(nextDescription)
    setEditing(false)
  }, [draftDescription, draftName, onUpdate])
  const cancel = useCallback(() => {
    setDraftName(displayName)
    setDraftDescription(description)
    setEditing(false)
  }, [description, displayName])

  if (editing) {
    return (
      <div className="min-w-0 flex-1 rounded-2xl border border-blue-300/24 bg-blue-400/[0.08] px-3.5 py-2.5 shadow-[0_18px_48px_rgba(37,99,235,0.12)]">
        <div className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1 space-y-2">
            <input
              autoFocus
              value={draftName}
              maxLength={80}
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commit()
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  cancel()
                }
              }}
              className="w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-slate-500"
              placeholder="输入工作流名称"
            />
            <input
              value={draftDescription}
              maxLength={240}
              onChange={(event) => setDraftDescription(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  cancel()
                }
              }}
              className="w-full bg-transparent text-xs text-slate-300 outline-none placeholder:text-slate-600"
              placeholder="补充工作流描述"
            />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={commit}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-300/24 bg-emerald-400/12 text-emerald-100 transition hover:border-emerald-200/44 hover:bg-emerald-400/18"
              aria-label="确认工作流信息"
              title="确认"
            >
              <CheckCircle2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={cancel}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-slate-950/58 text-slate-400 transition hover:border-rose-300/28 hover:text-rose-100"
              aria-label="取消修改工作流信息"
              title="取消"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <p className="mt-1 truncate text-[11px] text-blue-100/58">修改后会进入未保存状态，点击右侧保存草稿写入服务端。</p>
      </div>
    )
  }

  return (
    <div className="group min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 transition hover:border-blue-300/20 hover:bg-white/[0.06]">
      <div className="flex min-w-0 items-center gap-2">
        <p className="truncate text-sm font-semibold text-white">{displayName}</p>
        <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[11px] font-medium text-slate-400">
          {version}
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-slate-950/50 text-slate-500 opacity-80 transition hover:border-blue-300/30 hover:text-blue-100 group-hover:opacity-100"
          aria-label="修改工作流名称"
          title="修改名称"
        >
          <PencilLine className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="mt-1 max-w-[520px] truncate text-xs text-slate-500">{displayDescription}</p>
    </div>
  )
}

function formatSaveTime(date: Date | null) {
  if (!date) {
    return ''
  }

  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}
