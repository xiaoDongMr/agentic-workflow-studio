import { CreateWorkflowCard } from './create-workflow-card'
import { SectionTitle } from './overview-primitives'
import { WorkflowProjectCard } from './project-card'
import type { WorkflowProjectActionTarget } from './types'
import type { WorkflowDocument } from '@/types/workflow'

interface ContinueEditingSectionProps {
  localDrafts: WorkflowDocument[]
  onCreateWorkflow: () => void
  onDeleteProject: (target: WorkflowProjectActionTarget) => void
  onDuplicateProject: (target: WorkflowProjectActionTarget) => void
  onEditProject: (target: WorkflowProjectActionTarget) => void
  onOpenLocalDraft: (workflowId: string) => void
}

export function ContinueEditingSection({
  localDrafts,
  onCreateWorkflow,
  onDeleteProject,
  onDuplicateProject,
  onEditProject,
  onOpenLocalDraft,
}: ContinueEditingSectionProps) {
  const sectionItemCount = localDrafts.length

  return (
    <section className="relative mt-5">
      <SectionTitle
        title="继续编辑"
        description="本地未保存的草稿会保留在这里。"
        aside={sectionItemCount > 0 ? `${sectionItemCount} 个本地草稿` : '暂无本地草稿'}
      />
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <CreateWorkflowCard onCreateWorkflow={onCreateWorkflow} />

        {localDrafts.map((draft) => (
          <WorkflowProjectCard
            key={draft.id}
            workflow={draft}
            badge="本地未保存"
            statusText="本地草稿"
            onOpen={() => onOpenLocalDraft(draft.id)}
            onEdit={() =>
              onEditProject({
                id: draft.id,
                name: draft.name,
                description: draft.description,
                source: 'local',
              })
            }
            onDelete={() =>
              onDeleteProject({
                id: draft.id,
                name: draft.name,
                description: draft.description,
                source: 'local',
              })
            }
            onDuplicate={() =>
              onDuplicateProject({
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
  )
}
