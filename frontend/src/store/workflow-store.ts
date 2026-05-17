import { create } from 'zustand'

import { mockWorkflow } from '@/features/workflow/mock-data'
import type { WorkflowNode } from '@/types/workflow'

interface WorkflowStore {
  workflow: typeof mockWorkflow
  selectedNodeId: string
  activeTab: 'visual' | 'code' | 'logs'
  setSelectedNodeId: (nodeId: string) => void
  setActiveTab: (tab: WorkflowStore['activeTab']) => void
  setWorkflowGraph: (
    nodes: typeof mockWorkflow.nodes,
    edges: typeof mockWorkflow.edges,
  ) => void
  updateSelectedNode: (
    partial: Partial<Omit<WorkflowNode, 'config'>> & {
      config?: Partial<WorkflowNode['config']>
    },
  ) => void
}

export const useWorkflowStore = create<WorkflowStore>((set) => ({
  workflow: mockWorkflow,
  selectedNodeId: '',
  activeTab: 'visual',
  setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setWorkflowGraph: (nodes, edges) =>
    set((state) => ({
      workflow: {
        ...state.workflow,
        nodes,
        edges,
      },
    })),
  updateSelectedNode: (partial) =>
    set((state) => ({
      workflow: {
        ...state.workflow,
        nodes: state.workflow.nodes.map((node) =>
          node.id === state.selectedNodeId
            ? {
                ...node,
                ...partial,
                config: partial.config
                  ? {
                      ...node.config,
                      ...partial.config,
                    }
                  : node.config,
              }
            : node,
        ),
      },
    })),
}))
