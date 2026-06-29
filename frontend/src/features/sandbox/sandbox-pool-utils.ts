import type { SandboxImageSummary, SandboxStatus } from '@/api/sandbox-pool'
import type { SandboxImageCapability } from '@/features/sandbox/sandbox-image-capabilities'
import type { CreateSandboxFormState, CustomImageFormState } from '@/features/sandbox/sandbox-pool-types'
import { cn } from '@/lib/utils'

export function formatDate(value: string): string {
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

export function formatDateTime(value: string): string {
  if (!value) {
    return '-'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) {
    return '0 秒'
  }

  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = Math.floor(seconds % 60)

  if (days > 0) {
    return `${days} 天 ${hours} 小时`
  }
  if (hours > 0) {
    return `${hours} 小时 ${minutes} 分钟`
  }
  if (minutes > 0) {
    return `${minutes} 分钟 ${remainingSeconds} 秒`
  }
  return `${remainingSeconds} 秒`
}

export function formatExpiresAt(value: string): string {
  return formatDateTime(value)
}

export function formatTtlSeconds(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '未设置'
  }
  if (value <= 0) {
    return '不过期'
  }
  return formatDuration(value)
}

export function formatRemainingTtl(expiresAt: string, expired: boolean): string {
  if (!expiresAt) {
    return '不过期'
  }
  if (expired) {
    return '已过期'
  }

  const expiresAtTime = new Date(expiresAt).getTime()
  if (Number.isNaN(expiresAtTime)) {
    return '-'
  }
  const remainingSeconds = Math.max(0, Math.ceil((expiresAtTime - Date.now()) / 1000))
  return formatDuration(remainingSeconds)
}

export function parseSandboxTtlSeconds(value: string): number | undefined {
  const normalizedValue = value.trim()
  if (!normalizedValue) {
    return undefined
  }

  const parsedValue = Number(normalizedValue)
  if (!Number.isInteger(parsedValue) || parsedValue < 0) {
    throw new Error('过期时间请输入大于等于 0 的整数秒数')
  }
  return parsedValue
}

export function createSandboxId(): string {
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

export function createDefaultCustomImageForm(): CustomImageFormState {
  return {
    name: '',
    image: '',
    description: '',
  }
}

export function createDefaultForm(): CreateSandboxFormState {
  return {
    sandboxId: createSandboxId(),
    image: '',
    ttlSeconds: '',
    envText: '',
    labelsText: '',
  }
}

export function toSandboxImageCapability(image: SandboxImageSummary): SandboxImageCapability {
  const manifest = image.capabilityManifest ?? {}
  return {
    id: image.id,
    name: image.name,
    image: image.image,
    digest: image.digest || '由镜像仓库 tag/digest 决定',
    description: image.description || '基于 AioSandbox 基础镜像扩展的运行镜像。',
    source: image.source,
    default: image.isDefault,
    pythonVersion: image.pythonVersion || 'Python 版本待运行时探测',
    tools: Array.isArray(manifest.tools) ? manifest.tools : ['继承 AioSandbox 基础能力', '自定义依赖由镜像提供'],
    runtimes: Array.isArray(manifest.runtimes) ? manifest.runtimes : ['Python', 'JavaScript/Node.js', 'Jupyter Notebook', 'AioSandbox API'],
    capabilities: Array.isArray(manifest.capabilities) ? manifest.capabilities : ['统一文件系统', '命令执行', '代码执行', '浏览器自动化', '端口代理预览'],
    limits: Array.isArray(manifest.limits) ? manifest.limits : ['需要集群节点具备镜像仓库拉取权限', '建议基于 AioSandbox 官方镜像扩展', '不要改动原始 ENTRYPOINT/CMD 和监听端口'],
    preloadStatus: image.preloadStatus,
    preloadReady: image.preloadReady,
    preloadDesired: image.preloadDesired,
    preloadMessage: image.preloadMessage,
  }
}

export function parseKeyValueText(value: string, fieldLabel: string): Record<string, string> {
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
    const fieldValue = line.slice(separatorIndex + 1).trim()
    if (!key) {
      throw new Error(`${fieldLabel} 存在空 Key`)
    }
    result[key] = fieldValue
  }
  return result
}

export function formInputClassName(className?: string): string {
  return cn(
    'w-full rounded-2xl border border-white/8 bg-slate-950/70 px-3.5 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-blue-400/60 focus:bg-slate-950/90',
    className,
  )
}

export function statusClassName(status: SandboxStatus): string {
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

export function statusLabel(status: SandboxStatus): string {
  const labels: Record<SandboxStatus, string> = {
    Pending: '启动中',
    Running: '运行中',
    Succeeded: '已完成',
    Failed: '异常',
    Unknown: '未知',
  }
  return labels[status] ?? status
}

export function preloadLabel(status: string): string {
  const labels: Record<string, string> = {
    builtin: '内置镜像',
    ready: '已预热',
    warming: '预热中',
    pending: '等待预热',
    not_configured: '未预热',
    unknown: '状态未知',
  }
  return labels[status] ?? '未预热'
}

export function preloadClassName(status: string): string {
  if (status === 'ready' || status === 'builtin') {
    return 'border-emerald-300/24 bg-emerald-400/12 text-emerald-100'
  }
  if (status === 'warming' || status === 'pending') {
    return 'border-blue-300/24 bg-blue-400/12 text-blue-100'
  }
  if (status === 'unknown') {
    return 'border-amber-300/24 bg-amber-400/12 text-amber-100'
  }
  return 'border-slate-300/14 bg-slate-400/8 text-slate-300'
}

export function preloadProgressPercent(ready: number, desired: number, status: string): number {
  if (status === 'ready' || status === 'builtin') {
    return 100
  }
  if (desired <= 0) {
    return 0
  }
  return Math.min(100, Math.round((ready / desired) * 100))
}
