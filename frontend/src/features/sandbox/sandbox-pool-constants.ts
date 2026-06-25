import type { SandboxStatusFilterOption } from '@/features/sandbox/sandbox-pool-types'

export const SANDBOX_PAGE_SIZE_OPTIONS = [6, 12, 24]
export const CUSTOM_IMAGE_PAGE_SIZE_OPTIONS = [6, 12, 24]

export const SANDBOX_STATUS_FILTER_OPTIONS: SandboxStatusFilterOption[] = [
  { value: '', label: '全部状态' },
  { value: 'Pending', label: '启动中' },
  { value: 'Running', label: '运行中' },
  { value: 'Succeeded', label: '已完成' },
  { value: 'Failed', label: '异常' },
  { value: 'Unknown', label: '未知' },
]

export const CUSTOM_IMAGE_DEFAULT_CAPABILITY_MANIFEST = {
  tools: ['继承 AioSandbox 基础能力', '自定义依赖由镜像提供'],
  runtimes: ['Python', 'JavaScript/Node.js', 'Jupyter Notebook', 'AioSandbox API'],
  capabilities: ['统一文件系统', '命令执行', '代码执行', '浏览器自动化', '端口代理预览'],
  limits: ['需要集群节点具备镜像仓库拉取权限', '建议基于 AioSandbox 官方镜像扩展', '不要改动原始 ENTRYPOINT/CMD 和监听端口'],
}

export const NOTICE_AUTO_DISMISS_MS = 4000
export const ERROR_AUTO_DISMISS_MS = 8000
export const PRELOAD_POLL_INTERVAL_MS = 1500
export const PRELOAD_POLL_MAX_ATTEMPTS = 20
