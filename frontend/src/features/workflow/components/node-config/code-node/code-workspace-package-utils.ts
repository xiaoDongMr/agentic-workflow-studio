import type {
  WorkflowCodeWorkspaceSaveResult,
  WorkflowCodeWorkspaceStatus,
} from '@/api/workflow'

export function formatWorkspacePackageStatus(status?: WorkflowCodeWorkspaceStatus | null) {
  if (!status?.packageId) {
    return '暂无已保存工作区；保存 workflow 时会自动同步有变更的工作区。'
  }
  const savedAt = status.savedAt ? new Date(status.savedAt).toLocaleString() : ''
  return `已保存 ${status.fileCount} 个文件 · ${formatBytes(status.totalSize)}${savedAt ? ` · ${savedAt}` : ''}`
}

export function formatWorkspacePackageSaveResult(result: WorkflowCodeWorkspaceSaveResult) {
  if (result.status === 'saved') {
    return `工作区已保存 · ${result.fileCount} 个文件 · ${formatBytes(result.totalSize)}`
  }
  return result.message || '工作区内容无变化'
}

export function formatBytes(size: number) {
  if (!Number.isFinite(size) || size <= 0) {
    return '0 B'
  }
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
