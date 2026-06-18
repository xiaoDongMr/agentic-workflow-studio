import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  LoaderCircle,
  PanelLeftOpen,
  Save,
  Sparkles,
  X,
} from 'lucide-react'

import {
  getWorkflowDraft,
  listWorkflowProjects,
  saveWorkflowDraft,
  type WorkflowProjectSummary,
} from '@/api/workflow'
import { AiAssistantPanel } from '@/features/workflow/components/ai-assistant-panel'
import {
  NavigationSidebar,
  type AppNavigationView,
} from '@/features/workflow/components/navigation-sidebar'
import { NodeConfigPanel } from '@/features/workflow/components/node-config-panel'
import { WorkflowCanvas, type WorkflowCanvasApi } from '@/features/workflow/components/workflow-canvas'
import { WorkflowOverview } from '@/features/workflow/components/workflow-overview'
import { mockWorkflow } from '@/features/workflow/mock-data'
import { SandboxPoolPage } from '@/features/sandbox/sandbox-pool-page'
import { cn } from '@/lib/utils'
import { useWorkflowStore } from '@/store/workflow-store'
import type { WorkflowDocument, WorkflowEdge, WorkflowNode } from '@/types/workflow'

function findWorkflowNodeById(nodes: WorkflowNode[], nodeId: string): WorkflowNode | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node
    }
    const bodyNode = findWorkflowNodeById(node.config.loopBodyNodes ?? [], nodeId)
    if (bodyNode) {
      return bodyNode
    }
  }
  return undefined
}

function flattenWorkflowNodes(nodes: WorkflowNode[]): WorkflowNode[] {
  return nodes.flatMap((node) => [node, ...flattenWorkflowNodes(node.config.loopBodyNodes ?? [])])
}

function flattenWorkflowEdges(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowEdge[] {
  return [
    ...edges,
    ...nodes.flatMap((node) => [
      ...(node.config.loopBodyEdges ?? []),
      ...flattenWorkflowEdges(node.config.loopBodyNodes ?? [], []),
    ]),
  ]
}

function createNewWorkflowDocument(): WorkflowDocument {
  const now = Date.now().toString(36)
  const [startNode] = mockWorkflow.nodes

  return {
    id: `workflow-${now}`,
    name: '未命名项目',
    description: '从开始节点出发，继续添加大模型、选择器、循环或代码节点。',
    version: 'v0.1.0',
    nodes: [
      {
        ...startNode,
        id: 'start',
        title: '开始节点',
        status: 'idle',
        position: { x: 80, y: 120 },
        config: {
          ...startNode.config,
          prompt: '用户输入会在这里进入工作流。',
        },
      },
    ],
    edges: [],
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}

function getWorkflowSignature(workflow: WorkflowDocument) {
  return JSON.stringify(workflow)
}

function formatSaveTime(date: Date | null) {
  if (!date) {
    return ''
  }

  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function WorkflowSaveStatus({
  hasUnsavedChanges,
  lastSavedAt,
  message,
  status,
}: {
  hasUnsavedChanges: boolean
  lastSavedAt: Date | null
  message: string
  status: 'idle' | 'saving' | 'saved' | 'error'
}) {
  const icon =
    status === 'saving' ? (
      <LoaderCircle className="h-4 w-4 animate-spin text-blue-200" />
    ) : status === 'error' ? (
      <AlertCircle className="h-4 w-4 text-rose-300" />
    ) : status === 'saved' && !hasUnsavedChanges ? (
      <CheckCircle2 className="h-4 w-4 text-emerald-300" />
    ) : (
      <span className="h-2.5 w-2.5 rounded-full bg-amber-300 shadow-[0_0_18px_rgba(252,211,77,0.55)]" />
    )
  const label =
    status === 'saving'
      ? '保存中'
      : status === 'error'
        ? '保存失败'
        : hasUnsavedChanges
          ? '有未保存修改'
          : '已保存'
  const detail =
    message ||
    (lastSavedAt && !hasUnsavedChanges
      ? `上次保存 ${formatSaveTime(lastSavedAt)}`
      : '保存后可在项目列表中继续打开')

  return (
    <div
      className={cn(
        'hidden items-center gap-2 rounded-2xl border bg-slate-950/82 px-3.5 py-2 text-left shadow-[0_18px_48px_rgba(2,6,23,0.28)] backdrop-blur sm:flex',
        status === 'error' ? 'border-rose-300/24' : 'border-white/10',
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05]">
        {icon}
      </span>
      <span className="min-w-[128px]">
        <span className="block text-xs font-semibold text-slate-100">{label}</span>
        <span className="mt-0.5 block max-w-[260px] truncate text-[11px] text-slate-500">{detail}</span>
      </span>
    </div>
  )
}

function App() {
  const workflow = useWorkflowStore((state) => state.workflow)
  const selectedNodeId = useWorkflowStore((state) => state.selectedNodeId)
  const draftHydrated = useWorkflowStore((state) => state.draftHydrated)
  const setWorkflow = useWorkflowStore((state) => state.setWorkflow)
  const setSelectedNodeId = useWorkflowStore((state) => state.setSelectedNodeId)
  const updateSelectedNode = useWorkflowStore((state) => state.updateSelectedNode)
  const [canvasApi, setCanvasApi] = useState<WorkflowCanvasApi | null>(null)
  const [aiAssistantCollapsed, setAiAssistantCollapsed] = useState(false)
  const [navigationCollapsed, setNavigationCollapsed] = useState(false)
  const [activeView, setActiveView] = useState<AppNavigationView>('workflow')
  const [workflowEditorOpen, setWorkflowEditorOpen] = useState(false)
  const [workflowProjects, setWorkflowProjects] = useState<WorkflowProjectSummary[]>([])
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [projectsError, setProjectsError] = useState('')
  const [openingProjectId, setOpeningProjectId] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveMessage, setSaveMessage] = useState('')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [lastSavedSignature, setLastSavedSignature] = useState('')

  const selectedNode = useMemo(
    () => findWorkflowNodeById(workflow.nodes, selectedNodeId),
    [selectedNodeId, workflow],
  )
  const allWorkflowNodes = useMemo(() => flattenWorkflowNodes(workflow.nodes), [workflow.nodes])
  const allWorkflowEdges = useMemo(
    () => flattenWorkflowEdges(workflow.nodes, workflow.edges),
    [workflow.edges, workflow.nodes],
  )
  const workflowSignature = useMemo(() => getWorkflowSignature(workflow), [workflow])
  const hasUnsavedChanges = lastSavedSignature !== workflowSignature
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
  const openWorkflowProject = useCallback(
    async (workflowId?: string) => {
      if (!workflowId || workflowId === workflow.id) {
        openWorkflowEditor()
        return
      }

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
    [openWorkflowEditor, setSelectedNodeId, setWorkflow, workflow.id],
  )
  const closeWorkflowEditor = useCallback(() => {
    setSelectedNodeId('')
    setCanvasApi(null)
    setWorkflowEditorOpen(false)
  }, [setSelectedNodeId])
  const createWorkflow = useCallback(() => {
    const nextWorkflow = createNewWorkflowDocument()
    setWorkflow(nextWorkflow)
    setLastSavedSignature('')
    setLastSavedAt(null)
    setSaveStatus('idle')
    setSaveMessage('')
    setCanvasApi(null)
    setWorkflowEditorOpen(true)
  }, [setWorkflow])
  const handleSaveWorkflow = useCallback(async () => {
    setSaveStatus('saving')
    setSaveMessage('正在保存到 PostgreSQL')
    try {
      const saved = await saveWorkflowDraft(workflow)
      setWorkflow(saved.workflow)
      setLastSavedSignature(getWorkflowSignature(saved.workflow))
      setLastSavedAt(new Date())
      setSaveStatus('saved')
      setSaveMessage('草稿已保存')
      await refreshWorkflowProjects()
    } catch (error) {
      setSaveStatus('error')
      setSaveMessage(getErrorMessage(error, '保存失败，请检查后端服务和数据库连接'))
    }
  }, [refreshWorkflowProjects, setWorkflow, workflow])
  const changeActiveView = useCallback(
    (view: AppNavigationView) => {
      setActiveView(view)
      setSelectedNodeId('')
      setCanvasApi(null)
      if (view === 'workflow') {
        setWorkflowEditorOpen(false)
      }
    },
    [setSelectedNodeId],
  )

  useEffect(() => {
    if (activeView === 'workflow' && !workflowEditorOpen && draftHydrated) {
      void refreshWorkflowProjects()
    }
  }, [activeView, draftHydrated, refreshWorkflowProjects, workflowEditorOpen])

  useEffect(() => {
    if (activeView !== 'workflow') {
      return
    }

    window.requestAnimationFrame(() => {
      window.scrollTo(0, 0)
    })
  }, [activeView, workflowEditorOpen])

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#14203d_0%,#090d18_38%,#05070c_100%)] text-slate-100">
      <div className="flex min-h-screen">
        <NavigationSidebar
          activeView={activeView}
          collapsed={navigationCollapsed}
          onChangeView={changeActiveView}
          onToggleCollapsed={() => setNavigationCollapsed((current) => !current)}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          {activeView === 'workflow' ? (
            workflowEditorOpen ? (
              <main className="min-h-0 flex-1 p-4 lg:p-6">
                <div className="flex h-full min-h-[820px] flex-col gap-3">
                  <div className="relative z-30 flex flex-col gap-3 rounded-[26px] border border-white/8 bg-slate-950/78 p-3 shadow-[0_18px_56px_rgba(2,6,23,0.28)] backdrop-blur xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <button
                        type="button"
                        onClick={closeWorkflowEditor}
                        className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/88 px-3.5 py-2 text-sm font-medium text-slate-200 shadow-[0_18px_48px_rgba(2,6,23,0.36)] backdrop-blur transition hover:border-blue-300/30 hover:bg-slate-900/95 hover:text-white"
                        aria-label="返回工作流项目列表"
                        title="返回工作流项目列表"
                      >
                        <ChevronLeft className="h-4 w-4 text-blue-200" />
                        项目列表
                      </button>
                      <div className="hidden min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 md:block">
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="truncate text-sm font-semibold text-white">{workflow.name || '未命名项目'}</p>
                          <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[11px] font-medium text-slate-400">
                            {workflow.version}
                          </span>
                        </div>
                        <p className="mt-1 max-w-[520px] truncate text-xs text-slate-500">
                          {workflow.description || '当前工作流草稿'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <WorkflowSaveStatus
                        hasUnsavedChanges={hasUnsavedChanges}
                        lastSavedAt={lastSavedAt}
                        message={saveMessage}
                        status={saveStatus}
                      />
                      <button
                        type="button"
                        onClick={handleSaveWorkflow}
                        disabled={saveStatus === 'saving'}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-blue-300/28 bg-blue-500/18 px-4 py-2.5 text-sm font-semibold text-blue-50 shadow-[0_18px_48px_rgba(37,99,235,0.18)] backdrop-blur transition hover:border-blue-200/46 hover:bg-blue-500/26 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {saveStatus === 'saving' ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        保存草稿
                      </button>
                    </div>
                  </div>

                  <div className="relative min-h-0 flex-1">
                    {draftHydrated ? (
                      <WorkflowCanvas
                        className="h-full"
                        nodes={workflow.nodes}
                        edges={workflow.edges}
                        selectedNodeId={selectedNodeId}
                        onSelectNode={setSelectedNodeId}
                        onReady={setCanvasApi}
                      />
                    ) : (
                      <section className="relative flex h-full min-h-[680px] items-center justify-center overflow-hidden rounded-[28px] border border-white/8 bg-slate-950/70 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
                        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-slate-300 backdrop-blur">
                          <LoaderCircle className="h-4 w-4 animate-spin text-blue-300" />
                          恢复画布草稿中
                        </div>
                      </section>
                    )}

                    <AiAssistantPanel
                      className={cn(
                        'absolute bottom-3 left-3 top-3 z-20 hidden w-[min(680px,calc(100%_-_400px))] xl:flex 2xl:w-[720px]',
                        aiAssistantCollapsed && 'pointer-events-none opacity-0',
                      )}
                      onCollapse={() => setAiAssistantCollapsed(true)}
                    />

                    {aiAssistantCollapsed && (
                      <button
                        type="button"
                        onClick={() => setAiAssistantCollapsed(false)}
                        className="absolute left-3 top-1/2 z-20 hidden -translate-y-1/2 items-center gap-2 rounded-r-2xl rounded-l-xl border border-white/10 bg-slate-950/92 px-3 py-3 text-slate-200 shadow-[0_20px_48px_rgba(2,6,23,0.4)] backdrop-blur transition-colors hover:border-blue-400/25 hover:bg-slate-900/95 xl:flex"
                        aria-label="展开 AI 助手"
                      >
                        <Sparkles className="h-4 w-4 text-blue-300" />
                        <PanelLeftOpen className="h-4 w-4" />
                        <span className="text-xs font-medium tracking-[0.08em] text-slate-300 [writing-mode:vertical-rl]">
                          AI 助手
                        </span>
                      </button>
                    )}

                    {selectedNode && (
                      <div className="absolute right-3 top-3 z-20 h-[calc(100%-24px)] w-[420px] max-w-[calc(100%-24px)]">
                        <NodeConfigPanel
                          className="h-full"
                          node={selectedNode}
                          nodes={allWorkflowNodes}
                          edges={allWorkflowEdges}
                          onUpdateNode={(partial) => {
                            if (canvasApi) {
                              canvasApi.updateSelectedNode(partial)
                              return
                            }

                            updateSelectedNode(partial)
                          }}
                        />
                        <button
                          type="button"
                          className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-xl border border-white/10 bg-slate-900/90 text-slate-300 shadow-lg transition hover:border-blue-300/30 hover:bg-slate-800 hover:text-white"
                          onClick={() => setSelectedNodeId('')}
                          aria-label="关闭节点配置"
                          title="关闭节点配置"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </main>
            ) : draftHydrated ? (
              <WorkflowOverview
                workflow={workflow}
                projects={workflowProjects}
                loadingProjects={projectsLoading}
                projectsError={projectsError}
                openingProjectId={openingProjectId}
                onCreateWorkflow={createWorkflow}
                onOpenWorkflow={openWorkflowProject}
                onRefreshProjects={refreshWorkflowProjects}
              />
            ) : (
              <main className="min-h-0 flex-1 p-4 lg:p-6">
                <section className="relative flex h-full min-h-[680px] items-center justify-center overflow-hidden rounded-[28px] border border-white/8 bg-slate-950/70 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
                  <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-slate-300 backdrop-blur">
                    <LoaderCircle className="h-4 w-4 animate-spin text-blue-300" />
                    恢复工作流草稿中
                  </div>
                </section>
              </main>
            )
          ) : (
            <SandboxPoolPage />
          )}
        </div>
      </div>
    </div>
  )
}

export default App
