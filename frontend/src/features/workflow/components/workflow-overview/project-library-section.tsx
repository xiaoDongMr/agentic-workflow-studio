import type { WorkflowProjectFilter, WorkflowProjectSummary } from '@/api/workflow'
import type { WorkflowDocument } from '@/types/workflow'

import { EmptyProjectPageCard } from './empty-project-page-card'
import { SectionTitle, WorkflowProjectLoadingCard } from './overview-primitives'
import { WorkflowProjectCard, WorkflowProjectSummaryCard } from './project-card'
import { ProjectLibraryToolbar } from './project-library-toolbar'
import { ProjectPagination } from './project-pagination'
import type { WorkflowProjectActionTarget } from './types'

interface ProjectLibrarySectionProps {
  filter: WorkflowProjectFilter
  localDraftById: Map<string, WorkflowDocument>
  loadingProjects: boolean
  openingProjectId: string | null
  page: number
  pageSize: number
  projects: WorkflowProjectSummary[]
  query: string
  total: number
  totalPages: number
  onChangeFilter: (filter: WorkflowProjectFilter) => void
  onChangePage: (page: number) => void
  onChangeQuery: (query: string) => void
  onCreateWorkflow: () => void
  onDeleteProject: (target: WorkflowProjectActionTarget) => void
  onDuplicateProject: (target: WorkflowProjectActionTarget) => void
  onEditProject: (target: WorkflowProjectActionTarget) => void
  onOpenLocalDraft: (workflowId: string) => void
  onOpenWorkflow: (workflowId: string) => void
  onRefreshProjects: () => void
}

export function ProjectLibrarySection({
  filter,
  localDraftById,
  loadingProjects,
  openingProjectId,
  page,
  pageSize,
  projects,
  query,
  total,
  totalPages,
  onChangeFilter,
  onChangePage,
  onChangeQuery,
  onCreateWorkflow,
  onDeleteProject,
  onDuplicateProject,
  onEditProject,
  onOpenLocalDraft,
  onOpenWorkflow,
  onRefreshProjects,
}: ProjectLibrarySectionProps) {
  return (
    <section className="relative mt-8">
      <SectionTitle
        title="全部项目"
        description="已保存的工作流项目，可搜索、筛选和分页查看。"
        aside={total > 0 ? `共 ${total} 个` : '暂无服务端项目'}
      />
      <ProjectLibraryToolbar
        filter={filter}
        loadingProjects={loadingProjects}
        pageSize={pageSize}
        query={query}
        total={total}
        onFilterChange={onChangeFilter}
        onQueryChange={onChangeQuery}
        onRefreshProjects={onRefreshProjects}
      />

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loadingProjects && <WorkflowProjectLoadingCard />}

        {!loadingProjects && projects.length === 0 ? (
          <EmptyProjectPageCard query={query} onCreateWorkflow={onCreateWorkflow} />
        ) : null}

        {projects.map((project) => {
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
                  onEditProject({
                    id: project.id,
                    name: localDraft.name,
                    description: localDraft.description,
                    source: 'local',
                  })
                }
                onDelete={() =>
                  onDeleteProject({
                    id: project.id,
                    name: localDraft.name,
                    description: localDraft.description,
                    source: 'local',
                  })
                }
                onDuplicate={() =>
                  onDuplicateProject({
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
                onEditProject({
                  id: project.id,
                  name: project.name,
                  description: project.description,
                  source: 'server',
                })
              }
              onDelete={() =>
                onDeleteProject({
                  id: project.id,
                  name: project.name,
                  description: project.description,
                  source: 'server',
                })
              }
              onDuplicate={() =>
                onDuplicateProject({
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
        page={page}
        pageSize={pageSize}
        total={total}
        totalPages={totalPages}
        onChangePage={onChangePage}
      />
    </section>
  )
}
