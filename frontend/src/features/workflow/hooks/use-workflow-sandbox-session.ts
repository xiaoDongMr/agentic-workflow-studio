import { useCallback, useEffect, useState } from 'react'

import {
  ensureWorkflowSandboxSession,
  updateWorkflowSandboxSession,
  type WorkflowSandboxSession,
} from '@/api/workflow'
import {
  createSandbox,
  getSandbox,
  listSandboxes,
  type SandboxSummary,
} from '@/api/sandbox-pool'
import { createSandboxId, parseSandboxTtlSeconds } from '@/features/sandbox/sandbox-pool-utils'
import { useRunningSandboxPages } from '@/features/workflow/hooks/use-running-sandbox-pages'
import { useSandboxImages } from '@/features/workflow/hooks/use-sandbox-images'
import { useSandboxStatusPolling } from '@/features/workflow/hooks/use-sandbox-status-polling'
import { getErrorMessage } from '@/features/workflow/utils/error-message'
import { WORKFLOW_SANDBOX_PURPOSE_LABEL } from '@/features/workflow/workflow-sandbox-constants'

interface UseWorkflowSandboxSessionOptions {
  enabled: boolean
  workflowId: string
}

export function useWorkflowSandboxSession({
  enabled,
  workflowId,
}: UseWorkflowSandboxSessionOptions) {
  const [session, setSession] = useState<WorkflowSandboxSession | null>(null)
  const [sandbox, setSandbox] = useState<SandboxSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState('')

  const canLoad = enabled && Boolean(workflowId)
  const {
    hasNextPage: availableSandboxesHasNextPage,
    hasPreviousPage: availableSandboxesHasPreviousPage,
    loadNextPage: loadNextAvailableSandboxes,
    loadPreviousPage: loadPreviousAvailableSandboxes,
    loading: availableSandboxesLoading,
    pageIndex: availableSandboxesPageIndex,
    refresh: refreshAvailableSandboxes,
    sandboxes: availableSandboxes,
  } = useRunningSandboxPages(canLoad)
  const {
    images: sandboxImages,
    loading: sandboxImagesLoading,
    refresh: refreshSandboxImages,
  } = useSandboxImages()
  const {
    cancelPolling: cancelSandboxPolling,
    pollUntilReady: pollSandboxUntilReady,
    polling: sandboxStatusPolling,
  } = useSandboxStatusPolling(setSandbox)

  const load = useCallback(async () => {
    if (!canLoad) {
      cancelSandboxPolling()
      setSession(null)
      setSandbox(null)
      return null
    }

    setLoading(true)
    setError('')
    try {
      const nextSession = await ensureWorkflowSandboxSession(workflowId)
      setSession(nextSession)
      if (nextSession.sandboxId) {
        try {
          const nextSandbox = await getSandbox(nextSession.sandboxId)
          cancelSandboxPolling()
          setSandbox(nextSandbox)
          if (nextSandbox.status !== 'Running') {
            void pollSandboxUntilReady(nextSession.sandboxId)
          }
        } catch {
          setSandbox(null)
        }
      } else {
        cancelSandboxPolling()
        setSandbox(null)
      }
      void refreshAvailableSandboxes()
      return nextSession
    } catch (loadError) {
      const message = getErrorMessage(loadError, '加载调试沙箱会话失败')
      setError(message)
      return null
    } finally {
      setLoading(false)
    }
  }, [canLoad, cancelSandboxPolling, pollSandboxUntilReady, refreshAvailableSandboxes, workflowId])

  const persistSandboxBinding = useCallback(
    async (sandbox: Pick<SandboxSummary, 'sandboxId' | 'sandboxUrl' | 'imageId'>) => {
      const nextSession = await updateWorkflowSandboxSession(workflowId, {
        sandboxId: sandbox.sandboxId,
        sandboxUrl: sandbox.sandboxUrl,
        imageId: sandbox.imageId,
      })
      setSession(nextSession)
      return nextSession
    },
    [workflowId],
  )

  const associateSandboxById = useCallback(
    async (sandboxId: string) => {
      if (!workflowId) {
        setError('当前 workflow 未保存，无法关联调试沙箱')
        return null
      }
      const normalizedSandboxId = sandboxId.trim()
      if (!normalizedSandboxId) {
        setError('请输入要关联的 sandbox id')
        return null
      }

      setUpdating(true)
      setError('')
      try {
        const page = await listSandboxes({ sandboxId: normalizedSandboxId, limit: 1 })
        const sandbox = page.sandboxes.find((item) => item.sandboxId === normalizedSandboxId) ?? page.sandboxes[0]
        if (!sandbox) {
          setError(`未找到沙箱 ${normalizedSandboxId}`)
          return null
        }
        if (sandbox.expired) {
          setError(`沙箱 ${normalizedSandboxId} 已过期，请重新创建或选择其他沙箱`)
          return null
        }
        const nextSession = await persistSandboxBinding(sandbox)
        cancelSandboxPolling()
        setSandbox(sandbox)
        if (sandbox.status !== 'Running') {
          void pollSandboxUntilReady(sandbox.sandboxId)
        }
        return nextSession
      } catch (associateError) {
        const message = getErrorMessage(associateError, '关联调试沙箱失败')
        setError(message)
        return null
      } finally {
        setUpdating(false)
      }
    },
    [cancelSandboxPolling, persistSandboxBinding, pollSandboxUntilReady, workflowId],
  )

  const createAndAssociateSandbox = useCallback(async (imageId: string, ttlSecondsValue = '') => {
    if (!workflowId) {
      setError('当前 workflow 未保存，无法创建调试沙箱')
      return null
    }
    const selectedImageId = imageId.trim()
    if (!selectedImageId) {
      setError('请选择创建沙箱使用的镜像')
      return null
    }
    let ttlSeconds: number | undefined
    try {
      ttlSeconds = parseSandboxTtlSeconds(ttlSecondsValue)
    } catch (ttlError) {
      const message = getErrorMessage(ttlError, '过期时间格式不正确')
      setError(message)
      return null
    }

    setUpdating(true)
    setError('')
    try {
      const created = await createSandbox({
        sandboxId: createSandboxId(),
        imageId: selectedImageId,
        ttlSeconds,
        labels: {
          purpose: WORKFLOW_SANDBOX_PURPOSE_LABEL,
          workflow_id: workflowId,
        },
      })
      const nextSession = await persistSandboxBinding(created)
      cancelSandboxPolling()
      setSandbox(created)
      void pollSandboxUntilReady(created.sandboxId)
      return nextSession
    } catch (createError) {
      const message = getErrorMessage(createError, '创建并关联调试沙箱失败')
      setError(message)
      return null
    } finally {
      setUpdating(false)
    }
  }, [cancelSandboxPolling, persistSandboxBinding, pollSandboxUntilReady, workflowId])

  useEffect(() => {
    void load()
  }, [load])

  return {
    session,
    sandbox,
    availableSandboxes,
    availableSandboxesLoading,
    availableSandboxesHasNextPage,
    availableSandboxesHasPreviousPage,
    availableSandboxesPageIndex,
    sandboxImages,
    sandboxImagesLoading,
    sandboxStatusPolling,
    loading,
    updating,
    error,
    canLoad,
    associateSandboxById,
    createAndAssociateSandbox,
    refresh: load,
    refreshAvailableSandboxes,
    refreshSandboxImages,
    loadNextAvailableSandboxes,
    loadPreviousAvailableSandboxes,
  }
}
