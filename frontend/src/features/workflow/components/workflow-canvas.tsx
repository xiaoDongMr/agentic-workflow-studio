import { lazy, Suspense } from 'react'
import { LoaderCircle } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { SandboxSummary } from '@/api/sandbox-pool'
import type { WorkflowEdge, WorkflowNode } from '@/types/workflow'
export type { WorkflowCanvasApi } from '@/features/workflow/editor/workflow-editor'

const WorkflowEditor = lazy(async () => {
  const mod = await import('@/features/workflow/editor/workflow-editor')
  return { default: mod.WorkflowEditor }
})

interface WorkflowCanvasProps {
  workflowId: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  sandbox?: SandboxSummary | null
  selectedNodeId: string
  onSelectNode: (nodeId: string) => void
  onReady?: (api: import('@/features/workflow/editor/workflow-editor').WorkflowCanvasApi) => void
  className?: string
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <Suspense
      fallback={
        <section
          className={cn(
            'relative flex h-full min-h-[680px] items-center justify-center overflow-hidden rounded-[28px] border border-white/8 bg-slate-950/70 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]',
            props.className,
          )}
        >
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-slate-300 backdrop-blur">
            <LoaderCircle className="h-4 w-4 animate-spin text-blue-300" />
            编辑器模块加载中
          </div>
        </section>
      }
    >
      <WorkflowEditor {...props} />
    </Suspense>
  )
}
