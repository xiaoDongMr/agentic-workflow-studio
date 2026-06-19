import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  deleteWorkflowProject,
  duplicateWorkflowProject,
  getWorkflowDraft,
  listWorkflowProjects,
  saveWorkflowDraft,
  updateWorkflowProject,
  type WorkflowProjectSummary,
} from '@/api/workflow'
import type { AppNavigationView } from '@/features/workflow/components/navigation-sidebar'
import type { WorkflowCanvasApi } from '@/features/workflow/components/workflow-canvas'
import {
  createNewWorkflowDocument,
  findWorkflowNodeById,
  flattenWorkflowEdges,
  flattenWorkflowNodes,
  getWorkflowSignature,
} from '@/features/workflow/utils/workflow-document'
import { useWorkflowStore } from '@/store/workflow-store'

type WorkflowSaveState = 'idle' | 'saving' | 'saved' | 'error'

type PendingWorkflowLeaveAction =
  | { type: 'closeEditor' }
  | { type: 'createWorkflow' }
  | { type: 'openProject'; workflowId: string }
  | { type: 'openLocalDraft'; workflowId: string }
  | { type: 'changeView'; view: AppNavigationView }

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}

export function useWorkflowWorkspace() {
  const workflow = useWorkflowStore((state) => state.workflow)
  const localDrafts = useWorkflowStore((state) => state.localDrafts)
  const selectedNodeId = useWorkflowStore((state) => state.selectedNodeId)
  const draftHydrated = useWorkflowStore((state) => state.draftHydrated)
  const setWorkflow = useWorkflowStore((state) => state.setWorkflow)
  const upsertLocalDraft = useWorkflowStore((state) => state.upsertLocalDraft)
  const updateLocalDraftMetadata = useWorkflowStore((state) => state.updateLocalDraftMetadata)
  const removeLocalDraft = useWorkflowStore((state) => state.removeLocalDraft)
  const setSelectedNodeId = useWorkflowStore((state) => state.setSelectedNodeId)
  const updateSelectedNode = useWorkflowStore((state) => state.updateSelectedNode)

  const [activeView, setActiveView] = useState<AppNavigationView>('workflow')
  const [workflowEditorOpen, setWorkflowEditorOpen] = useState(false)
  const [workflowProjects, setWorkflowProjects] = useState<WorkflowProjectSummary[]>([])
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [projectsError, setProjectsError] = useState('')
  const [openingProjectId, setOpeningProjectId] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<WorkflowSaveState>('idle')
  const [saveMessage, setSaveMessage] = useState('')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [lastSavedSignature, setLastSavedSignature] = useState(() => getWorkflowSignature(workflow))
  const [pendingLeaveAction, setPendingLeaveAction] = useState<PendingWorkflowLeaveAction | null>(null)
  const [leaveDialogSaving, setLeaveDialogSaving] = useState(false)
  const [canvasApi, setCanvasApi] = useState<WorkflowCanvasApi | null>(null)

  const selectedNode = useMemo(
    () => findWorkflowNodeById(workflow.nodes, selectedNodeId),
    [selectedNodeId, workflow.nodes],
  )
  const allWorkflowNodes = useMemo(() => flattenWorkflowNodes(workflow.nodes), [workflow.nodes])
  const allWorkflowEdges = useMemo(
    () => flattenWorkflowEdges(workflow.nodes, workflow.edges),
    [workflow.edges, workflow.nodes],
  )
  const workflowSignature = useMemo(() => getWorkflowSignature(workflow), [workflow])
  const hasUnsavedChanges = lastSavedSignature !== workflowSignature
  const currentWorkflowSaved = useMemo(
    () => workflowProjects.some((project) => project.id === workflow.id),
    [workflow.id, workflowProjects],
  )

  const persistCurrentWorkflowDraft = useCallback(() => {
    if (!draftHydrated || !hasUnsavedChanges || saveStatus === 'saving') {
      return
    }

    upsertLocalDraft(workflow)
  }, [draftHydrated, hasUnsavedChanges, saveStatus, upsertLocalDraft, workflow])

  const requestWorkflowLeave = useCallback(
    (action: PendingWorkflowLeaveAction) => {
      if (!hasUnsavedChanges) {
        return false
      }

      persistCurrentWorkflowDraft()
      setPendingLeaveAction(action)
      return true
    },
    [hasUnsavedChanges, persistCurrentWorkflowDraft],
  )

  const refreshWorkflowProjects = useCallback(async () => {
    setProjectsLoading(true)
    setProjectsError('')
    try {
      const projects = await listWorkflowProjects()
      setWorkflowProjects(projects)
    } catch (error) {
      setProjectsError(getErrorMessage(error, '加载工作流列表失败'))
    } finally {
      setProjectsLoading(false)
    }
  }, [])

  const openWorkflowEditor = useCallback(() => {
    setSelectedNodeId('')
    setCanvasApi(null)
    setWorkflowEditorOpen(true)
  }, [setSelectedNodeId])

  const loadWorkflowProject = useCallback(
    async (workflowId: string) => {
      setOpeningProjectId(workflowId)
      setProjectsError('')
      try {
        const draft = await getWorkflowDraft(workflowId)
        setWorkflow(draft)
        setLastSavedSignature(getWorkflowSignature(draft))
        setLastSavedAt(new Date())
        setSaveStatus('saved')
        setSaveMessage('已加载服务端草稿')
        setSelectedNodeId('')
        setCanvasApi(null)
        setWorkflowEditorOpen(true)
      } catch (error) {
        setProjectsError(getErrorMessage(error, '打开工作流失败'))
      } finally {
        setOpeningProjectId(null)
      }
    },
    [setSelectedNodeId, setWorkflow],
  )

  const activateLocalWorkflowDraft = useCallback(
    (workflowId: string) => {
      const draft = workflow.id === workflowId ? workflow : localDrafts.find((item) => item.id === workflowId)
      if (!draft) {
        return
      }

      setWorkflow(draft)
      setLastSavedSignature('')
      setLastSavedAt(null)
      setSaveStatus('idle')
      setSaveMessage('')
      setSelectedNodeId('')
      setCanvasApi(null)
      setWorkflowEditorOpen(true)
    },
    [localDrafts, setSelectedNodeId, setWorkflow, workflow],
  )

  const startNewWorkflow = useCallback(() => {
    const nextWorkflow = createNewWorkflowDocument()
    setWorkflow(nextWorkflow)
    upsertLocalDraft(nextWorkflow)
    setLastSavedSignature('')
    setLastSavedAt(null)
    setSaveStatus('idle')
    setSaveMessage('')
    setCanvasApi(null)
    setWorkflowEditorOpen(true)
  }, [setWorkflow, upsertLocalDraft])

  const runLeaveAction = useCallback(
    (action: PendingWorkflowLeaveAction) => {
      if (action.type === 'closeEditor') {
        setSelectedNodeId('')
        setCanvasApi(null)
        setWorkflowEditorOpen(false)
        return
      }

      if (action.type === 'createWorkflow') {
        startNewWorkflow()
        return
      }

      if (action.type === 'openProject') {
        void loadWorkflowProject(action.workflowId)
        return
      }

      if (action.type === 'openLocalDraft') {
        activateLocalWorkflowDraft(action.workflowId)
        return
      }

      setActiveView(action.view)
      setSelectedNodeId('')
      setCanvasApi(null)
      if (action.view === 'workflow') {
        setWorkflowEditorOpen(false)
      }
    },
    [activateLocalWorkflowDraft, loadWorkflowProject, setSelectedNodeId, startNewWorkflow],
  )

  const saveCurrentWorkflowDraft = useCallback(async () => {
    const previousWorkflowId = workflow.id
    setSaveStatus('saving')
    setSaveMessage('正在保存到服务端')
    try {
      const saved = await saveWorkflowDraft(workflow)
      removeLocalDraft(previousWorkflowId)
      removeLocalDraft(saved.workflow.id)
      setWorkflow(saved.workflow)
      setLastSavedSignature(getWorkflowSignature(saved.workflow))
      setLastSavedAt(new Date())
      setSaveStatus('saved')
      setSaveMessage('草稿已保存')
      await refreshWorkflowProjects()
      return true
    } catch (error) {
      setSaveStatus('error')
      setSaveMessage(getErrorMessage(error, '保存失败，请检查后端服务和数据库连接'))
      return false
    }
  }, [refreshWorkflowProjects, removeLocalDraft, setWorkflow, workflow])

  const handleSaveWorkflow = useCallback(() => {
    void saveCurrentWorkflowDraft()
  }, [saveCurrentWorkflowDraft])

  const updateWorkflowMetadata = useCallback(
    (metadata: { name: string; description: string }) => {
      const nextName = metadata.name.trim() || '未命名项目'
      const nextDescription = metadata.description.trim()
      if (nextName === workflow.name && nextDescription === workflow.description) {
        return
      }

      setWorkflow({
        ...workflow,
        name: nextName,
        description: nextDescription,
      })
      setSaveStatus('idle')
      setSaveMessage('工作流信息已修改，保存后同步到服务端')
    },
    [setWorkflow, workflow],
  )

  const updateLocalWorkflowProject = useCallback(
    (workflowId: string, metadata: { name: string; description: string }) => {
      updateLocalDraftMetadata(workflowId, {
        name: metadata.name.trim() || '未命名项目',
        description: metadata.description.trim(),
      })
      setSaveMessage('本地草稿信息已更新，保存后同步到服务端')
    },
    [updateLocalDraftMetadata],
  )

  const deleteLocalWorkflowProject = useCallback(
    (workflowId: string) => {
      removeLocalDraft(workflowId)
      if (workflow.id === workflowId) {
        const nextWorkflow = createNewWorkflowDocument()
        setWorkflow(nextWorkflow)
        setLastSavedSignature(getWorkflowSignature(nextWorkflow))
        setLastSavedAt(null)
        setSaveStatus('idle')
        setSaveMessage('')
      }
    },
    [removeLocalDraft, setWorkflow, workflow.id],
  )

  const duplicateLocalWorkflowProject = useCallback(
    (workflowId: string) => {
      const source = workflow.id === workflowId ? workflow : localDrafts.find((draft) => draft.id === workflowId)
      if (!source) {
        return
      }

      const duplicated = {
        ...source,
        id: crypto.randomUUID(),
        name: `${source.name || '未命名项目'} 副本`,
      }
      upsertLocalDraft(duplicated)
    },
    [localDrafts, upsertLocalDraft, workflow],
  )

  const updateSavedWorkflowProject = useCallback(
    async (workflowId: string, metadata: { name: string; description: string }) => {
      const updated = await updateWorkflowProject(workflowId, {
        name: metadata.name.trim() || '未命名项目',
        description: metadata.description.trim(),
      })
      setWorkflowProjects((projects) => projects.map((project) => (project.id === workflowId ? updated : project)))

      if (workflow.id === workflowId) {
        const nextWorkflow = {
          ...workflow,
          name: updated.name,
          description: updated.description,
        }
        setWorkflow(nextWorkflow)
        setLastSavedSignature(getWorkflowSignature(nextWorkflow))
      }
    },
    [setWorkflow, workflow],
  )

  const deleteSavedWorkflowProject = useCallback(
    async (workflowId: string) => {
      await deleteWorkflowProject(workflowId)
      setWorkflowProjects((projects) => projects.filter((project) => project.id !== workflowId))
      removeLocalDraft(workflowId)

      if (workflow.id === workflowId) {
        const nextWorkflow = createNewWorkflowDocument()
        setWorkflow(nextWorkflow)
        setLastSavedSignature(getWorkflowSignature(nextWorkflow))
        setLastSavedAt(null)
        setSaveStatus('idle')
        setSaveMessage('')
      }
    },
    [removeLocalDraft, setWorkflow, workflow.id],
  )

  const duplicateSavedWorkflowProject = useCallback(
    async (workflowId: string) => {
      const duplicated = await duplicateWorkflowProject(workflowId)
      setWorkflowProjects((projects) => [duplicated.project, ...projects])
      if (!hasUnsavedChanges) {
        setWorkflow(duplicated.workflow)
        setLastSavedSignature(getWorkflowSignature(duplicated.workflow))
        setLastSavedAt(new Date())
        setSaveStatus('saved')
        setSaveMessage('已复制并加载新工作流')
      }
    },
    [hasUnsavedChanges, setWorkflow],
  )

  const openWorkflowProject = useCallback(
    (workflowId?: string) => {
      if (!workflowId || workflowId === workflow.id) {
        openWorkflowEditor()
        return
      }

      if (!workflowEditorOpen && hasUnsavedChanges) {
        persistCurrentWorkflowDraft()
        void loadWorkflowProject(workflowId)
        return
      }

      if (workflowEditorOpen && requestWorkflowLeave({ type: 'openProject', workflowId })) {
        return
      }

      void loadWorkflowProject(workflowId)
    },
    [
      hasUnsavedChanges,
      loadWorkflowProject,
      openWorkflowEditor,
      persistCurrentWorkflowDraft,
      requestWorkflowLeave,
      workflow.id,
      workflowEditorOpen,
    ],
  )

  const openLocalWorkflowDraft = useCallback(
    (workflowId: string) => {
      if (workflowId !== workflow.id && !workflowEditorOpen && hasUnsavedChanges) {
        persistCurrentWorkflowDraft()
        activateLocalWorkflowDraft(workflowId)
        return
      }

      if (workflowId !== workflow.id && workflowEditorOpen && requestWorkflowLeave({ type: 'openLocalDraft', workflowId })) {
        return
      }

      activateLocalWorkflowDraft(workflowId)
    },
    [
      activateLocalWorkflowDraft,
      hasUnsavedChanges,
      persistCurrentWorkflowDraft,
      requestWorkflowLeave,
      workflow.id,
      workflowEditorOpen,
    ],
  )

  const closeWorkflowEditor = useCallback(() => {
    if (requestWorkflowLeave({ type: 'closeEditor' })) {
      return
    }

    runLeaveAction({ type: 'closeEditor' })
  }, [requestWorkflowLeave, runLeaveAction])

  const createWorkflow = useCallback(() => {
    if (requestWorkflowLeave({ type: 'createWorkflow' })) {
      return
    }

    startNewWorkflow()
  }, [requestWorkflowLeave, startNewWorkflow])

  const changeActiveView = useCallback(
    (view: AppNavigationView) => {
      if (view !== activeView && requestWorkflowLeave({ type: 'changeView', view })) {
        return
      }

      runLeaveAction({ type: 'changeView', view })
    },
    [activeView, requestWorkflowLeave, runLeaveAction],
  )

  const cancelPendingLeave = useCallback(() => {
    setPendingLeaveAction(null)
    setLeaveDialogSaving(false)
  }, [])

  const stashAndContinuePendingLeave = useCallback(() => {
    if (!pendingLeaveAction) {
      return
    }

    persistCurrentWorkflowDraft()
    runLeaveAction(pendingLeaveAction)
    setPendingLeaveAction(null)
  }, [pendingLeaveAction, persistCurrentWorkflowDraft, runLeaveAction])

  const saveAndContinuePendingLeave = useCallback(async () => {
    if (!pendingLeaveAction) {
      return
    }

    setLeaveDialogSaving(true)
    const saved = await saveCurrentWorkflowDraft()
    setLeaveDialogSaving(false)
    if (!saved) {
      return
    }

    runLeaveAction(pendingLeaveAction)
    setPendingLeaveAction(null)
  }, [pendingLeaveAction, runLeaveAction, saveCurrentWorkflowDraft])

  useEffect(() => {
    if (activeView === 'workflow' && !workflowEditorOpen && draftHydrated) {
      void refreshWorkflowProjects()
    }
  }, [activeView, draftHydrated, refreshWorkflowProjects, workflowEditorOpen])

  useEffect(() => {
    if (!draftHydrated || !hasUnsavedChanges || saveStatus === 'saving') {
      return
    }

    upsertLocalDraft(workflow)
  }, [draftHydrated, hasUnsavedChanges, saveStatus, upsertLocalDraft, workflow, workflowSignature])

  useEffect(() => {
    if (!draftHydrated || hasUnsavedChanges || !currentWorkflowSaved) {
      return
    }

    removeLocalDraft(workflow.id)
  }, [currentWorkflowSaved, draftHydrated, hasUnsavedChanges, removeLocalDraft, workflow.id])

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      persistCurrentWorkflowDraft()
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [hasUnsavedChanges, persistCurrentWorkflowDraft])

  useEffect(() => {
    if (activeView !== 'workflow') {
      return
    }

    window.requestAnimationFrame(() => {
      window.scrollTo(0, 0)
    })
  }, [activeView, workflowEditorOpen])

  return {
    activeView,
    allWorkflowEdges,
    allWorkflowNodes,
    canvasApi,
    draftHydrated,
    hasUnsavedChanges,
    lastSavedAt,
    leaveDialogSaving,
    localDrafts,
    openingProjectId,
    pendingLeaveAction,
    projectsError,
    projectsLoading,
    saveMessage,
    saveStatus,
    selectedNode,
    selectedNodeId,
    workflow,
    workflowEditorOpen,
    workflowProjects,
    cancelPendingLeave,
    changeActiveView,
    closeWorkflowEditor,
    createWorkflow,
    deleteLocalWorkflowProject,
    deleteSavedWorkflowProject,
    duplicateLocalWorkflowProject,
    duplicateSavedWorkflowProject,
    handleSaveWorkflow,
    openLocalWorkflowDraft,
    openWorkflowProject,
    refreshWorkflowProjects,
    saveAndContinuePendingLeave,
    setCanvasApi,
    setSelectedNodeId,
    stashAndContinuePendingLeave,
    updateLocalWorkflowProject,
    updateSavedWorkflowProject,
    updateSelectedNode,
    updateWorkflowMetadata,
  }
}
