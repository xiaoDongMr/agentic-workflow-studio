import { useMemo } from 'react'

import type { WorkflowProjectFilter, WorkflowProjectSummary } from '@/api/workflow'
import { cn } from '@/lib/utils'
import type { WorkflowDocument } from '@/types/workflow'

import { ContinueEditingSection } from './workflow-overview/continue-editing-section'
import { WorkflowOverviewHeader } from './workflow-overview/overview-header'
import { WorkflowErrors } from './workflow-overview/overview-primitives'
import { ProjectDeleteDialog, ProjectMetadataDialog } from './workflow-overview/project-dialogs'
import { ProjectLibrarySection } from './workflow-overview/project-library-section'
import { WorkflowTemplateSection } from './workflow-overview/template-section'
import type { WorkflowProjectMetadata } from './workflow-overview/types'
import { useProjectActions } from './workflow-overview/use-project-actions'

interface WorkflowOverviewProps {
  workflow: WorkflowDocument
  localDrafts: WorkflowDocument[]
  projects: WorkflowProjectSummary[]
  projectsFilter: WorkflowProjectFilter
  projectsPage: number
  projectsPageSize: number
  projectsQuery: string
  projectsTotal: number
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
  const {
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
  } = useProjectActions({
    onDeleteLocalDraft,
    onDeleteProject,
    onDuplicateLocalDraft,
    onDuplicateProject,
    onUpdateLocalDraft,
    onUpdateProject,
  })

  const localDraftById = useMemo(
    () => new Map(localDrafts.filter((draft) => draft.id !== workflow.id).map((draft) => [draft.id, draft])),
    [localDrafts, workflow.id],
  )
  const totalPages = Math.max(Math.ceil(projectsTotal / projectsPageSize), 1)

  return (
    <main className={cn('min-h-0 flex-1 overflow-auto p-4 lg:p-6', className)}>
      <section className="relative min-h-[820px] overflow-hidden rounded-[32px] border border-white/8 bg-slate-950/72 p-5 shadow-[0_28px_90px_rgba(2,6,23,0.32)] lg:p-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(37,99,235,0.22),transparent_30%),radial-gradient(circle_at_86%_12%,rgba(168,85,247,0.16),transparent_28%),linear-gradient(180deg,rgba(15,23,42,0.2),rgba(2,6,23,0.32))]" />
        <WorkflowOverviewHeader workflow={workflow} />
        <WorkflowErrors actionError={actionError} projectsError={projectsError} />

        <ContinueEditingSection
          localDrafts={localDrafts}
          onCreateWorkflow={onCreateWorkflow}
          onDeleteProject={openDeleteDialog}
          onDuplicateProject={(target) => void duplicateProject(target)}
          onEditProject={openEditDialog}
          onOpenLocalDraft={onOpenLocalDraft}
        />

        <ProjectLibrarySection
          filter={projectsFilter}
          localDraftById={localDraftById}
          loadingProjects={loadingProjects}
          openingProjectId={openingProjectId}
          page={projectsPage}
          pageSize={projectsPageSize}
          projects={projects}
          query={projectsQuery}
          total={projectsTotal}
          totalPages={totalPages}
          onChangeFilter={onChangeProjectsFilter}
          onChangePage={onChangeProjectsPage}
          onChangeQuery={onChangeProjectsQuery}
          onCreateWorkflow={onCreateWorkflow}
          onDeleteProject={openDeleteDialog}
          onDuplicateProject={(target) => void duplicateProject(target)}
          onEditProject={openEditDialog}
          onOpenLocalDraft={onOpenLocalDraft}
          onOpenWorkflow={onOpenWorkflow}
          onRefreshProjects={onRefreshProjects}
        />

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
