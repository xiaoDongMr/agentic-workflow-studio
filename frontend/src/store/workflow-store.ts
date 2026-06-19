import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { WorkflowDocument, WorkflowNode } from '@/types/workflow'

const WORKFLOW_DRAFT_STORAGE_KEY = 'agentic-workflow-studio:draft:v1'

type PersistedWorkflowStore = Pick<WorkflowStore, 'activeTab' | 'localDrafts' | 'workflow'>

function createBlankWorkflowDocument(): WorkflowDocument {
  return {
    id: 'blank-workflow',
    name: '',
    description: '',
    version: 'v0.1.0',
    nodes: [],
    edges: [],
  }
}

interface WorkflowStore {
  workflow: WorkflowDocument
  localDrafts: WorkflowDocument[]
  selectedNodeId: string
  activeTab: 'visual' | 'code' | 'logs'
  draftHydrated: boolean
  setSelectedNodeId: (nodeId: string) => void
  setActiveTab: (tab: WorkflowStore['activeTab']) => void
  setDraftHydrated: (draftHydrated: boolean) => void
  setWorkflow: (workflow: WorkflowDocument) => void
  upsertLocalDraft: (workflow: WorkflowDocument) => void
  updateLocalDraftMetadata: (workflowId: string, metadata: { name: string; description: string }) => void
  removeLocalDraft: (workflowId: string) => void
  setWorkflowGraph: (
    nodes: WorkflowDocument['nodes'],
    edges: WorkflowDocument['edges'],
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
      workflow: createBlankWorkflowDocument(),
      localDrafts: [],
      selectedNodeId: '',
      activeTab: 'visual',
      draftHydrated: false,
      setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),
      setActiveTab: (activeTab) => set({ activeTab }),
      setDraftHydrated: (draftHydrated) => set({ draftHydrated }),
      setWorkflow: (workflow) => set({ workflow, selectedNodeId: '' }),
      upsertLocalDraft: (workflow) =>
        set((state) => ({
          localDrafts: [
            workflow,
            ...state.localDrafts.filter((draft) => draft.id !== workflow.id),
          ],
        })),
      updateLocalDraftMetadata: (workflowId, metadata) =>
        set((state) => ({
          workflow:
            state.workflow.id === workflowId
              ? {
                  ...state.workflow,
                  name: metadata.name,
                  description: metadata.description,
                }
              : state.workflow,
          localDrafts: state.localDrafts.map((draft) =>
            draft.id === workflowId
              ? {
                  ...draft,
                  name: metadata.name,
                  description: metadata.description,
                }
              : draft,
          ),
        })),
      removeLocalDraft: (workflowId) =>
        set((state) => ({
          localDrafts: state.localDrafts.filter((draft) => draft.id !== workflowId),
        })),
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
      version: 2,
      partialize: (state) => ({
        workflow: state.workflow,
        localDrafts: state.localDrafts,
        activeTab: state.activeTab,
      }),
      migrate: (persistedState) => {
        const state = persistedState as Partial<PersistedWorkflowStore>
        const workflow =
          state.workflow?.id === 'basic-langgraph-flow'
            ? createBlankWorkflowDocument()
            : state.workflow ?? createBlankWorkflowDocument()

        return {
          workflow,
          localDrafts: state.localDrafts ?? [],
          activeTab: state.activeTab ?? 'visual',
        }
      },
      onRehydrateStorage: () => (state) => {
        state?.setDraftHydrated(true)
      },
    },
  ),
)
