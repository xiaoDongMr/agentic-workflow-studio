import { TemplateCard, workflowTemplateCards } from './template-card'

export function WorkflowTemplateSection({ onCreateWorkflow }: { onCreateWorkflow: () => void }) {
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
