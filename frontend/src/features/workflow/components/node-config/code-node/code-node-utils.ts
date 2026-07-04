import type { NodeConfigPanelProps } from '@/features/workflow/components/node-config/config-fields'
import { DEFAULT_CODE_SNIPPET } from '@/features/workflow/code-node-defaults'
import type { SandboxSummary } from '@/api/sandbox-pool'
import type { WorkflowNodeConfig, WorkflowNodeIO } from '@/types/workflow'

import {
  BROWSER_CODE_ENTRY_FILE_NAME,
  DEFAULT_CODE_ENTRY_FILE_NAME,
  DEFAULT_SANDBOX_CODE_FILE_PATH,
  DEFAULT_SANDBOX_WORKFLOW_CODE_ROOT,
  LEGACY_CODE_FILE_PATH,
  LEGACY_WORKFLOW_CODE_ROOT_PREFIXES,
  type CodeAuthoringMode,
} from './code-node-constants'

export function isLegacyCodeResultOutput(outputs: WorkflowNodeIO[]) {
  return outputs.length === 1 && outputs[0]?.name === 'code_result' && outputs[0]?.type === 'Object'
}

export function isBrowserCapableSandbox(sandbox?: SandboxSummary | null) {
  if (!sandbox) {
    return false
  }
  const candidates = [
    sandbox.imageId,
    sandbox.image,
    ...Object.keys(sandbox.labels ?? {}),
    ...Object.values(sandbox.labels ?? {}),
  ]
    .join(' ')
    .toLowerCase()
  return ['browser', 'playwright', 'chromium', 'chrome', 'vnc', 'cdp'].some((keyword) =>
    candidates.includes(keyword),
  )
}

export function buildBrowserPreviewUrl(sandboxUrl?: string) {
  const baseUrl = sandboxUrl?.trim().replace(/\/+$/, '')
  if (!baseUrl) {
    return ''
  }
  return `${baseUrl}/vnc/index.html?autoconnect=true`
}

export function formatCodeLanguage(language?: WorkflowNodeConfig['codeLanguage']) {
  if (language === 'python' || !language) {
    return 'Python'
  }
  return language
}

export function formatCodeFileName(path: string) {
  return path.split('/').filter(Boolean).pop() || DEFAULT_CODE_ENTRY_FILE_NAME
}

export function resolveCodeAuthoringMode(codeSource?: WorkflowNodeConfig['codeSource']): CodeAuthoringMode {
  return codeSource === 'sandbox_file' ? 'sandbox_file' : 'sandbox_snippet'
}

export function resolveCodeSnippet(code?: string) {
  return code ?? DEFAULT_CODE_SNIPPET
}

export function getCodeWorkspaceOpenState({
  sandbox,
  sandboxSession,
  workflowId,
  workflowSaved,
}: Pick<NodeConfigPanelProps, 'sandbox' | 'sandboxSession' | 'workflowId' | 'workflowSaved'>) {
  if (!workflowSaved || !workflowId) {
    return {
      canOpen: false,
      message: '保存 workflow 后可创建节点代码目录。',
    }
  }
  if (!sandboxSession?.sandboxId) {
    return {
      canOpen: false,
      message: '请先在顶部沙箱菜单创建或关联调试沙箱。',
    }
  }
  if (!sandbox) {
    return {
      canOpen: false,
      message: '正在获取沙箱状态，稍后可打开 Code 工作区。',
    }
  }
  if (sandbox.expired) {
    return {
      canOpen: false,
      message: '当前沙箱已过期，请替换后再打开 Code 工作区。',
    }
  }
  if (sandbox.status !== 'Running') {
    return {
      canOpen: false,
      message: `沙箱当前状态为 ${sandbox.status}，运行中后可打开 Code 工作区。`,
    }
  }
  return {
    canOpen: true,
    message: '将在当前调试沙箱中打开该节点的独立代码目录。',
  }
}

export function resolveCodeFilePath(
  workflowId: string,
  nodeId: string,
  configuredPath?: string,
  entryFileName = DEFAULT_CODE_ENTRY_FILE_NAME,
) {
  const normalizedPath = configuredPath?.trim()
  if (
    normalizedPath &&
    normalizedPath !== LEGACY_CODE_FILE_PATH &&
    LEGACY_WORKFLOW_CODE_ROOT_PREFIXES.every((prefix) => !normalizedPath.startsWith(prefix))
  ) {
    return normalizedPath
  }
  if (workflowId && nodeId) {
    return `${DEFAULT_SANDBOX_WORKFLOW_CODE_ROOT}/${workflowId}/nodes/${nodeId}/${entryFileName}`
  }
  return normalizedPath || DEFAULT_SANDBOX_CODE_FILE_PATH
}

export function resolveDefaultEntryFileName(codeCapability?: WorkflowNodeConfig['codeCapability']) {
  return codeCapability === 'browser' ? BROWSER_CODE_ENTRY_FILE_NAME : DEFAULT_CODE_ENTRY_FILE_NAME
}

export function resolveCodeOutputKey(outputs: Array<{ name: string }>) {
  return outputs.find((output) => output.name.trim())?.name.trim() || 'code_result'
}
