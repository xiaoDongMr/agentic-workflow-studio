import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { mockWorkflow } from '@/features/workflow/mock-data'
import type { WorkflowDocument, WorkflowNode } from '@/types/workflow'

const WORKFLOW_DRAFT_STORAGE_KEY = 'agentic-workflow-studio:draft:v1'

interface WorkflowStore {
  workflow: WorkflowDocument
  selectedNodeId: string
  activeTab: 'visual' | 'code' | 'logs'
  draftHydrated: boolean
  setSelectedNodeId: (nodeId: string) => void
  setActiveTab: (tab: WorkflowStore['activeTab']) => void
  setDraftHydrated: (draftHydrated: boolean) => void
  setWorkflow: (workflow: WorkflowDocument) => void
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

function updateWorkflowNodeTree(
  nodes: WorkflowNode[],
  selectedNodeId: string,
  partial: Partial<Omit<WorkflowNode, 'config'>> & {
    config?: Partial<WorkflowNode['config']>
  },
): WorkflowNode[] {
  return nodes.map((node) => {
    if (node.id === selectedNodeId) {
      return {
        ...node,
        ...partial,
        config: partial.config
          ? {
              ...node.config,
              ...partial.config,
            }
          : node.config,
      }
    }

    const loopBodyNodes = node.config.loopBodyNodes ?? []
    if (loopBodyNodes.length === 0) {
      return node
    }

    return {
      ...node,
      config: {
        ...node.config,
        loopBodyNodes: updateWorkflowNodeTree(loopBodyNodes, selectedNodeId, partial),
      },
    }
  })
}

export const useWorkflowStore = create<WorkflowStore>()(
  persist(
    (set) => ({
      workflow: mockWorkflow,
      selectedNodeId: '',
      activeTab: 'visual',
      draftHydrated: false,
      setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),
      setActiveTab: (activeTab) => set({ activeTab }),
      setDraftHydrated: (draftHydrated) => set({ draftHydrated }),
      setWorkflow: (workflow) => set({ workflow, selectedNodeId: '' }),
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
            nodes: updateWorkflowNodeTree(state.workflow.nodes, state.selectedNodeId, partial),
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
      onRehydrateStorage: () => (state) => {
        state?.setDraftHydrated(true)
      },
    },
  ),
)
