import { useCallback, useState } from 'react'

import {
  listWorkflowProjects,
  type WorkflowProjectFilter,
  type WorkflowProjectSummary,
} from '@/api/workflow'
import { getErrorMessage } from '@/features/workflow/utils/error-message'

const WORKFLOW_PROJECT_PAGE_SIZE = 6

export function useWorkflowProjectList() {
  const [workflowProjects, setWorkflowProjects] = useState<WorkflowProjectSummary[]>([])
  const [workflowProjectPage, setWorkflowProjectPageState] = useState(1)
  const [workflowProjectTotal, setWorkflowProjectTotal] = useState(0)
  const [workflowProjectQuery, setWorkflowProjectQueryState] = useState('')
  const [workflowProjectFilter, setWorkflowProjectFilterState] = useState<WorkflowProjectFilter>('all')
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [projectsError, setProjectsError] = useState('')

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

  const removeWorkflowProjectFromList = useCallback((workflowId: string) => {
    setWorkflowProjects((projects) => projects.filter((project) => project.id !== workflowId))
    setWorkflowProjectTotal((total) => Math.max(total - 1, 0))
  }, [])

  const updateWorkflowProjectInList = useCallback((updatedProject: WorkflowProjectSummary) => {
    setWorkflowProjects((projects) =>
      projects.map((project) => (project.id === updatedProject.id ? updatedProject : project)),
    )
  }, [])

  const resetWorkflowProjectPage = useCallback(() => {
    setWorkflowProjectPageState(1)
  }, [])

  return {
    projectsError,
    projectsLoading,
    refreshWorkflowProjects,
    removeWorkflowProjectFromList,
    resetWorkflowProjectPage,
    setProjectsError,
    setWorkflowProjectFilter,
    setWorkflowProjectPage,
    setWorkflowProjectQuery,
    updateWorkflowProjectInList,
    workflowProjectFilter,
    workflowProjectPage,
    workflowProjectPageSize: WORKFLOW_PROJECT_PAGE_SIZE,
    workflowProjectQuery,
    workflowProjectTotal,
    workflowProjects,
  }
}
