import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Code2,
  History,
  LoaderCircle,
  Package,
  PencilLine,
  RotateCcw,
  Save,
  Server,
  Terminal,
  X,
} from 'lucide-react'

import type { WorkflowVersionSummary } from '@/api/workflow'
import { sandboxImageCapabilities } from '@/features/sandbox/sandbox-image-capabilities'
import { cn } from '@/lib/utils'

type WorkflowSaveState = 'idle' | 'saving' | 'saved' | 'error'

interface WorkflowEditorHeaderProps {
  description: string
  hasUnsavedChanges: boolean
  lastSavedAt: Date | null
  name: string
  saveMessage: string
  saveStatus: WorkflowSaveState
  versions: WorkflowVersionSummary[]
  versionsError: string
  versionsLoading: boolean
  version: string
  restoringVersionId: string | null
  onBack: () => void
  onRestoreVersion: (versionId: string) => void
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
  versions,
  versionsError,
  versionsLoading,
  version,
  restoringVersionId,
  onBack,
  onRestoreVersion,
  onSave,
  onUpdateMetadata,
}: WorkflowEditorHeaderProps) {
  return (
    <div className="relative z-30 grid gap-2 rounded-[20px] border border-white/8 bg-slate-950/76 px-2.5 py-2 shadow-[0_14px_36px_rgba(2,6,23,0.22)] backdrop-blur xl:grid-cols-[auto_minmax(0,1fr)_auto] xl:items-center">
      <div className="flex items-center">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-slate-950/88 px-3 text-sm font-medium text-slate-200 shadow-[0_12px_28px_rgba(2,6,23,0.22)] backdrop-blur transition hover:border-blue-300/30 hover:bg-slate-900/95 hover:text-white"
          aria-label="返回工作流项目列表"
          title="返回工作流项目列表"
        >
          <ChevronLeft className="h-4 w-4 text-blue-200" />
          项目列表
        </button>
      </div>

      <div className="min-w-0 border-t border-white/8 pt-2 xl:border-l xl:border-t-0 xl:py-0 xl:pl-3">
        <WorkflowTitleEditor
          description={description}
          name={name}
          version={version}
          onUpdate={onUpdateMetadata}
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <WorkflowSandboxStatusMenu />
        <WorkflowSaveStatus
          hasUnsavedChanges={hasUnsavedChanges}
          lastSavedAt={lastSavedAt}
          message={saveMessage}
          status={saveStatus}
        />
        <WorkflowVersionMenu
          currentVersion={version}
          hasUnsavedChanges={hasUnsavedChanges}
          restoringVersionId={restoringVersionId}
          versions={versions}
          versionsError={versionsError}
          versionsLoading={versionsLoading}
          onRestoreVersion={onRestoreVersion}
        />
        <button
          type="button"
          onClick={onSave}
          disabled={saveStatus === 'saving'}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-blue-300/28 bg-blue-500/18 px-3 text-sm font-semibold text-blue-50 shadow-[0_12px_30px_rgba(37,99,235,0.14)] backdrop-blur transition hover:border-blue-200/46 hover:bg-blue-500/26 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {saveStatus === 'saving' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          保存草稿
        </button>
      </div>
    </div>
  )
}

function WorkflowSandboxStatusMenu() {
  const [open, setOpen] = useState(false)
  const defaultImage = sandboxImageCapabilities.find((image) => image.default) ?? sandboxImageCapabilities[0]

  if (!defaultImage) {
    return null
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-emerald-300/18 bg-emerald-400/[0.10] px-3 text-sm font-semibold text-emerald-50 shadow-[0_12px_30px_rgba(5,150,105,0.10)] backdrop-blur transition hover:border-emerald-200/34 hover:bg-emerald-400/[0.16]"
        aria-expanded={open}
        aria-label="查看当前工作流沙箱状态"
      >
        <Server className="h-4 w-4 text-emerald-200" />
        <span className="hidden 2xl:inline">沙箱</span>
        <span className="rounded-full border border-white/10 bg-slate-950/36 px-2 py-0.5 text-[11px] text-emerald-100">
          未启动
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-emerald-100/70 transition', open && 'rotate-180')} />
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+10px)] z-40 w-[380px] overflow-hidden rounded-[24px] border border-white/10 bg-slate-950/96 p-3 shadow-[0_24px_80px_rgba(2,6,23,0.48)] backdrop-blur">
          <div className="rounded-2xl border border-emerald-300/16 bg-emerald-400/[0.08] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">当前 workflow 沙箱</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  暂未创建真实沙箱。调试、AI 工具调用或打开终端时，再按需创建并同步代码。
                </p>
              </div>
              <span className="shrink-0 rounded-xl border border-amber-300/20 bg-amber-400/10 px-2.5 py-1 text-xs text-amber-100">
                未启动
              </span>
            </div>
          </div>

          <div className="mt-3 rounded-2xl border border-white/8 bg-white/[0.035] p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-100">{defaultImage.name}</p>
                <p className="mt-1 truncate font-mono text-xs text-slate-500">{defaultImage.image}</p>
              </div>
              <span className="shrink-0 rounded-xl border border-blue-300/18 bg-blue-400/10 px-2.5 py-1 text-xs text-blue-100">
                默认镜像
              </span>
            </div>

            <div className="mt-3 grid gap-2">
              <WorkflowSandboxCapabilityRow icon={Terminal} label="工具" items={defaultImage.tools.slice(0, 5)} />
              <WorkflowSandboxCapabilityRow icon={Package} label="接口" items={defaultImage.runtimes.slice(0, 4)} />
              <WorkflowSandboxCapabilityRow icon={Code2} label="能力" items={defaultImage.capabilities.slice(0, 4)} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function WorkflowSandboxCapabilityRow({
  icon: Icon,
  label,
  items,
}: {
  icon: typeof Server
  label: string
  items: string[]
}) {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-slate-950/36 px-3 py-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-200" />
      <div className="min-w-0">
        <span className="text-xs text-slate-500">{label}</span>
        <span className="ml-2 text-xs text-slate-200">{items.join(' / ')}</span>
      </div>
    </div>
  )
}

function WorkflowVersionMenu({
  currentVersion,
  hasUnsavedChanges,
  restoringVersionId,
  versions,
  versionsError,
  versionsLoading,
  onRestoreVersion,
}: {
  currentVersion: string
  hasUnsavedChanges: boolean
  restoringVersionId: string | null
  versions: WorkflowVersionSummary[]
  versionsError: string
  versionsLoading: boolean
  onRestoreVersion: (versionId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [confirmVersionId, setConfirmVersionId] = useState<string | null>(null)
  const current = versions.find((item) => item.isCurrent)
  const label = current?.version || currentVersion

  const restore = useCallback(
    (versionId: string) => {
      onRestoreVersion(versionId)
      setConfirmVersionId(null)
      setOpen(false)
    },
    [onRestoreVersion],
  )

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-slate-950/82 px-3 text-sm font-semibold text-slate-100 shadow-[0_12px_30px_rgba(2,6,23,0.18)] backdrop-blur transition hover:border-blue-300/28 hover:bg-slate-900/95"
        aria-expanded={open}
        aria-label="查看历史版本"
      >
        <History className="h-4 w-4 text-blue-200" />
        <span className="hidden sm:inline">历史版本</span>
        <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[11px] text-slate-300">
          {label}
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-slate-500 transition', open && 'rotate-180')} />
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+10px)] z-40 w-[360px] overflow-hidden rounded-[24px] border border-white/10 bg-slate-950/96 p-2 shadow-[0_24px_80px_rgba(2,6,23,0.48)] backdrop-blur">
          <div className="flex items-center justify-between border-b border-white/8 px-3 py-2.5">
            <div>
              <p className="text-sm font-semibold text-white">版本记录</p>
              <p className="mt-0.5 text-[11px] text-slate-500">选择历史版本恢复为未保存草稿</p>
            </div>
            {versionsLoading ? <LoaderCircle className="h-4 w-4 animate-spin text-blue-200" /> : null}
          </div>

          {versionsError ? (
            <div className="m-2 rounded-2xl border border-rose-300/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-100">
              {versionsError}
            </div>
          ) : null}

          <div className="max-h-[340px] overflow-y-auto p-1">
            {!versionsLoading && versions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 px-3 py-5 text-center text-xs text-slate-500">
                保存后会在这里看到版本记录
              </div>
            ) : null}

            {versions.map((item) => {
              const restoring = restoringVersionId === item.id
              return (
                <div
                  key={item.id}
                  className={cn(
                    'group rounded-2xl border px-3 py-2.5 transition',
                    item.isCurrent
                      ? 'border-blue-300/26 bg-blue-400/[0.10]'
                      : 'border-white/8 bg-white/[0.035] hover:border-blue-300/20 hover:bg-white/[0.055]',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-100">{item.version}</p>
                        {item.isCurrent ? (
                          <span className="rounded-full border border-blue-200/22 bg-blue-300/12 px-2 py-0.5 text-[10px] font-semibold text-blue-100">
                            当前
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-400">{item.name || '未命名项目'}</p>
                      <p className="mt-1 text-[11px] text-slate-600">
                        {formatVersionTime(item.createdAt)} · {item.nodeCount} 节点 / {item.edgeCount} 连线
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={item.isCurrent || restoring || Boolean(restoringVersionId)}
                      onClick={() => {
                        if (hasUnsavedChanges) {
                          setConfirmVersionId(item.id)
                          return
                        }
                        restore(item.id)
                      }}
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-slate-950/58 px-2.5 text-xs font-semibold text-slate-300 transition hover:border-emerald-300/30 hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {restoring ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                      恢复
                    </button>
                  </div>
                  {confirmVersionId === item.id ? (
                    <div className="mt-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.08] p-2">
                      <p className="text-[11px] leading-5 text-amber-100/90">
                        当前画布有未保存修改，恢复后会用该历史版本覆盖本地草稿。
                      </p>
                      <div className="mt-2 flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setConfirmVersionId(null)}
                          className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-slate-300 transition hover:text-white"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          onClick={() => restore(item.id)}
                          className="rounded-lg border border-amber-200/24 bg-amber-300/12 px-2 py-1 text-[11px] font-semibold text-amber-50 transition hover:bg-amber-300/18"
                        >
                          继续恢复
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
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
        'hidden h-9 items-center gap-2 rounded-xl border bg-slate-950/82 px-3 text-left shadow-[0_12px_30px_rgba(2,6,23,0.18)] backdrop-blur sm:flex',
        status === 'error' ? 'border-rose-300/24' : 'border-white/10',
      )}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05]">
        {icon}
      </span>
      <span className="min-w-0">
          <span className="block max-w-[220px] truncate text-xs font-semibold text-slate-100">{message || label}</span>
          {!message && lastSavedAt && !hasUnsavedChanges ? (
            <span className="sr-only">{detail}</span>
        ) : null}
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
      <div className="min-w-0 rounded-xl border border-blue-300/20 bg-blue-400/[0.07] px-2.5 py-1.5 shadow-[0_12px_28px_rgba(37,99,235,0.10)]">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid min-w-0 flex-1 gap-1 md:grid-cols-[minmax(180px,0.7fr)_minmax(220px,1fr)]">
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
              className="h-7 w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-slate-500"
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
              className="h-7 w-full bg-transparent text-xs text-slate-300 outline-none placeholder:text-slate-600"
              placeholder="补充工作流描述"
            />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={commit}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-300/24 bg-emerald-400/12 text-emerald-100 transition hover:border-emerald-200/44 hover:bg-emerald-400/18"
              aria-label="确认工作流信息"
              title="确认"
            >
              <CheckCircle2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={cancel}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-slate-950/58 text-slate-400 transition hover:border-rose-300/28 hover:text-rose-100"
              aria-label="取消修改工作流信息"
              title="取消"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="group flex min-w-0 items-center gap-2">
      <h1 className="truncate text-sm font-semibold leading-5 text-white">{displayName}</h1>
      <span className="hidden max-w-[360px] truncate text-xs text-slate-500 lg:inline">
        {displayDescription}
      </span>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[11px] font-medium text-slate-400">
          {version}
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/[0.04] text-slate-500 opacity-80 transition hover:border-blue-300/30 hover:bg-blue-400/[0.08] hover:text-blue-100 group-hover:opacity-100"
          aria-label="修改工作流信息"
          title="修改工作流信息"
        >
          <PencilLine className="h-3.5 w-3.5" />
        </button>
      </div>
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

function formatVersionTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '时间未知'
  }

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
