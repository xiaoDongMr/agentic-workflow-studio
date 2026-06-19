import { useMemo, useState } from 'react'
import { Filter, Layers3, LoaderCircle, Plus, RefreshCw, Search, Sparkles } from 'lucide-react'

import type { WorkflowProjectSummary } from '@/api/workflow'
import { cn } from '@/lib/utils'
import type { WorkflowDocument } from '@/types/workflow'

import { EmptySearchCard, ProjectDeleteDialog, ProjectMetadataDialog } from './workflow-overview/project-dialogs'
import { WorkflowProjectCard, WorkflowProjectSummaryCard } from './workflow-overview/project-card'
import { TemplateCard, workflowTemplateCards } from './workflow-overview/template-card'
import type { WorkflowProjectActionTarget, WorkflowProjectMetadata } from './workflow-overview/types'

interface WorkflowOverviewProps {
  workflow: WorkflowDocument
  localDrafts: WorkflowDocument[]
  projects: WorkflowProjectSummary[]
  hasUnsavedChanges: boolean
  loadingProjects: boolean
  projectsError: string
  openingProjectId: string | null
  className?: string
  onCreateWorkflow: () => void
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
  hasUnsavedChanges,
  loadingProjects,
  projectsError,
  openingProjectId,
  className,
  onCreateWorkflow,
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
  const [query, setQuery] = useState('')
  const [editingProject, setEditingProject] = useState<WorkflowProjectActionTarget | null>(null)
  const [deletingProject, setDeletingProject] = useState<WorkflowProjectActionTarget | null>(null)
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  const normalizedQuery = query.trim().toLowerCase()
  const workflowMatchesQuery = useWorkflowQueryMatch(workflow, normalizedQuery)
  const filteredLocalDrafts = useFilteredLocalDrafts(localDrafts, workflow.id, normalizedQuery)
  const filteredProjects = useFilteredProjects(projects, localDrafts, workflow.id, normalizedQuery)

  const currentWorkflowSaved = projects.some((project) => project.id === workflow.id)
  const currentWorkflowHasLocalDraft = localDrafts.some((draft) => draft.id === workflow.id)
  const currentWorkflowDirty = hasUnsavedChanges || currentWorkflowHasLocalDraft
  const shouldShowCurrentWorkflow = currentWorkflowSaved || currentWorkflowDirty
  const visibleProjectCount =
    (shouldShowCurrentWorkflow && workflowMatchesQuery ? 1 : 0) + filteredLocalDrafts.length + filteredProjects.length

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
        <WorkflowProjectToolbar
          loadingProjects={loadingProjects}
          query={query}
          savedProjectCount={projects.length}
          visibleProjectCount={visibleProjectCount}
          onCreateWorkflow={onCreateWorkflow}
          onQueryChange={setQuery}
          onRefreshProjects={onRefreshProjects}
        />
        <WorkflowErrors actionError={actionError} projectsError={projectsError} />

        <div className="relative mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <CreateWorkflowCard onCreateWorkflow={onCreateWorkflow} />

          {shouldShowCurrentWorkflow && workflowMatchesQuery ? (
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
          ) : normalizedQuery && shouldShowCurrentWorkflow ? (
            <EmptySearchCard query={query} onCreateWorkflow={onCreateWorkflow} />
          ) : null}

          {filteredLocalDrafts.map((draft) => (
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

          {loadingProjects && <WorkflowProjectLoadingCard />}

          {filteredProjects.map((project) => (
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
              busy={actionBusy?.endsWith(project.id) ?? false}
            />
          ))}
        </div>

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

function useWorkflowQueryMatch(workflow: WorkflowDocument, normalizedQuery: string) {
  return useMemo(() => {
    if (!normalizedQuery) {
      return true
    }

    return [workflow.name, workflow.description, workflow.version].some((value) =>
      value.toLowerCase().includes(normalizedQuery),
    )
  }, [normalizedQuery, workflow.description, workflow.name, workflow.version])
}

function useFilteredLocalDrafts(localDrafts: WorkflowDocument[], currentWorkflowId: string, normalizedQuery: string) {
  return useMemo(() => {
    const otherLocalDrafts = localDrafts.filter((draft) => draft.id !== currentWorkflowId)
    if (!normalizedQuery) {
      return otherLocalDrafts
    }

    return otherLocalDrafts.filter((draft) =>
      [draft.name, draft.description, draft.version].some((value) =>
        value.toLowerCase().includes(normalizedQuery),
      ),
    )
  }, [currentWorkflowId, localDrafts, normalizedQuery])
}

function useFilteredProjects(
  projects: WorkflowProjectSummary[],
  localDrafts: WorkflowDocument[],
  currentWorkflowId: string,
  normalizedQuery: string,
) {
  return useMemo(() => {
    const localDraftIds = new Set(localDrafts.map((draft) => draft.id))
    const uniqueProjects = projects.filter((project) => project.id !== currentWorkflowId && !localDraftIds.has(project.id))
    if (!normalizedQuery) {
      return uniqueProjects
    }

    return uniqueProjects.filter((project) =>
      [project.name, project.description, project.status].some((value) =>
        value.toLowerCase().includes(normalizedQuery),
      ),
    )
  }, [currentWorkflowId, localDrafts, normalizedQuery, projects])
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
          先从项目缩略图确认整体链路，点击具体项目或创建项目后再进入画布编辑，避免一进来就被完整画布打断。
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

function WorkflowProjectToolbar({
  loadingProjects,
  query,
  savedProjectCount,
  visibleProjectCount,
  onCreateWorkflow,
  onQueryChange,
  onRefreshProjects,
}: {
  loadingProjects: boolean
  query: string
  savedProjectCount: number
  visibleProjectCount: number
  onCreateWorkflow: () => void
  onQueryChange: (query: string) => void
  onRefreshProjects: () => void
}) {
  return (
    <div className="relative mt-8 flex flex-col gap-3 rounded-[26px] border border-white/8 bg-white/[0.04] p-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-blue-300/18 bg-blue-400/12 text-blue-100">
          <Layers3 className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-white">我的工作流</h2>
          <p className="mt-0.5 text-xs text-slate-500">展示本地未保存内容，以及已经保存的工作流项目。</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex items-center gap-2 rounded-2xl border border-white/8 bg-slate-950/60 px-3 py-2 text-sm text-slate-300 transition focus-within:border-blue-300/30">
          <Search className="h-4 w-4 text-slate-500" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索工作流"
            className="min-w-[140px] bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-500"
          />
        </label>
        <div className="hidden items-center gap-1 rounded-2xl border border-white/8 bg-slate-950/60 p-1 xl:flex">
          <Filter className="ml-1 h-3.5 w-3.5 text-slate-500" />
          <FilterChip active label={`全部 ${visibleProjectCount}`} />
          <FilterChip label={`已保存 ${savedProjectCount}`} />
          <FilterChip label={`模板 ${workflowTemplateCards.length}`} />
        </div>
        <button
          type="button"
          onClick={onRefreshProjects}
          disabled={loadingProjects}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/8 bg-slate-950/60 px-3.5 py-2 text-sm font-medium text-slate-300 transition hover:border-blue-300/28 hover:text-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={cn('h-4 w-4', loadingProjects && 'animate-spin')} />
          刷新
        </button>
        <button
          type="button"
          onClick={onCreateWorkflow}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-blue-300/22 bg-blue-500/16 px-4 py-2 text-sm font-medium text-blue-100 transition hover:border-blue-300/42 hover:bg-blue-500/22"
        >
          <Plus className="h-4 w-4" />
          新建工作流
        </button>
      </div>
    </div>
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
          点击模板后进入画布
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

function FilterChip({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <span
      className={cn(
        'rounded-xl px-2.5 py-1 text-xs font-medium',
        active ? 'bg-blue-400/16 text-blue-100' : 'text-slate-500',
      )}
    >
      {label}
    </span>
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
