import { useId, useMemo, useState } from 'react'
import {
  ArrowUpRight,
  Bot,
  Clock3,
  Code2,
  Filter,
  GitBranch,
  Layers3,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react'

import type { WorkflowProjectSummary } from '@/api/workflow'
import { cn } from '@/lib/utils'
import type { WorkflowDocument, WorkflowNode, WorkflowNodeType } from '@/types/workflow'

interface WorkflowOverviewProps {
  workflow: WorkflowDocument
  projects: WorkflowProjectSummary[]
  loadingProjects: boolean
  projectsError: string
  openingProjectId: string | null
  className?: string
  onCreateWorkflow: () => void
  onOpenWorkflow: (workflowId?: string) => void
  onRefreshProjects: () => void
}

const nodeToneByType: Record<WorkflowNodeType, { fill: string; stroke: string; text: string }> = {
  start: { fill: '#163b5f', stroke: '#38bdf8', text: '#dff7ff' },
  llm: { fill: '#2f246d', stroke: '#a78bfa', text: '#f2ecff' },
  selector: { fill: '#4a2b12', stroke: '#f59e0b', text: '#fff4db' },
  loop: { fill: '#123f35', stroke: '#34d399', text: '#dcfff6' },
  'loop-start': { fill: '#123f35', stroke: '#34d399', text: '#dcfff6' },
  'loop-end': { fill: '#123f35', stroke: '#34d399', text: '#dcfff6' },
  code: { fill: '#172554', stroke: '#60a5fa', text: '#e2efff' },
  end: { fill: '#42172a', stroke: '#fb7185', text: '#ffe4ea' },
}

const templateCards = [
  {
    title: '智能问答链路',
    description: '开始节点接用户输入，经过大模型生成结构化答案，再由结束节点输出。',
    icon: Bot,
    tone: 'blue',
  },
  {
    title: '条件分支处理',
    description: '适合需要根据规则选择不同执行路径的客服、审核和任务分发场景。',
    icon: GitBranch,
    tone: 'amber',
  },
  {
    title: '代码转换流程',
    description: '把模型结果交给代码节点清洗、聚合或转换，再返回稳定 JSON。',
    icon: Code2,
    tone: 'violet',
  },
] as const

export function WorkflowOverview({
  workflow,
  projects,
  loadingProjects,
  projectsError,
  openingProjectId,
  className,
  onCreateWorkflow,
  onOpenWorkflow,
  onRefreshProjects,
}: WorkflowOverviewProps) {
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()
  const workflowMatchesQuery = useMemo(() => {
    if (!normalizedQuery) {
      return true
    }

    return [workflow.name, workflow.description, workflow.version].some((value) =>
      value.toLowerCase().includes(normalizedQuery),
    )
  }, [normalizedQuery, workflow.description, workflow.name, workflow.version])
  const filteredProjects = useMemo(() => {
    const uniqueProjects = projects.filter((project) => project.id !== workflow.id)
    if (!normalizedQuery) {
      return uniqueProjects
    }

    return uniqueProjects.filter((project) =>
      [project.name, project.description, project.status].some((value) =>
        value.toLowerCase().includes(normalizedQuery),
      ),
    )
  }, [normalizedQuery, projects, workflow.id])
  const visibleProjectCount = (workflowMatchesQuery ? 1 : 0) + filteredProjects.length

  return (
    <main className={cn('min-h-0 flex-1 overflow-auto p-4 lg:p-6', className)}>
      <section className="relative min-h-[820px] overflow-hidden rounded-[32px] border border-white/8 bg-slate-950/72 p-5 shadow-[0_28px_90px_rgba(2,6,23,0.32)] lg:p-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(37,99,235,0.22),transparent_30%),radial-gradient(circle_at_86%_12%,rgba(168,85,247,0.16),transparent_28%),linear-gradient(180deg,rgba(15,23,42,0.2),rgba(2,6,23,0.32))]" />

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

        <div className="relative mt-8 flex flex-col gap-3 rounded-[26px] border border-white/8 bg-white/[0.04] p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-blue-300/18 bg-blue-400/12 text-blue-100">
              <Layers3 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-white">我的工作流</h2>
              <p className="mt-0.5 text-xs text-slate-500">展示本地正在编辑的草稿，以及已保存到 PostgreSQL 的服务端项目。</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 rounded-2xl border border-white/8 bg-slate-950/60 px-3 py-2 text-sm text-slate-300 transition focus-within:border-blue-300/30">
              <Search className="h-4 w-4 text-slate-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索工作流"
                className="min-w-[140px] bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-500"
              />
            </label>
            <div className="hidden items-center gap-1 rounded-2xl border border-white/8 bg-slate-950/60 p-1 xl:flex">
              <Filter className="ml-1 h-3.5 w-3.5 text-slate-500" />
              <FilterChip active label={`全部 ${visibleProjectCount}`} />
              <FilterChip label={`已保存 ${projects.length}`} />
              <FilterChip label="模板 3" />
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

        {projectsError && (
          <div className="relative mt-4 rounded-2xl border border-rose-300/18 bg-rose-400/8 px-4 py-3 text-sm text-rose-100">
            {projectsError}
          </div>
        )}

        <div className="relative mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <button
            type="button"
            onClick={onCreateWorkflow}
            className="group flex min-h-[330px] flex-col overflow-hidden rounded-[28px] border border-dashed border-blue-300/24 bg-blue-400/[0.055] text-left transition hover:border-blue-300/44 hover:bg-blue-400/[0.09] hover:shadow-[0_22px_70px_rgba(37,99,235,0.16)]"
          >
            <CreateWorkflowPreview />
            <div className="mt-auto p-5">
              <div className="flex items-center justify-between gap-4">
                <p className="text-xl font-semibold tracking-tight text-white">新建项目</p>
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-blue-300/22 bg-blue-400/14 text-blue-100 transition group-hover:scale-105">
                  <Plus className="h-5 w-5" />
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                创建一个只包含开始节点的新工作流，进入画布后继续添加大模型、选择器、循环和代码节点。
              </p>
            </div>
          </button>

          {workflowMatchesQuery ? (
            <WorkflowProjectCard workflow={workflow} onOpen={() => onOpenWorkflow()} />
          ) : (
            <EmptySearchCard query={query} onCreateWorkflow={onCreateWorkflow} />
          )}

          {loadingProjects && (
            <div className="flex min-h-[330px] items-center justify-center rounded-[28px] border border-white/8 bg-white/[0.045]">
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
                <LoaderCircle className="h-4 w-4 animate-spin text-blue-300" />
                加载服务端项目中
              </div>
            </div>
          )}

          {filteredProjects.map((project) => (
            <WorkflowProjectSummaryCard
              key={project.id}
              project={project}
              opening={openingProjectId === project.id}
              onOpen={() => onOpenWorkflow(project.id)}
            />
          ))}
        </div>

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
            {templateCards.map((template) => (
              <TemplateCard key={template.title} template={template} onUse={onCreateWorkflow} />
            ))}
          </div>
        </section>
      </section>
    </main>
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

function OverviewStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-[72px] rounded-2xl border border-white/8 bg-slate-950/50 px-3 py-2.5">
      <div className="text-lg font-semibold tracking-tight text-white">{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </div>
  )
}

function WorkflowProjectCard({ workflow, onOpen }: { workflow: WorkflowDocument; onOpen: () => void }) {
  const nodeTypeSummary = summarizeNodeTypes(workflow.nodes)

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group min-h-[330px] overflow-hidden rounded-[28px] border border-white/8 bg-white/[0.055] text-left shadow-[0_18px_60px_rgba(2,6,23,0.18)] transition hover:-translate-y-0.5 hover:border-blue-300/26 hover:bg-white/[0.075] hover:shadow-[0_28px_80px_rgba(2,6,23,0.28)]"
    >
      <MiniWorkflowPreview workflow={workflow} />

      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold tracking-tight text-white">{workflow.name || '未命名项目'}</p>
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-400">
              {workflow.description || '点击进入画布继续设计工作流。'}
            </p>
          </div>
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/8 bg-slate-950/70 text-slate-300 transition group-hover:border-blue-300/28 group-hover:text-blue-100">
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {nodeTypeSummary.map((item) => (
            <span
              key={item.type}
              className="rounded-full border border-white/8 bg-slate-950/48 px-2.5 py-1 text-xs font-medium text-slate-300"
            >
              {item.label} · {item.count}
            </span>
          ))}
        </div>

        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-950/70">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-400 via-violet-400 to-emerald-300"
            style={{ width: `${Math.min(100, 24 + workflow.nodes.length * 12)}%` }}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-slate-950/55 px-2.5 py-1">
            <Layers3 className="h-3.5 w-3.5 text-blue-300" />
            {workflow.nodes.length} 个节点
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-slate-950/55 px-2.5 py-1">
            <GitBranch className="h-3.5 w-3.5 text-violet-300" />
            {workflow.edges.length} 条连线
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-slate-950/55 px-2.5 py-1">
            <Clock3 className="h-3.5 w-3.5 text-emerald-300" />
            刚刚编辑
          </span>
        </div>
      </div>
    </button>
  )
}

function WorkflowProjectSummaryCard({
  project,
  opening,
  onOpen,
}: {
  project: WorkflowProjectSummary
  opening: boolean
  onOpen: () => void
}) {
  const updatedAt = new Date(project.updatedAt)
  const updatedText = Number.isNaN(updatedAt.getTime())
    ? '最近编辑'
    : updatedAt.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={opening}
      className="group min-h-[330px] overflow-hidden rounded-[28px] border border-emerald-300/12 bg-emerald-400/[0.045] text-left shadow-[0_18px_60px_rgba(2,6,23,0.18)] transition hover:-translate-y-0.5 hover:border-emerald-300/26 hover:bg-emerald-400/[0.07] hover:shadow-[0_28px_80px_rgba(2,6,23,0.28)] disabled:cursor-wait disabled:opacity-75"
    >
      <div className="relative h-[178px] overflow-hidden border-b border-white/8 bg-[radial-gradient(circle_at_18%_12%,rgba(52,211,153,0.22),transparent_34%),linear-gradient(135deg,#0f172a_0%,#064e3b_100%)]">
        <div className="absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(255,255,255,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.18)_1px,transparent_1px)] [background-size:28px_28px]" />
        <svg className="relative h-full w-full" viewBox="0 0 640 300" role="img" aria-label={`${project.name} 服务端草稿缩略图`}>
          <path
            d="M114,152 C184,104 242,104 306,152 S424,204 516,140"
            fill="none"
            stroke="#6ee7b7"
            strokeLinecap="round"
            strokeWidth="4"
            opacity="0.72"
          />
          <rect x="72" y="126" width="112" height="56" rx="18" fill="#0f3b33" stroke="#34d399" strokeOpacity="0.74" strokeWidth="2" />
          <rect x="264" y="126" width="112" height="56" rx="18" fill="#12365f" stroke="#60a5fa" strokeOpacity="0.62" strokeWidth="2" />
          <rect x="456" y="112" width="112" height="56" rx="18" fill="#312e81" stroke="#a78bfa" strokeOpacity="0.62" strokeWidth="2" />
          <circle cx="128" cy="154" r="7" fill="#34d399" />
          <circle cx="320" cy="154" r="7" fill="#60a5fa" />
          <circle cx="512" cy="140" r="7" fill="#a78bfa" />
        </svg>
        <div className="absolute left-4 top-4 rounded-full border border-emerald-300/18 bg-emerald-400/12 px-3 py-1 text-xs font-medium text-emerald-100 backdrop-blur">
          PostgreSQL 草稿
        </div>
        {opening && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/46 backdrop-blur-sm">
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/78 px-4 py-2 text-sm text-slate-200">
              <LoaderCircle className="h-4 w-4 animate-spin text-emerald-300" />
              打开中
            </div>
          </div>
        )}
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold tracking-tight text-white">{project.name || '未命名项目'}</p>
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-400">
              {project.description || '已保存到服务端的工作流草稿。'}
            </p>
          </div>
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/8 bg-slate-950/70 text-slate-300 transition group-hover:border-emerald-300/28 group-hover:text-emerald-100">
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>

        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-950/70">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-300 via-blue-300 to-violet-300"
            style={{ width: `${Math.min(100, 28 + project.nodeCount * 12)}%` }}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-slate-950/55 px-2.5 py-1">
            <Layers3 className="h-3.5 w-3.5 text-emerald-300" />
            {project.nodeCount} 个节点
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-slate-950/55 px-2.5 py-1">
            <GitBranch className="h-3.5 w-3.5 text-blue-300" />
            {project.edgeCount} 条连线
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-slate-950/55 px-2.5 py-1">
            <Clock3 className="h-3.5 w-3.5 text-violet-300" />
            {updatedText}
          </span>
        </div>
      </div>
    </button>
  )
}

function EmptySearchCard({ query, onCreateWorkflow }: { query: string; onCreateWorkflow: () => void }) {
  return (
    <div className="flex min-h-[330px] flex-col justify-between rounded-[28px] border border-white/8 bg-white/[0.045] p-5">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-400/10 text-amber-100">
        <Search className="h-5 w-5" />
      </div>
      <div>
        <p className="text-lg font-semibold text-white">没有匹配的工作流</p>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          当前本地草稿未命中“{query}”。可以调整关键词，或直接创建新的工作流项目。
        </p>
        <button
          type="button"
          onClick={onCreateWorkflow}
          className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-blue-300/22 bg-blue-500/16 px-4 py-2 text-sm font-medium text-blue-100 transition hover:border-blue-300/42 hover:bg-blue-500/22"
        >
          <Plus className="h-4 w-4" />
          新建工作流
        </button>
      </div>
    </div>
  )
}

function TemplateCard({
  template,
  onUse,
}: {
  template: (typeof templateCards)[number]
  onUse: () => void
}) {
  const Icon = template.icon
  const toneClass = {
    blue: 'border-blue-300/18 bg-blue-400/10 text-blue-100',
    amber: 'border-amber-300/18 bg-amber-400/10 text-amber-100',
    violet: 'border-violet-300/18 bg-violet-400/10 text-violet-100',
  }[template.tone]

  return (
    <button
      type="button"
      onClick={onUse}
      className="group rounded-[24px] border border-white/8 bg-white/[0.045] p-4 text-left transition hover:-translate-y-0.5 hover:border-blue-300/24 hover:bg-white/[0.07]"
    >
      <div className={cn('flex h-11 w-11 items-center justify-center rounded-2xl border', toneClass)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-white">{template.title}</p>
          <p className="mt-2 text-sm leading-6 text-slate-400">{template.description}</p>
        </div>
        <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-slate-500 transition group-hover:text-blue-200" />
      </div>
    </button>
  )
}

function CreateWorkflowPreview() {
  return (
    <div className="relative h-[178px] overflow-hidden border-b border-white/8 bg-[radial-gradient(circle_at_22%_18%,rgba(96,165,250,0.22),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(30,41,59,0.72))]">
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

function MiniWorkflowPreview({ workflow }: { workflow: WorkflowDocument }) {
  const markerId = `workflow-preview-arrow-${useId().replace(/\W/g, '')}`
  const previewNodes = workflow.nodes.slice(0, 8)
  const layout = createPreviewLayout(previewNodes)
  const nodeById = new Map(layout.map((node) => [node.id, node]))

  return (
    <div className="relative h-[178px] overflow-hidden border-b border-white/8 bg-[radial-gradient(circle_at_20%_10%,rgba(96,165,250,0.24),transparent_32%),linear-gradient(135deg,#111827_0%,#0f172a_42%,#1e1b4b_100%)]">
      <div className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(rgba(255,255,255,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.18)_1px,transparent_1px)] [background-size:28px_28px]" />
      <svg className="relative h-full w-full" viewBox="0 0 640 300" role="img" aria-label={`${workflow.name} 流程缩略图`}>
        <defs>
          <marker id={markerId} markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
            <path d="M0,0 L8,4 L0,8 Z" fill="#93c5fd" opacity="0.9" />
          </marker>
        </defs>

        {workflow.edges.map((edge) => {
          const source = nodeById.get(edge.source)
          const target = nodeById.get(edge.target)
          if (!source || !target) {
            return null
          }

          return (
            <path
              key={edge.id}
              d={`M${source.x + 96},${source.y + 24} C${source.x + 142},${source.y + 24} ${target.x - 46},${target.y + 24} ${target.x},${target.y + 24}`}
              fill="none"
              markerEnd={`url(#${markerId})`}
              stroke="#93c5fd"
              strokeLinecap="round"
              strokeWidth="3"
              opacity="0.74"
            />
          )
        })}

        {layout.map((node) => {
          const tone = nodeToneByType[node.type]
          return (
            <g key={node.id}>
              <rect
                x={node.x}
                y={node.y}
                width="96"
                height="48"
                rx="16"
                fill={tone.fill}
                stroke={tone.stroke}
                strokeOpacity="0.72"
                strokeWidth="2"
              />
              <circle cx={node.x + 18} cy={node.y + 24} r="6" fill={tone.stroke} opacity="0.88" />
              <text x={node.x + 32} y={node.y + 29} fill={tone.text} fontSize="16" fontWeight="700">
                {formatNodeTitle(node.title)}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="absolute right-4 top-4 rounded-full border border-white/10 bg-slate-950/72 px-3 py-1 text-xs font-medium text-blue-100 backdrop-blur">
        点击编辑
      </div>
    </div>
  )
}

function createPreviewLayout(nodes: WorkflowNode[]) {
  if (nodes.length === 0) {
    return []
  }

  const minX = Math.min(...nodes.map((node) => node.position.x))
  const maxX = Math.max(...nodes.map((node) => node.position.x))
  const minY = Math.min(...nodes.map((node) => node.position.y))
  const maxY = Math.max(...nodes.map((node) => node.position.y))
  const rangeX = Math.max(maxX - minX, 1)
  const rangeY = Math.max(maxY - minY, 1)
  const scale = Math.min(500 / rangeX, 200 / rangeY, 0.72)

  return nodes.map((node) => ({
    ...node,
    x: 50 + (node.position.x - minX) * scale,
    y: 48 + (node.position.y - minY) * scale,
  }))
}

function formatNodeTitle(title: string) {
  return title.length > 4 ? `${title.slice(0, 4)}…` : title
}

function summarizeNodeTypes(nodes: WorkflowNode[]) {
  const labelByType: Record<WorkflowNodeType, string> = {
    start: '开始',
    llm: '模型',
    selector: '选择器',
    loop: '循环',
    'loop-start': '循环开始',
    'loop-end': '循环结束',
    code: '代码',
    end: '结束',
  }
  const counts = new Map<WorkflowNodeType, number>()

  nodes.forEach((node) => {
    counts.set(node.type, (counts.get(node.type) ?? 0) + 1)
  })

  return Array.from(counts.entries())
    .slice(0, 4)
    .map(([type, count]) => ({
      type,
      label: labelByType[type],
      count,
    }))
}
