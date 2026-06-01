import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { mockWorkflow } from '@/features/workflow/mock-data'
import type { WorkflowNode } from '@/types/workflow'

const WORKFLOW_DRAFT_STORAGE_KEY = 'agentic-workflow-studio:draft:v1'

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

export const useWorkflowStore = create<WorkflowStore>()(
  persist(
    (set) => ({
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
    }),
    {
      name: WORKFLOW_DRAFT_STORAGE_KEY,
      version: 1,
      partialize: (state) => ({
        workflow: state.workflow,
        activeTab: state.activeTab,
      }),
    },
  ),
)
