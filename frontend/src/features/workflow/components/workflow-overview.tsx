import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Filter, LoaderCircle, Plus, RefreshCw, Search, Sparkles } from 'lucide-react'

import type { WorkflowProjectFilter, WorkflowProjectSummary } from '@/api/workflow'
import { cn } from '@/lib/utils'
import type { WorkflowDocument } from '@/types/workflow'

import { ProjectDeleteDialog, ProjectMetadataDialog } from './workflow-overview/project-dialogs'
import { WorkflowProjectCard, WorkflowProjectSummaryCard } from './workflow-overview/project-card'
import { TemplateCard, workflowTemplateCards } from './workflow-overview/template-card'
import type { WorkflowProjectActionTarget, WorkflowProjectMetadata } from './workflow-overview/types'

interface WorkflowOverviewProps {
  workflow: WorkflowDocument
  localDrafts: WorkflowDocument[]
  projects: WorkflowProjectSummary[]
  projectsFilter: WorkflowProjectFilter
  projectsPage: number
  projectsPageSize: number
  projectsQuery: string
  projectsTotal: number
  currentWorkflowSaved: boolean
  hasUnsavedChanges: boolean
  loadingProjects: boolean
  projectsError: string
  openingProjectId: string | null
  className?: string
  onCreateWorkflow: () => void
  onChangeProjectsFilter: (filter: WorkflowProjectFilter) => void
  onChangeProjectsPage: (page: number) => void
  onChangeProjectsQuery: (query: string) => void
  onOpenWorkflow: (workflowId?: string) => void
  onOpenLocalDraft: (workflowId: string) => void
  onRefreshProjects: () => void
  onUpdateLocalDraft: (workflowId: string, metadata: WorkflowProjectMetadata) => void
  onDeleteLocalDraft: (workflowId: string) => void
  onDuplicateLocalDraft: (workflowId: string) => void
  onUpdateProject: (workflowId: string, metadata: WorkflowProjectMetadata) => Promise<void>
  onDeleteProject: (workflowId: string) => Promise<void>
  onDuplicateProject: (workflowId: string) => Promise<void>
}

export function WorkflowOverview({
  workflow,
  localDrafts,
  projects,
  projectsFilter,
  projectsPage,
  projectsPageSize,
  projectsQuery,
  projectsTotal,
  currentWorkflowSaved,
  hasUnsavedChanges,
  loadingProjects,
  projectsError,
  openingProjectId,
  className,
  onCreateWorkflow,
  onChangeProjectsFilter,
  onChangeProjectsPage,
  onChangeProjectsQuery,
  onOpenWorkflow,
  onOpenLocalDraft,
  onRefreshProjects,
  onUpdateLocalDraft,
  onDeleteLocalDraft,
  onDuplicateLocalDraft,
  onUpdateProject,
  onDeleteProject,
  onDuplicateProject,
}: WorkflowOverviewProps) {
  const [editingProject, setEditingProject] = useState<WorkflowProjectActionTarget | null>(null)
  const [deletingProject, setDeletingProject] = useState<WorkflowProjectActionTarget | null>(null)
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  const localDraftById = useMemo(() => new Map(localDrafts.map((draft) => [draft.id, draft])), [localDrafts])
  const otherLocalDrafts = useMemo(() => localDrafts.filter((draft) => draft.id !== workflow.id), [localDrafts, workflow.id])
  const filteredProjects = useFilteredProjects(projects, workflow.id)

  const currentWorkflowHasLocalDraft = localDrafts.some((draft) => draft.id === workflow.id)
  const currentWorkflowDirty = hasUnsavedChanges || currentWorkflowHasLocalDraft
  const shouldShowCurrentWorkflow = currentWorkflowSaved || currentWorkflowDirty
  const continueProjectCount = (shouldShowCurrentWorkflow ? 1 : 0) + otherLocalDrafts.length
  const totalPages = Math.max(Math.ceil(projectsTotal / projectsPageSize), 1)

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

  return (
    <main className={cn('min-h-0 flex-1 overflow-auto p-4 lg:p-6', className)}>
      <section className="relative min-h-[820px] overflow-hidden rounded-[32px] border border-white/8 bg-slate-950/72 p-5 shadow-[0_28px_90px_rgba(2,6,23,0.32)] lg:p-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(37,99,235,0.22),transparent_30%),radial-gradient(circle_at_86%_12%,rgba(168,85,247,0.16),transparent_28%),linear-gradient(180deg,rgba(15,23,42,0.2),rgba(2,6,23,0.32))]" />
        <WorkflowOverviewHeader workflow={workflow} />
        <WorkflowErrors actionError={actionError} projectsError={projectsError} />

        <section className="relative mt-5">
          <SectionTitle
            title="继续编辑"
            description="当前项目和本地草稿会固定显示在这里。"
            aside={`${continueProjectCount} 个快捷入口`}
          />
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <CreateWorkflowCard onCreateWorkflow={onCreateWorkflow} />

            {shouldShowCurrentWorkflow ? (
              <WorkflowProjectCard
                workflow={workflow}
                badge={currentWorkflowDirty ? '本地未保存' : currentWorkflowSaved ? '当前打开' : '本地未保存'}
                statusText={currentWorkflowDirty ? '本地草稿' : currentWorkflowSaved ? '已保存' : '本地草稿'}
                onOpen={() => onOpenWorkflow()}
                onEdit={() =>
                  openEditDialog({
                    id: workflow.id,
                    name: workflow.name,
                    description: workflow.description,
                    source: currentWorkflowSaved && !currentWorkflowDirty ? 'server' : 'local',
                  })
                }
                onDelete={() =>
                  openDeleteDialog({
                    id: workflow.id,
                    name: workflow.name,
                    description: workflow.description,
                    source: currentWorkflowSaved && !currentWorkflowDirty ? 'server' : 'local',
                  })
                }
                onDuplicate={() =>
                  void duplicateProject({
                    id: workflow.id,
                    name: workflow.name,
                    description: workflow.description,
                    source: currentWorkflowSaved && !currentWorkflowDirty ? 'server' : 'local',
                  })
                }
              />
            ) : null}

            {otherLocalDrafts.map((draft) => (
              <WorkflowProjectCard
                key={draft.id}
                workflow={draft}
                badge="本地未保存"
                statusText="本地草稿"
                onOpen={() => onOpenLocalDraft(draft.id)}
                onEdit={() =>
                  openEditDialog({
                    id: draft.id,
                    name: draft.name,
                    description: draft.description,
                    source: 'local',
                  })
                }
                onDelete={() =>
                  openDeleteDialog({
                    id: draft.id,
                    name: draft.name,
                    description: draft.description,
                    source: 'local',
                  })
                }
                onDuplicate={() =>
                  void duplicateProject({
                    id: draft.id,
                    name: draft.name,
                    description: draft.description,
                    source: 'local',
                  })
                }
              />
            ))}
          </div>
        </section>

        <section className="relative mt-8">
          <SectionTitle
            title="全部项目"
            description="已保存的工作流项目，可搜索、筛选和分页查看。"
            aside={projectsTotal > 0 ? `共 ${projectsTotal} 个` : '暂无服务端项目'}
          />
          <WorkflowProjectLibraryToolbar
            filter={projectsFilter}
            loadingProjects={loadingProjects}
            pageSize={projectsPageSize}
            query={projectsQuery}
            total={projectsTotal}
            onFilterChange={onChangeProjectsFilter}
            onQueryChange={onChangeProjectsQuery}
            onRefreshProjects={onRefreshProjects}
          />

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {loadingProjects && <WorkflowProjectLoadingCard />}

            {!loadingProjects && filteredProjects.length === 0 ? (
              <EmptyProjectPageCard query={projectsQuery} onCreateWorkflow={onCreateWorkflow} />
            ) : null}

            {filteredProjects.map((project) => {
              const localDraft = localDraftById.get(project.id)

              if (localDraft) {
                return (
                  <WorkflowProjectCard
                    key={project.id}
                    workflow={localDraft}
                    badge="本地未保存"
                    statusText="本地草稿"
                    onOpen={() => onOpenLocalDraft(project.id)}
                    onEdit={() =>
                      openEditDialog({
                        id: project.id,
                        name: localDraft.name,
                        description: localDraft.description,
                        source: 'local',
                      })
                    }
                    onDelete={() =>
                      openDeleteDialog({
                        id: project.id,
                        name: localDraft.name,
                        description: localDraft.description,
                        source: 'local',
                      })
                    }
                    onDuplicate={() =>
                      void duplicateProject({
                        id: project.id,
                        name: localDraft.name,
                        description: localDraft.description,
                        source: 'local',
                      })
                    }
                  />
                )
              }

              return (
                <WorkflowProjectSummaryCard
                  key={project.id}
                  project={project}
                  opening={openingProjectId === project.id}
                  onOpen={() => onOpenWorkflow(project.id)}
                  onEdit={() =>
                    openEditDialog({
                      id: project.id,
                      name: project.name,
                      description: project.description,
                      source: 'server',
                    })
                  }
                  onDelete={() =>
                    openDeleteDialog({
                      id: project.id,
                      name: project.name,
                      description: project.description,
                      source: 'server',
                    })
                  }
                  onDuplicate={() =>
                    void duplicateProject({
                      id: project.id,
                      name: project.name,
                      description: project.description,
                      source: 'server',
                    })
                  }
                />
              )
            })}
          </div>

          <ProjectPagination
            className="mt-4"
            loading={loadingProjects}
            page={projectsPage}
            pageSize={projectsPageSize}
            total={projectsTotal}
            totalPages={totalPages}
            onChangePage={onChangeProjectsPage}
          />
        </section>

        <WorkflowTemplateSection onCreateWorkflow={onCreateWorkflow} />

        {editingProject && (
          <ProjectMetadataDialog
            busy={actionBusy === `edit:${editingProject.id}`}
            initialDescription={editingProject.description}
            initialName={editingProject.name}
            onCancel={() => setEditingProject(null)}
            onSubmit={submitProjectMetadata}
          />
        )}
        {deletingProject && (
          <ProjectDeleteDialog
            busy={actionBusy === `delete:${deletingProject.id}`}
            projectName={deletingProject.name}
            source={deletingProject.source}
            onCancel={() => setDeletingProject(null)}
            onConfirm={confirmProjectDelete}
          />
        )}
      </section>
    </main>
  )
}

function useFilteredProjects(projects: WorkflowProjectSummary[], currentWorkflowId: string) {
  return useMemo(
    () => projects.filter((project) => project.id !== currentWorkflowId),
    [currentWorkflowId, projects],
  )
}

function SectionTitle({ title, description, aside }: { title: string; description: string; aside: string }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-white">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <span className="inline-flex w-fit rounded-full border border-white/8 bg-white/[0.045] px-3 py-1.5 text-xs font-medium text-slate-400">
        {aside}
      </span>
    </div>
  )
}

function EmptyProjectPageCard({ query, onCreateWorkflow }: { query: string; onCreateWorkflow: () => void }) {
  return (
    <div className="flex min-h-[260px] flex-col justify-between rounded-[24px] border border-white/8 bg-white/[0.04] p-5">
      <div>
        <div className="inline-flex rounded-full border border-slate-300/10 bg-slate-400/10 px-3 py-1 text-xs font-medium text-slate-300">
          无匹配项目
        </div>
        <h3 className="mt-5 text-lg font-semibold text-white">{query.trim() ? '没有找到服务端项目' : '还没有已保存项目'}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          {query.trim() ? `没有找到“${query.trim()}”相关项目。` : '保存工作流后，项目会出现在这里。'}
        </p>
      </div>
      <button
        type="button"
        onClick={onCreateWorkflow}
        className="mt-6 inline-flex w-fit items-center gap-2 rounded-2xl border border-blue-300/22 bg-blue-500/16 px-4 py-2 text-sm font-medium text-blue-100 transition hover:border-blue-300/42 hover:bg-blue-500/22"
      >
        <Plus className="h-4 w-4" />
        新建工作流
      </button>
    </div>
  )
}

function ProjectPagination({
  className,
  loading,
  page,
  pageSize,
  total,
  totalPages,
  onChangePage,
}: {
  className?: string
  loading: boolean
  page: number
  pageSize: number
  total: number
  totalPages: number
  onChangePage: (page: number) => void
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  const canGoPrevious = page > 1 && !loading
  const canGoNext = page < totalPages && !loading

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-[22px] border border-white/8 bg-white/[0.035] p-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <p className="text-sm text-slate-400">
        {total > 0 ? `显示 ${start}-${end} / ${total} 个服务端项目` : '暂无可分页的服务端项目'}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!canGoPrevious}
          onClick={() => onChangePage(page - 1)}
          className="inline-flex h-9 items-center gap-1.5 rounded-2xl border border-white/8 bg-slate-950/56 px-3 text-sm font-medium text-slate-300 transition hover:border-blue-300/28 hover:text-blue-100 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <ChevronLeft className="h-4 w-4" />
          上一页
        </button>
        <span className="min-w-20 rounded-2xl border border-white/8 bg-slate-950/50 px-3 py-2 text-center text-sm text-slate-300">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={!canGoNext}
          onClick={() => onChangePage(page + 1)}
          className="inline-flex h-9 items-center gap-1.5 rounded-2xl border border-white/8 bg-slate-950/56 px-3 text-sm font-medium text-slate-300 transition hover:border-blue-300/28 hover:text-blue-100 disabled:cursor-not-allowed disabled:opacity-45"
        >
          下一页
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function WorkflowOverviewHeader({ workflow }: { workflow: WorkflowDocument }) {
  return (
    <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-300/16 bg-blue-400/10 px-3 py-1.5 text-xs font-medium text-blue-100">
          <Sparkles className="h-3.5 w-3.5" />
          Workflow Design
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white lg:text-4xl">工作流设计</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
          创建、打开或管理你的工作流。未保存内容会保留在本地草稿中。
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 rounded-[24px] border border-white/8 bg-white/[0.045] p-3">
        <OverviewStat label="节点" value={workflow.nodes.length} />
        <OverviewStat label="连线" value={workflow.edges.length} />
        <OverviewStat label="版本" value={workflow.version.replace(/^v/, '')} />
      </div>
    </div>
  )
}

const projectFilterOptions: Array<{
  value: WorkflowProjectFilter
  label: string
  description: string
}> = [
  { value: 'all', label: '全部', description: '所有已保存项目' },
  { value: 'simple', label: '结构清晰', description: '节点和连线较少，适合看结构图' },
  { value: 'complex', label: '复杂流程', description: '节点或连线较多，适合看摘要' },
]

function WorkflowProjectLibraryToolbar({
  filter,
  loadingProjects,
  pageSize,
  query,
  total,
  onFilterChange,
  onQueryChange,
  onRefreshProjects,
}: {
  filter: WorkflowProjectFilter
  loadingProjects: boolean
  pageSize: number
  query: string
  total: number
  onFilterChange: (filter: WorkflowProjectFilter) => void
  onQueryChange: (query: string) => void
  onRefreshProjects: () => void
}) {
  const [draftQuery, setDraftQuery] = useState(query)

  useEffect(() => {
    setDraftQuery(query)
  }, [query])

  useEffect(() => {
    const normalizedDraft = draftQuery.trim()
    const normalizedQuery = query.trim()
    const timer = window.setTimeout(() => {
      if (normalizedDraft !== normalizedQuery) {
        onQueryChange(normalizedDraft)
      }
    }, 1000)

    return () => window.clearTimeout(timer)
  }, [draftQuery, onQueryChange, query])

  const clearQuery = () => {
    setDraftQuery('')
    if (query) {
      onQueryChange('')
    }
  }

  return (
    <div className="mt-4 rounded-[24px] border border-white/8 bg-white/[0.035] p-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-white/8 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-300 transition focus-within:border-blue-300/30">
          <Search className="h-4 w-4 shrink-0 text-slate-500" />
          <input
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                onQueryChange(draftQuery.trim())
              }
            }}
            placeholder="搜索名称或描述"
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-500"
          />
          {draftQuery ? (
            <button
              type="button"
              onClick={clearQuery}
              className="rounded-xl px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-white/8 hover:text-slate-200"
            >
              清空
            </button>
          ) : null}
        </label>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-white/8 bg-slate-950/60 p-1">
            <Filter className="mx-1 h-3.5 w-3.5 text-slate-500" />
            {projectFilterOptions.map((option) => (
              <ProjectFilterButton
                key={option.value}
                active={filter === option.value}
                label={option.label}
                title={option.description}
                onClick={() => onFilterChange(option.value)}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => onRefreshProjects()}
            disabled={loadingProjects}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/8 bg-slate-950/60 px-3.5 py-2 text-sm font-medium text-slate-300 transition hover:border-blue-300/28 hover:text-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={cn('h-4 w-4', loadingProjects && 'animate-spin')} />
            刷新
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>按最近更新排序</span>
        <span className="h-1 w-1 rounded-full bg-slate-700" />
        <span>每页 {pageSize} 个</span>
        <span className="h-1 w-1 rounded-full bg-slate-700" />
        <span>{total > 0 ? `共 ${total} 个结果` : '暂无结果'}</span>
        {draftQuery.trim() !== query.trim() ? (
          <>
            <span className="h-1 w-1 rounded-full bg-slate-700" />
            <span className="text-blue-200">1 秒后查询</span>
          </>
        ) : null}
      </div>
    </div>
  )
}

function ProjectFilterButton({
  active,
  label,
  title,
  onClick,
}: {
  active: boolean
  label: string
  title: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'rounded-xl px-2.5 py-1.5 text-xs font-medium transition',
        active ? 'bg-blue-400/16 text-blue-100' : 'text-slate-500 hover:bg-white/6 hover:text-slate-300',
      )}
    >
      {label}
    </button>
  )
}

function WorkflowErrors({ actionError, projectsError }: { actionError: string; projectsError: string }) {
  if (!projectsError && !actionError) {
    return null
  }

  return (
    <>
      {projectsError && (
        <div className="relative mt-4 rounded-2xl border border-rose-300/18 bg-rose-400/8 px-4 py-3 text-sm text-rose-100">
          {projectsError}
        </div>
      )}
      {actionError && (
        <div className="relative mt-4 rounded-2xl border border-rose-300/18 bg-rose-400/8 px-4 py-3 text-sm text-rose-100">
          {actionError}
        </div>
      )}
    </>
  )
}

function CreateWorkflowCard({ onCreateWorkflow }: { onCreateWorkflow: () => void }) {
  return (
    <button
      type="button"
      onClick={onCreateWorkflow}
      className="group flex min-h-[260px] flex-col overflow-hidden rounded-[24px] border border-dashed border-blue-300/24 bg-blue-400/[0.055] text-left transition hover:border-blue-300/44 hover:bg-blue-400/[0.09] hover:shadow-[0_22px_70px_rgba(37,99,235,0.16)]"
    >
      <CreateWorkflowPreview />
      <div className="mt-auto p-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-lg font-semibold tracking-tight text-white">新建项目</p>
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-blue-300/22 bg-blue-400/14 text-blue-100 transition group-hover:scale-105">
            <Plus className="h-4 w-4" />
          </span>
        </div>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-400">
          创建一个只包含开始节点的新工作流，进入画布后继续添加大模型、选择器、循环和代码节点。
        </p>
      </div>
    </button>
  )
}

function CreateWorkflowPreview() {
  return (
    <div className="relative h-[120px] overflow-hidden border-b border-white/8 bg-[radial-gradient(circle_at_22%_18%,rgba(96,165,250,0.22),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(30,41,59,0.72))]">
      <div className="absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(255,255,255,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.18)_1px,transparent_1px)] [background-size:28px_28px]" />
      <svg className="relative h-full w-full" viewBox="0 0 640 300" role="img" aria-label="新建工作流缩略图">
        <path
          d="M138,150 C210,150 240,96 310,96 C376,96 410,150 488,150"
          fill="none"
          stroke="#60a5fa"
          strokeDasharray="10 12"
          strokeLinecap="round"
          strokeWidth="4"
          opacity="0.5"
        />
        <rect x="70" y="124" width="116" height="54" rx="18" fill="#0f2f4f" stroke="#38bdf8" strokeOpacity="0.55" strokeWidth="2" />
        <rect x="262" y="70" width="116" height="54" rx="18" fill="#1e1b4b" stroke="#a78bfa" strokeOpacity="0.38" strokeWidth="2" strokeDasharray="7 7" />
        <rect x="454" y="124" width="116" height="54" rx="18" fill="#172554" stroke="#60a5fa" strokeOpacity="0.34" strokeWidth="2" strokeDasharray="7 7" />
        <circle cx="128" cy="151" r="8" fill="#38bdf8" opacity="0.9" />
        <circle cx="320" cy="97" r="8" fill="#a78bfa" opacity="0.72" />
        <circle cx="512" cy="151" r="8" fill="#60a5fa" opacity="0.72" />
      </svg>
      <div className="absolute left-4 top-4 rounded-full border border-blue-300/18 bg-blue-400/12 px-3 py-1 text-xs font-medium text-blue-100 backdrop-blur">
        Blank Workflow
      </div>
    </div>
  )
}

function WorkflowProjectLoadingCard() {
  return (
    <div className="flex min-h-[260px] items-center justify-center rounded-[24px] border border-white/8 bg-white/[0.045]">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
        <LoaderCircle className="h-4 w-4 animate-spin text-blue-300" />
        加载工作流项目中
      </div>
    </div>
  )
}

function WorkflowTemplateSection({ onCreateWorkflow }: { onCreateWorkflow: () => void }) {
  return (
    <section className="relative mt-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-white">推荐模板</h2>
          <p className="mt-1 text-sm text-slate-500">用于快速进入画布，后续可以替换为真实模板中心数据。</p>
        </div>
        <span className="hidden rounded-full border border-white/8 bg-white/[0.045] px-3 py-1.5 text-xs text-slate-400 sm:inline-flex">
          点击后进入画布
        </span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {workflowTemplateCards.map((template) => (
          <TemplateCard key={template.title} template={template} onUse={onCreateWorkflow} />
        ))}
      </div>
    </section>
  )
}

function OverviewStat({ label, value }: { label: string | number; value: string | number }) {
  return (
    <div className="min-w-[72px] rounded-2xl border border-white/8 bg-slate-950/50 px-3 py-2.5">
      <div className="text-lg font-semibold tracking-tight text-white">{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </div>
  )
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
