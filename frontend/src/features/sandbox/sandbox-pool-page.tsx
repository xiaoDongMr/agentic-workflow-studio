import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Activity,
  AlertTriangle,
  Box,
  Clock3,
  Cpu,
  ExternalLink,
  Layers3,
  LoaderCircle,
  Network,
  Plus,
  RefreshCw,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from 'lucide-react'

import {
  createSandbox,
  deleteSandbox,
  getSandboxPoolHealth,
  listSandboxes,
  type SandboxPoolHealth,
  type SandboxStatus,
  type SandboxSummary,
} from '@/api/sandbox-pool'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function formatDate(value: string): string {
  if (!value) {
    return '-'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

interface CreateSandboxFormState {
  sandboxId: string
  image: string
  envText: string
  labelsText: string
}

function createSandboxId(): string {
  const cryptoApi = globalThis.crypto
  if (cryptoApi?.randomUUID) {
    return `sandbox-${cryptoApi.randomUUID().replace(/-/g, '').slice(0, 24)}`
  }

  if (cryptoApi?.getRandomValues) {
    const randomPart = Array.from(cryptoApi.getRandomValues(new Uint8Array(12)))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
    return `sandbox-${randomPart}`
  }

  const fallbackPart = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}${Math.random()
    .toString(36)
    .slice(2, 10)}`
  return `sandbox-${fallbackPart.slice(0, 24)}`
}

function createDefaultForm(): CreateSandboxFormState {
  return {
    sandboxId: createSandboxId(),
    image: '',
    envText: '',
    labelsText: '',
  }
}

function parseKeyValueText(value: string, fieldLabel: string): Record<string, string> {
  const result: Record<string, string> = {}
  const lines = value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  for (const line of lines) {
    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0) {
      throw new Error(`${fieldLabel} 请使用 KEY=VALUE 格式，每行一组`)
    }
    const key = line.slice(0, separatorIndex).trim()
    const nextValue = line.slice(separatorIndex + 1).trim()
    if (!key) {
      throw new Error(`${fieldLabel} 存在空 Key`)
    }
    result[key] = nextValue
  }

  return result
}

function formInputClassName(className?: string): string {
  return cn(
    'w-full rounded-2xl border border-white/8 bg-slate-950/70 px-3.5 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-400/60 focus:bg-slate-950/90',
    className,
  )
}

function statusClassName(status: SandboxStatus): string {
  switch (status) {
    case 'Running':
      return 'border-emerald-400/24 bg-emerald-400/10 text-emerald-200'
    case 'Pending':
      return 'border-sky-400/24 bg-sky-400/10 text-sky-200'
    case 'Failed':
      return 'border-rose-400/28 bg-rose-400/10 text-rose-200'
    case 'Succeeded':
      return 'border-slate-400/18 bg-slate-400/8 text-slate-300'
    default:
      return 'border-amber-400/24 bg-amber-400/10 text-amber-200'
  }
}

function statusLabel(status: SandboxStatus): string {
  const labels: Record<SandboxStatus, string> = {
    Pending: '启动中',
    Running: '运行中',
    Succeeded: '已完成',
    Failed: '异常',
    Unknown: '未知',
  }
  return labels[status]
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone = 'blue',
}: {
  icon: typeof Activity
  label: string
  value: string | number
  tone?: 'blue' | 'emerald' | 'amber' | 'violet'
}) {
  const toneClass = {
    blue: 'border-blue-400/20 bg-blue-400/10 text-blue-200',
    emerald: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    amber: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
    violet: 'border-violet-400/20 bg-violet-400/10 text-violet-200',
  }[tone]

  return (
    <div className="rounded-[22px] border border-white/8 bg-white/[0.045] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className={cn('inline-flex h-10 w-10 items-center justify-center rounded-2xl border', toneClass)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-4 text-2xl font-semibold tracking-tight text-white">{value}</div>
      <div className="mt-1 text-xs text-slate-400">{label}</div>
    </div>
  )
}

function CreateSandboxPanel({
  value,
  creating,
  disabled,
  showAdvanced,
  onChange,
  onSubmit,
  onGenerateId,
  onToggleAdvanced,
}: {
  value: CreateSandboxFormState
  creating: boolean
  disabled: boolean
  showAdvanced: boolean
  onChange: (nextValue: CreateSandboxFormState) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onGenerateId: () => void
  onToggleAdvanced: () => void
}) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-blue-300/14 bg-slate-950/64 shadow-[0_24px_80px_rgba(2,6,23,0.24)]">
      <div className="relative border-b border-white/8 p-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_8%_0%,rgba(59,130,246,0.18),transparent_34%),radial-gradient(circle_at_92%_18%,rgba(168,85,247,0.14),transparent_30%)]" />
        <div className="relative flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-300/20 bg-blue-400/12 text-blue-200">
              <Plus className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200/80">Create Sandbox</p>
              <h3 className="mt-1 text-xl font-semibold tracking-tight text-white">创建沙箱</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                一键生成独立 aio-sandbox 实例，默认使用资源池配置。仅在调试或定制运行环境时展开高级配置。
              </p>
            </div>
          </div>
          <Badge className="w-fit rounded-2xl border-violet-400/18 bg-violet-400/10 px-3 py-1.5 text-violet-100">
            自动命名
          </Badge>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <label className="block">
              <span className="text-xs font-medium text-slate-400">自动生成的沙箱 ID</span>
              <input
                value={value.sandboxId}
                readOnly
                disabled={disabled}
                className={cn(
                  formInputClassName('mt-1.5 cursor-default font-mono text-xs'),
                  'disabled:cursor-not-allowed disabled:opacity-60',
                )}
              />
            </label>
            <div className="flex items-end">
              <Button
                type="button"
                variant="secondary"
                onClick={onGenerateId}
                disabled={disabled || creating}
                className="h-10 w-full md:w-auto"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                重新生成
              </Button>
            </div>
          </div>

          <Button type="submit" disabled={disabled || creating || !value.sandboxId.trim()} className="h-10 shrink-0">
            {creating ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            {creating ? '创建中' : '创建沙箱'}
          </Button>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-white/8 bg-white/[0.035] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm leading-6 text-slate-400">
            <span className="font-medium text-slate-200">默认创建：</span>
            自动生成高熵 ID，使用资源池默认镜像，无需用户填写额外参数。
          </div>
          <Button type="button" variant="secondary" onClick={onToggleAdvanced} disabled={disabled || creating} className="shrink-0">
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            {showAdvanced ? '收起高级配置' : '高级配置'}
          </Button>
        </div>

        {showAdvanced && (
          <div className="rounded-[24px] border border-white/8 bg-slate-950/45 p-4">
            <div className="flex flex-col gap-2 border-b border-white/8 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-sm font-semibold text-white">运行参数</h4>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  仅用于临时调试、验证新镜像或排查运行问题。普通创建建议保持为空。
                </p>
              </div>
              <Badge className="w-fit rounded-xl border-amber-400/18 bg-amber-400/10 px-2.5 py-1 text-amber-100">
                可选
              </Badge>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <label className="block rounded-2xl border border-white/8 bg-white/[0.035] p-3 lg:col-span-2">
                <span className="text-xs font-medium text-slate-300">运行镜像</span>
                <p className="mt-1 text-xs text-slate-500">留空时使用资源池默认 aio-sandbox 镜像。</p>
                <input
                  value={value.image}
                  onChange={(event) => onChange({ ...value, image: event.target.value })}
                  placeholder="例如：registry.example.com/aio-sandbox:debug"
                  disabled={disabled || creating}
                  className={cn(formInputClassName('mt-3 font-mono text-xs'), 'disabled:cursor-not-allowed disabled:opacity-60')}
                />
              </label>

              <label className="block rounded-2xl border border-white/8 bg-white/[0.035] p-3">
                <span className="text-xs font-medium text-slate-300">环境变量</span>
                <p className="mt-1 text-xs text-slate-500">传入容器启动参数，每行一组 KEY=VALUE。</p>
                <textarea
                  rows={4}
                  value={value.envText}
                  onChange={(event) => onChange({ ...value, envText: event.target.value })}
                  placeholder={'LOG_LEVEL=debug\nFEATURE_FLAG=true'}
                  disabled={disabled || creating}
                  className={cn(
                    formInputClassName('mt-3 resize-none font-mono text-xs'),
                    'disabled:cursor-not-allowed disabled:opacity-60',
                  )}
                />
              </label>

              <label className="block rounded-2xl border border-white/8 bg-white/[0.035] p-3">
                <span className="text-xs font-medium text-slate-300">资源标签</span>
                <p className="mt-1 text-xs text-slate-500">追加到 Kubernetes labels，用于筛选和归类。</p>
                <textarea
                  rows={4}
                  value={value.labelsText}
                  onChange={(event) => onChange({ ...value, labelsText: event.target.value })}
                  placeholder={'owner=team-a\npurpose=debug'}
                  disabled={disabled || creating}
                  className={cn(
                    formInputClassName('mt-3 resize-none font-mono text-xs'),
                    'disabled:cursor-not-allowed disabled:opacity-60',
                  )}
                />
              </label>
            </div>
          </div>
        )}
      </form>
    </section>
  )
}

function HealthPanel({ health }: { health: SandboxPoolHealth | null }) {
  const errorText = health?.extra.error
  const enabled = health?.enabled ?? false

  return (
    <section className="overflow-hidden rounded-[28px] border border-white/8 bg-slate-950/70 shadow-[0_24px_80px_rgba(2,6,23,0.32)]">
      <div className="relative border-b border-white/8 p-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(59,130,246,0.2),transparent_38%),radial-gradient(circle_at_88%_20%,rgba(16,185,129,0.16),transparent_34%)]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-300/20 bg-blue-400/12 text-blue-200">
                <Layers3 className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200/80">
                  Kubernetes Sandbox Pool
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">沙箱资源池</h1>
              </div>
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              查看当前由本地后端直连 Kubernetes API 管理的 aio-sandbox 实例，包含 Pod、Service、Ingress、节点、运行状态和访问地址。
            </p>
          </div>

          <Badge
            className={cn(
              'w-fit rounded-2xl px-3 py-2 text-sm',
              enabled && !errorText
                ? 'border-emerald-400/24 bg-emerald-400/10 text-emerald-200'
                : 'border-amber-400/24 bg-amber-400/10 text-amber-200',
            )}
          >
            {enabled && !errorText ? '资源池可用' : '等待配置'}
          </Badge>
        </div>
      </div>

      <div className="grid gap-3 p-5 md:grid-cols-3">
        <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Server className="h-4 w-4 text-blue-300" />
            Backend
          </div>
          <div className="mt-2 text-sm font-medium text-slate-100">{health?.backend ?? '-'}</div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Network className="h-4 w-4 text-emerald-300" />
            Namespace
          </div>
          <div className="mt-2 text-sm font-medium text-slate-100">{health?.namespace ?? '-'}</div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Cpu className="h-4 w-4 text-violet-300" />
            Client
          </div>
          <div className="mt-2 text-sm font-medium text-slate-100">{health?.client ?? '-'}</div>
        </div>
      </div>

      {errorText && (
        <div className="mx-5 mb-5 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorText}</span>
          </div>
        </div>
      )}
    </section>
  )
}

function SandboxCard({
  sandbox,
  deleting,
  onDelete,
}: {
  sandbox: SandboxSummary
  deleting: boolean
  onDelete: (sandboxId: string) => void
}) {
  return (
    <article className="group overflow-hidden rounded-[24px] border border-white/8 bg-white/[0.045] shadow-[0_18px_48px_rgba(2,6,23,0.24)] transition hover:border-blue-300/18 hover:bg-white/[0.06]">
      <div className="border-b border-white/8 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-blue-300/20 bg-blue-400/12 text-blue-200">
                <Box className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-white">{sandbox.sandboxId}</h3>
                <p className="mt-0.5 truncate text-xs text-slate-500">{sandbox.podName || '未绑定 Pod'}</p>
              </div>
            </div>
          </div>
          <Badge className={cn('shrink-0 rounded-xl px-2.5 py-1', statusClassName(sandbox.status))}>
            {statusLabel(sandbox.status)}
          </Badge>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-2xl border border-white/8 bg-slate-950/32 p-3">
            <div className="text-slate-500">命名空间</div>
            <div className="mt-1 truncate font-medium text-slate-200">{sandbox.namespace || '-'}</div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-slate-950/32 p-3">
            <div className="text-slate-500">节点</div>
            <div className="mt-1 truncate font-medium text-slate-200">{sandbox.nodeName || '-'}</div>
          </div>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-xs text-slate-500">
            <ExternalLink className="h-3.5 w-3.5" />
            访问地址
          </div>
          <div className="break-all rounded-2xl border border-white/8 bg-slate-950/36 px-3 py-2 font-mono text-xs text-blue-100">
            {sandbox.sandboxUrl || '-'}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
          <div className="rounded-2xl bg-white/[0.035] p-3">
            <div className="text-slate-500">Pod IP</div>
            <div className="mt-1 font-medium text-slate-200">{sandbox.podIp || '-'}</div>
          </div>
          <div className="rounded-2xl bg-white/[0.035] p-3">
            <div className="text-slate-500">创建时间</div>
            <div className="mt-1 font-medium text-slate-200">{formatDate(sandbox.createdAt)}</div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="min-w-0 truncate text-xs text-slate-500">
            Service: {sandbox.serviceName || '-'}
            {sandbox.ingressName ? ` · Ingress: ${sandbox.ingressName}` : ''}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={deleting}
            onClick={() => onDelete(sandbox.sandboxId)}
            className="border-rose-400/10 text-rose-200 hover:bg-rose-400/10"
          >
            {deleting ? <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
            删除
          </Button>
        </div>
      </div>
    </article>
  )
}

export function SandboxPoolPage() {
  const [health, setHealth] = useState<SandboxPoolHealth | null>(null)
  const [sandboxes, setSandboxes] = useState<SandboxSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [createForm, setCreateForm] = useState<CreateSandboxFormState>(() => createDefaultForm())
  const [showCreateAdvanced, setShowCreateAdvanced] = useState(false)

  const createDisabled = !health?.enabled || Boolean(health?.extra.error)

  const stats = useMemo(() => {
    const running = sandboxes.filter((item) => item.status === 'Running').length
    const pending = sandboxes.filter((item) => item.status === 'Pending').length
    const failed = sandboxes.filter((item) => item.status === 'Failed').length
    const nodes = new Set(sandboxes.map((item) => item.nodeName).filter(Boolean)).size
    return { running, pending, failed, nodes }
  }, [sandboxes])

  const load = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError('')

    try {
      const [nextHealth, nextSandboxes] = await Promise.all([
        getSandboxPoolHealth(),
        listSandboxes(),
      ])
      setHealth(nextHealth)
      setSandboxes(nextSandboxes)
    } catch (currentError) {
      const message = currentError instanceof Error ? currentError.message : '加载沙箱资源池失败'
      setError(message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreating(true)
    setError('')
    setNotice('')

    try {
      const createdSandbox = await createSandbox({
        sandboxId: createForm.sandboxId.trim(),
        image: createForm.image.trim(),
        env: parseKeyValueText(createForm.envText, '环境变量'),
        labels: parseKeyValueText(createForm.labelsText, '标签'),
      })
      setNotice(`沙箱 ${createdSandbox.sandboxId} 已提交创建，实例状态会在资源池中持续更新。`)
      setCreateForm(createDefaultForm())
      setShowCreateAdvanced(false)
      await load(true)
    } catch (currentError) {
      const message = currentError instanceof Error ? currentError.message : '创建沙箱失败'
      setError(message)
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(sandboxId: string) {
    const confirmed = window.confirm(`确认删除沙箱 ${sandboxId} 吗？该操作会删除对应 Pod、Service 和 Ingress。`)
    if (!confirmed) {
      return
    }

    setDeletingId(sandboxId)
    setError('')
    try {
      await deleteSandbox(sandboxId)
      setSandboxes((current) => current.filter((item) => item.sandboxId !== sandboxId))
      await load(true)
    } catch (currentError) {
      const message = currentError instanceof Error ? currentError.message : '删除沙箱失败'
      setError(message)
    } finally {
      setDeletingId('')
    }
  }

  return (
    <main className="min-h-0 flex-1 overflow-auto p-4 lg:p-6">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-200/70">Resource Pool</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">沙箱资源池总览</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => void load(true)}
              disabled={refreshing || loading}
              className="w-fit"
            >
              <RefreshCw className={cn('mr-2 h-4 w-4', refreshing && 'animate-spin')} />
              刷新资源池
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-100">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {notice && (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{notice}</span>
            </div>
          </div>
        )}

        <HealthPanel health={health} />

        <CreateSandboxPanel
          value={createForm}
          creating={creating}
          disabled={createDisabled}
          showAdvanced={showCreateAdvanced}
          onChange={setCreateForm}
          onSubmit={handleCreate}
          onGenerateId={() => setCreateForm((current) => ({ ...current, sandboxId: createSandboxId() }))}
          onToggleAdvanced={() => setShowCreateAdvanced((current) => !current)}
        />

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={ShieldCheck} label="运行中沙箱" value={stats.running} tone="emerald" />
          <StatCard icon={LoaderCircle} label="启动中沙箱" value={stats.pending} tone="blue" />
          <StatCard icon={AlertTriangle} label="异常沙箱" value={stats.failed} tone="amber" />
          <StatCard icon={Server} label="承载节点" value={stats.nodes} tone="violet" />
        </div>

        <section className="rounded-[28px] border border-white/8 bg-slate-950/62 p-5 shadow-[0_24px_80px_rgba(2,6,23,0.24)]">
          <div className="flex flex-col gap-3 border-b border-white/8 pb-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">沙箱实例</h3>
              <p className="mt-1 text-sm text-slate-400">展示当前资源池内可见的 aio-sandbox Pod、Service 和 Ingress。</p>
            </div>
            <Badge className="w-fit rounded-2xl border-blue-400/20 bg-blue-400/10 px-3 py-1.5 text-blue-100">
              共 {sandboxes.length} 个实例
            </Badge>
          </div>

          {loading ? (
            <div className="flex min-h-[280px] items-center justify-center">
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-slate-300">
                <LoaderCircle className="h-4 w-4 animate-spin text-blue-300" />
                加载沙箱资源池中
              </div>
            </div>
          ) : sandboxes.length > 0 ? (
            <div className="mt-5 grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
              {sandboxes.map((sandbox) => (
                <SandboxCard
                  key={sandbox.sandboxId}
                  sandbox={sandbox}
                  deleting={deletingId === sandbox.sandboxId}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          ) : (
            <div className="mt-5 flex min-h-[280px] flex-col items-center justify-center rounded-[24px] border border-dashed border-blue-300/18 bg-blue-400/[0.035] p-8 text-center">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-3xl border border-blue-300/20 bg-blue-400/10 text-blue-200">
                <Clock3 className="h-6 w-6" />
              </div>
              <h4 className="mt-4 text-base font-semibold text-white">暂无沙箱实例</h4>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">
                资源池已连接但当前没有由 `agentic-workflow-studio` 管理的沙箱。运行工作流或调用创建接口后会显示在这里。
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
