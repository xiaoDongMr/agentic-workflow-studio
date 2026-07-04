import type { WorkflowNodeConfig } from '@/types/workflow'

export type CodeAuthoringMode = 'sandbox_file' | 'sandbox_snippet'

export type CodeExecutionCapability = 'python' | 'browser'

export type CodeWorkspaceOpeningMode = 'drawer' | 'external' | null

export const CODE_SYNC_STATUS_LABELS: Record<NonNullable<WorkflowNodeConfig['codeSyncStatus']>, string> = {
  dirty: '待同步',
  failed: '同步失败',
  saved: '已同步',
  saving: '同步中',
}

export const CODE_AUTHORING_OPTIONS: Array<{
  value: CodeAuthoringMode
  title: string
  description: string
}> = [
  {
    value: 'sandbox_snippet',
    title: '脚本片段',
    description: '轻量脚本',
  },
  {
    value: 'sandbox_file',
    title: '沙箱文件',
    description: '复杂代码',
  },
]

export const CODE_EXECUTION_CAPABILITY_OPTIONS: Array<{
  value: CodeExecutionCapability
  title: string
  description: string
}> = [
  {
    value: 'python',
    title: 'Python 脚本',
    description: '通用执行',
  },
  {
    value: 'browser',
    title: '浏览器操作',
    description: 'VNC/CDP',
  },
]

export const DEFAULT_CODE_ENTRY_FILE_NAME = 'main.py'
export const BROWSER_CODE_ENTRY_FILE_NAME = 'browser_main.py'
export const DEFAULT_SANDBOX_CODE_FILE_PATH = '/home/gem/code/main.py'
export const DEFAULT_SANDBOX_WORKFLOW_CODE_ROOT = '/home/gem/workflows'

export const LEGACY_CODE_FILE_PATH = '/workspace/code/main.py'
export const LEGACY_WORKFLOW_CODE_ROOT_PREFIXES = [
  '/workspace/workflows/',
  '/mnt/user-data/workspace/workflows/',
]
