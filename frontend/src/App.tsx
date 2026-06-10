import { useMemo, useState } from 'react'
import { LoaderCircle, PanelLeftOpen, Sparkles, X } from 'lucide-react'

import { AiAssistantPanel } from '@/features/workflow/components/ai-assistant-panel'
import { NavigationSidebar } from '@/features/workflow/components/navigation-sidebar'
import { NodeConfigPanel } from '@/features/workflow/components/node-config-panel'
import { TopToolbar } from '@/features/workflow/components/top-toolbar'
import { WorkflowCanvas, type WorkflowCanvasApi } from '@/features/workflow/components/workflow-canvas'
import { cn } from '@/lib/utils'
import { useWorkflowStore } from '@/store/workflow-store'
import type { WorkflowEdge, WorkflowNode } from '@/types/workflow'

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

function App() {
  const workflow = useWorkflowStore((state) => state.workflow)
  const selectedNodeId = useWorkflowStore((state) => state.selectedNodeId)
  const activeTab = useWorkflowStore((state) => state.activeTab)
  const draftHydrated = useWorkflowStore((state) => state.draftHydrated)
  const setSelectedNodeId = useWorkflowStore((state) => state.setSelectedNodeId)
  const setActiveTab = useWorkflowStore((state) => state.setActiveTab)
  const updateSelectedNode = useWorkflowStore((state) => state.updateSelectedNode)
  const [canvasApi, setCanvasApi] = useState<WorkflowCanvasApi | null>(null)
  const [aiAssistantCollapsed, setAiAssistantCollapsed] = useState(false)

  const selectedNode = useMemo(
    () => findWorkflowNodeById(workflow.nodes, selectedNodeId),
    [selectedNodeId, workflow],
  )
  const allWorkflowNodes = useMemo(() => flattenWorkflowNodes(workflow.nodes), [workflow.nodes])
  const allWorkflowEdges = useMemo(
    () => flattenWorkflowEdges(workflow.nodes, workflow.edges),
    [workflow.edges, workflow.nodes],
  )

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#14203d_0%,#090d18_38%,#05070c_100%)] text-slate-100">
      <div className="flex min-h-screen">
        <NavigationSidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <TopToolbar activeTab={activeTab} onChangeTab={setActiveTab} />

          <main className="min-h-0 flex-1 p-4 lg:p-6">
            <div className="relative h-full min-h-[820px]">
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
          </main>
        </div>
      </div>
    </div>
  )
}

export default App
