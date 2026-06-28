import type { SandboxStatus } from '@/api/sandbox-pool'

export const WORKFLOW_SANDBOX_PURPOSE_LABEL = 'workflow-debug'

export const RUNNING_SANDBOX_PAGE_SIZE = 5

export const SANDBOX_READY_POLL_INTERVAL_MS = 500
export const SANDBOX_READY_POLL_TIMEOUT_MS = 3 * 60 * 1000

export const TERMINAL_SANDBOX_STATUSES = new Set<SandboxStatus>([
  'Running',
  'Failed',
  'Succeeded',
])
