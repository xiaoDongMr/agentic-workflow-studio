import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  deleteWorkflowProject,
  duplicateWorkflowProject,
  getWorkflowDraft,
  getWorkflowVersion,
  listWorkflowProjects,
  listWorkflowVersions,
  saveWorkflowDraft,
  updateWorkflowProject,
  type WorkflowProjectFilter,
  type WorkflowProjectSummary,
  type WorkflowVersionSummary,
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
const WORKFLOW_PROJECT_PAGE_SIZE = 6

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
  const lastSavedSignature = useWorkflowStore((state) => state.lastSavedWorkflowSignature)
  const localDrafts = useWorkflowStore((state) => state.localDrafts)
  const selectedNodeId = useWorkflowStore((state) => state.selectedNodeId)
  const draftHydrated = useWorkflowStore((state) => state.draftHydrated)
  const setWorkflow = useWorkflowStore((state) => state.setWorkflow)
  const setLastSavedSignature = useWorkflowStore((state) => state.setLastSavedWorkflowSignature)
  const upsertLocalDraft = useWorkflowStore((state) => state.upsertLocalDraft)
  const updateLocalDraftMetadata = useWorkflowStore((state) => state.updateLocalDraftMetadata)
  const removeLocalDraft = useWorkflowStore((state) => state.removeLocalDraft)
  const setSelectedNodeId = useWorkflowStore((state) => state.setSelectedNodeId)
  const updateSelectedNode = useWorkflowStore((state) => state.updateSelectedNode)

  const [activeView, setActiveView] = useState<AppNavigationView>('workflow')
  const [workflowEditorOpen, setWorkflowEditorOpen] = useState(false)
  const [workflowProjects, setWorkflowProjects] = useState<WorkflowProjectSummary[]>([])
  const [workflowProjectPage, setWorkflowProjectPageState] = useState(1)
  const [workflowProjectTotal, setWorkflowProjectTotal] = useState(0)
  const [workflowProjectQuery, setWorkflowProjectQueryState] = useState('')
  const [workflowProjectFilter, setWorkflowProjectFilterState] = useState<WorkflowProjectFilter>('all')
  const [workflowVersions, setWorkflowVersions] = useState<WorkflowVersionSummary[]>([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [versionsError, setVersionsError] = useState('')
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null)
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [projectsError, setProjectsError] = useState('')
  const [openingProjectId, setOpeningProjectId] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<WorkflowSaveState>('idle')
  const [saveMessage, setSaveMessage] = useState('')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
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
    () =>
      (Boolean(lastSavedSignature) && !workflow.id.startsWith('workflow-') && workflow.id !== 'blank-workflow') ||
      workflowProjects.some((project) => project.id === workflow.id),
    [lastSavedSignature, workflow.id, workflowProjects],
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

  const refreshWorkflowProjects = useCallback(async (
    options: { page?: number; query?: string; filter?: WorkflowProjectFilter } = {},
  ) => {
    const nextPage = options.page ?? workflowProjectPage
    const nextQuery = options.query ?? workflowProjectQuery
    const nextFilter = options.filter ?? workflowProjectFilter
    setProjectsLoading(true)
    setProjectsError('')
    try {
      const projectPage = await listWorkflowProjects({
        page: nextPage,
        pageSize: WORKFLOW_PROJECT_PAGE_SIZE,
        query: nextQuery,
        filter: nextFilter,
      })
      setWorkflowProjects(projectPage.items)
      setWorkflowProjectPageState(projectPage.page)
      setWorkflowProjectTotal(projectPage.total)
      if (projectPage.items.length === 0 && projectPage.total > 0 && projectPage.page > 1) {
        setWorkflowProjectPageState(Math.max(Math.ceil(projectPage.total / WORKFLOW_PROJECT_PAGE_SIZE), 1))
      }
    } catch (error) {
      setProjectsError(getErrorMessage(error, '加载工作流列表失败'))
    } finally {
      setProjectsLoading(false)
    }
  }, [workflowProjectFilter, workflowProjectPage, workflowProjectQuery])

  const setWorkflowProjectPage = useCallback((page: number) => {
    setWorkflowProjectPageState(Math.max(page, 1))
  }, [])

  const setWorkflowProjectQuery = useCallback((query: string) => {
    setWorkflowProjectQueryState(query)
    setWorkflowProjectPageState(1)
  }, [])

  const setWorkflowProjectFilter = useCallback((filter: WorkflowProjectFilter) => {
    setWorkflowProjectFilterState(filter)
    setWorkflowProjectPageState(1)
  }, [])

  const refreshWorkflowVersions = useCallback(async (workflowId: string) => {
    if (!workflowId) {
      setWorkflowVersions([])
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
  }, [])

  const openWorkflowEditor = useCallback(() => {
    setSelectedNodeId('')
    setCanvasApi(null)
    if (currentWorkflowSaved) {
      void refreshWorkflowVersions(workflow.id)
    }
    setWorkflowEditorOpen(true)
  }, [currentWorkflowSaved, refreshWorkflowVersions, setSelectedNodeId, workflow.id])

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
        void refreshWorkflowVersions(draft.id)
        setSelectedNodeId('')
        setCanvasApi(null)
        setWorkflowEditorOpen(true)
      } catch (error) {
        setProjectsError(getErrorMessage(error, '打开工作流失败'))
      } finally {
        setOpeningProjectId(null)
      }
    },
    [refreshWorkflowVersions, setSelectedNodeId, setWorkflow],
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
      setWorkflowVersions([])
      setVersionsError('')
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
    setWorkflowVersions([])
    setVersionsError('')
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
      await refreshWorkflowVersions(saved.workflow.id)
        setWorkflowProjectPageState(1)
        await refreshWorkflowProjects({ page: 1 })
      return true
    } catch (error) {
      setSaveStatus('error')
      setSaveMessage(getErrorMessage(error, '保存失败，请检查后端服务和数据库连接'))
      return false
    }
  }, [refreshWorkflowProjects, refreshWorkflowVersions, removeLocalDraft, setWorkflow, workflow])

  const handleSaveWorkflow = useCallback(() => {
    void saveCurrentWorkflowDraft()
  }, [saveCurrentWorkflowDraft])

  const restoreSavedWorkflowVersion = useCallback(
    async (versionId: string) => {
      if (!workflow.id || restoringVersionId) {
        return
      }

      setRestoringVersionId(versionId)
      setSaveStatus('saving')
      setSaveMessage('正在恢复历史版本为草稿')
      try {
        const restoredDraft = await getWorkflowVersion(workflow.id, versionId)
        setWorkflow(restoredDraft)
        setLastSavedSignature('')
        setLastSavedAt(null)
        setSaveStatus('idle')
        setSaveMessage(`已基于 ${restoredDraft.version} 恢复为本地草稿，保存后生成新版本`)
        setSelectedNodeId('')
        setCanvasApi(null)
        upsertLocalDraft(restoredDraft)
      } catch (error) {
        setSaveStatus('error')
        setSaveMessage(getErrorMessage(error, '恢复历史版本失败'))
      } finally {
        setRestoringVersionId(null)
      }
    },
    [
      restoringVersionId,
      setSelectedNodeId,
      setWorkflow,
      upsertLocalDraft,
      workflow.id,
    ],
  )

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
        setWorkflowVersions([])
        setVersionsError('')
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
        setWorkflowProjectTotal((total) => Math.max(total - 1, 0))
      removeLocalDraft(workflowId)

      if (workflow.id === workflowId) {
        const nextWorkflow = createNewWorkflowDocument()
        setWorkflow(nextWorkflow)
        setLastSavedSignature(getWorkflowSignature(nextWorkflow))
        setLastSavedAt(null)
        setSaveStatus('idle')
        setSaveMessage('')
        setWorkflowVersions([])
        setVersionsError('')
      }
    },
    [removeLocalDraft, setWorkflow, workflow.id],
  )

  const duplicateSavedWorkflowProject = useCallback(
    async (workflowId: string) => {
      const duplicated = await duplicateWorkflowProject(workflowId)
        setWorkflowProjectPageState(1)
        void refreshWorkflowProjects({ page: 1 })
      if (!hasUnsavedChanges) {
        setWorkflow(duplicated.workflow)
        setLastSavedSignature(getWorkflowSignature(duplicated.workflow))
        setLastSavedAt(new Date())
        setSaveStatus('saved')
        setSaveMessage('已复制并加载新工作流')
        void refreshWorkflowVersions(duplicated.workflow.id)
      }
    },
      [hasUnsavedChanges, refreshWorkflowProjects, refreshWorkflowVersions, setWorkflow],
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
      if (!workflowEditorOpen && hasUnsavedChanges) {
        persistCurrentWorkflowDraft()
        startNewWorkflow()
        return
      }

    if (requestWorkflowLeave({ type: 'createWorkflow' })) {
      return
    }

    startNewWorkflow()
    }, [hasUnsavedChanges, persistCurrentWorkflowDraft, requestWorkflowLeave, startNewWorkflow, workflowEditorOpen])

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
    if (!workflowEditorOpen || !currentWorkflowSaved || workflowVersions.length > 0 || versionsLoading) {
      return
    }

    const timer = window.setTimeout(() => {
      void refreshWorkflowVersions(workflow.id)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [
    currentWorkflowSaved,
    refreshWorkflowVersions,
    versionsLoading,
    workflow.id,
    workflowEditorOpen,
    workflowVersions.length,
  ])

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
    currentWorkflowSaved,
    lastSavedAt,
    leaveDialogSaving,
    localDrafts,
    openingProjectId,
    pendingLeaveAction,
    projectsError,
    projectsLoading,
    restoringVersionId,
    saveMessage,
    saveStatus,
    selectedNode,
    selectedNodeId,
    workflow,
    workflowEditorOpen,
    workflowProjectFilter,
    workflowProjectPage,
    workflowProjectPageSize: WORKFLOW_PROJECT_PAGE_SIZE,
    workflowProjectQuery,
    workflowProjectTotal,
    workflowProjects,
    workflowVersions,
    versionsError,
    versionsLoading,
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
    restoreSavedWorkflowVersion,
    saveAndContinuePendingLeave,
    setCanvasApi,
    setSelectedNodeId,
    setWorkflowProjectFilter,
    setWorkflowProjectPage,
    setWorkflowProjectQuery,
    stashAndContinuePendingLeave,
    updateLocalWorkflowProject,
    updateSavedWorkflowProject,
    updateSelectedNode,
    updateWorkflowMetadata,
  }
}
