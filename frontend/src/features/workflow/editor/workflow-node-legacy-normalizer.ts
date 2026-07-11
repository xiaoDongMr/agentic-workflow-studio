import type { FlowgramNodeData } from '@/features/workflow/editor/workflow-editor.types'

export function normalizeLegacyNodeConfig(config: FlowgramNodeData['config']) {
  const next = { ...config } as FlowgramNodeData['config']

  // thinkingLevel was used by older LLM configs before thinkingEnabled/reasoningEffort.
  if ('thinkingLevel' in config) {
    const legacy = (config as { thinkingLevel?: string }).thinkingLevel
    if (next.thinkingEnabled === undefined) {
      next.thinkingEnabled = legacy !== 'minimal'
    }
    if (next.reasoningEffort === undefined && (legacy === 'low' || legacy === 'medium' || legacy === 'high')) {
      next.reasoningEffort = legacy
    }
    delete (next as { thinkingLevel?: string }).thinkingLevel
  }

  return next
}
