import { useCallback, useState } from 'react'

import { listWorkflowVersions, type WorkflowVersionSummary } from '@/api/workflow'
import { getErrorMessage } from '@/features/workflow/utils/error-message'

export function useWorkflowVersions() {
  const [workflowVersions, setWorkflowVersions] = useState<WorkflowVersionSummary[]>([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [versionsError, setVersionsError] = useState('')
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null)

  const clearWorkflowVersions = useCallback(() => {
    setWorkflowVersions([])
    setVersionsError('')
  }, [])

  const refreshWorkflowVersions = useCallback(async (workflowId: string) => {
    if (!workflowId) {
      clearWorkflowVersions()
      return
    }

    setVersionsLoading(true)
    setVersionsError('')
    try {
      const versions = await listWorkflowVersions(workflowId)
      setWorkflowVersions(versions)
    } catch (error) {
      setWorkflowVersions([])
      setVersionsError(getErrorMessage(error, '加载版本列表失败'))
    } finally {
      setVersionsLoading(false)
    }
  }, [clearWorkflowVersions])

  return {
    clearWorkflowVersions,
    refreshWorkflowVersions,
    restoringVersionId,
    setRestoringVersionId,
    versionsError,
    versionsLoading,
    workflowVersions,
  }
}
