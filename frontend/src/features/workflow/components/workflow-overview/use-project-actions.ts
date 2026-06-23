import { useState } from 'react'

import type { WorkflowProjectActionTarget, WorkflowProjectMetadata } from './types'

interface UseProjectActionsParams {
  onDeleteLocalDraft: (workflowId: string) => void
  onDeleteProject: (workflowId: string) => Promise<void>
  onDuplicateLocalDraft: (workflowId: string) => void
  onDuplicateProject: (workflowId: string) => Promise<void>
  onUpdateLocalDraft: (workflowId: string, metadata: WorkflowProjectMetadata) => void
  onUpdateProject: (workflowId: string, metadata: WorkflowProjectMetadata) => Promise<void>
}

export function useProjectActions({
  onDeleteLocalDraft,
  onDeleteProject,
  onDuplicateLocalDraft,
  onDuplicateProject,
  onUpdateLocalDraft,
  onUpdateProject,
}: UseProjectActionsParams) {
  const [editingProject, setEditingProject] = useState<WorkflowProjectActionTarget | null>(null)
  const [deletingProject, setDeletingProject] = useState<WorkflowProjectActionTarget | null>(null)
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  const openEditDialog = (target: WorkflowProjectActionTarget) => {
    setActionError('')
    setEditingProject(target)
  }

  const openDeleteDialog = (target: WorkflowProjectActionTarget) => {
    setActionError('')
    setDeletingProject(target)
  }

  const submitProjectMetadata = async (metadata: WorkflowProjectMetadata) => {
    if (!editingProject) {
      return
    }

    const nextMetadata = normalizeProjectMetadata(metadata)
    if (nextMetadata.name === editingProject.name && nextMetadata.description === editingProject.description) {
      setEditingProject(null)
      return
    }

    setActionBusy(`edit:${editingProject.id}`)
    setActionError('')
    try {
      if (editingProject.source === 'local') {
        onUpdateLocalDraft(editingProject.id, nextMetadata)
      } else {
        await onUpdateProject(editingProject.id, nextMetadata)
      }
      setEditingProject(null)
    } catch (error) {
      setActionError(getProjectActionError(error, '更新工作流信息失败'))
    } finally {
      setActionBusy(null)
    }
  }

  const confirmProjectDelete = async () => {
    if (!deletingProject) {
      return
    }

    setActionBusy(`delete:${deletingProject.id}`)
    setActionError('')
    try {
      if (deletingProject.source === 'local') {
        onDeleteLocalDraft(deletingProject.id)
      } else {
        await onDeleteProject(deletingProject.id)
      }
      setDeletingProject(null)
    } catch (error) {
      setActionError(getProjectActionError(error, '删除工作流失败'))
    } finally {
      setActionBusy(null)
    }
  }

  const duplicateProject = async (target: WorkflowProjectActionTarget) => {
    setActionBusy(`duplicate:${target.id}`)
    setActionError('')
    try {
      if (target.source === 'local') {
        onDuplicateLocalDraft(target.id)
      } else {
        await onDuplicateProject(target.id)
      }
    } catch (error) {
      setActionError(getProjectActionError(error, '复制工作流失败'))
    } finally {
      setActionBusy(null)
    }
  }

  return {
    actionBusy,
    actionError,
    confirmProjectDelete,
    deletingProject,
    duplicateProject,
    editingProject,
    openDeleteDialog,
    openEditDialog,
    setDeletingProject,
    setEditingProject,
    submitProjectMetadata,
  }
}

function normalizeProjectMetadata(metadata: WorkflowProjectMetadata): WorkflowProjectMetadata {
  return {
    name: metadata.name.trim() || '未命名项目',
    description: metadata.description.trim(),
  }
}

function getProjectActionError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}
