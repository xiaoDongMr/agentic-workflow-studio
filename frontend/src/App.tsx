import { useMemo, useState } from 'react'
import { PanelLeftOpen, Sparkles } from 'lucide-react'

import { AiAssistantPanel } from '@/features/workflow/components/ai-assistant-panel'
import { NavigationSidebar } from '@/features/workflow/components/navigation-sidebar'
import { NodeConfigPanel } from '@/features/workflow/components/node-config-panel'
import { TopToolbar } from '@/features/workflow/components/top-toolbar'
import { WorkflowCanvas, type WorkflowCanvasApi } from '@/features/workflow/components/workflow-canvas'
import { cn } from '@/lib/utils'
import { useWorkflowStore } from '@/store/workflow-store'

function App() {
  const workflow = useWorkflowStore((state) => state.workflow)
  const selectedNodeId = useWorkflowStore((state) => state.selectedNodeId)
  const activeTab = useWorkflowStore((state) => state.activeTab)
  const setSelectedNodeId = useWorkflowStore((state) => state.setSelectedNodeId)
  const setActiveTab = useWorkflowStore((state) => state.setActiveTab)
  const updateSelectedNode = useWorkflowStore((state) => state.updateSelectedNode)
  const [canvasApi, setCanvasApi] = useState<WorkflowCanvasApi | null>(null)
  const [aiAssistantCollapsed, setAiAssistantCollapsed] = useState(false)

  const selectedNode = useMemo(
    () => workflow.nodes.find((node) => node.id === selectedNodeId),
    [selectedNodeId, workflow],
  )

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#14203d_0%,#090d18_38%,#05070c_100%)] text-slate-100">
      <div className="flex min-h-screen">
        <NavigationSidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <TopToolbar activeTab={activeTab} onChangeTab={setActiveTab} />

          <main className="min-h-0 flex-1 p-4 lg:p-6">
            <div className="relative h-full min-h-[820px]">
              <WorkflowCanvas
                className="h-full"
                nodes={workflow.nodes}
                edges={workflow.edges}
                selectedNodeId={selectedNodeId}
                onSelectNode={setSelectedNodeId}
                onReady={setCanvasApi}
              />

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
                <NodeConfigPanel
                  className="absolute right-3 top-3 z-20 h-[calc(100%-24px)] w-[360px]"
                  node={selectedNode}
                  onUpdateNode={(partial) => {
                    if (canvasApi) {
                      canvasApi.updateSelectedNode(partial)
                      return
                    }

                    updateSelectedNode(partial)
                  }}
                />
              )}

            </div>
          </main>
        </div>
      </div>
    </div>
  )
}

export default App
