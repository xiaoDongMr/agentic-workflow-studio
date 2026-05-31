import { LlmNodeConfigPanel } from '@/features/workflow/components/node-config/llm-node-config-panel'
import {
  BasicInfoSection,
  ConfigSection,
  ConfigShell,
  IOSection,
  getAvailableInputSources,
  type NodeConfigPanelProps,
} from '@/features/workflow/components/node-config/config-fields'

export function NodeConfigPanel({
  node,
  nodes,
  edges,
  onUpdateNode,
  className,
}: NodeConfigPanelProps) {
  if (node.type === 'llm') {
    return <LlmNodeConfigPanel node={node} nodes={nodes} edges={edges} onUpdateNode={onUpdateNode} className={className} />
  }
  const inputSources = getAvailableInputSources(node, nodes, edges)
  const isStartNode = node.type === 'start'

  return (
    <ConfigShell node={node} className={className}>
      <BasicInfoSection node={node} onUpdateNode={onUpdateNode} />

      {!isStartNode && (
        <ConfigSection title="输入变量">
          <IOSection
            title=""
            emptyLabel="输入变量"
            items={node.inputs}
            sourceOptions={inputSources}
            inputMappings={node.config.inputMappings}
            onChange={(items) => onUpdateNode({ inputs: items })}
            onInputMappingsChange={(inputMappings) => onUpdateNode({ config: { inputMappings } })}
          />
        </ConfigSection>
      )}

      <ConfigSection title={isStartNode ? '输入' : '输出变量'}>
        <IOSection
          title=""
          emptyLabel={isStartNode ? '输入' : '输出变量'}
          items={node.outputs}
          onChange={(items) => onUpdateNode({ outputs: items })}
        />
      </ConfigSection>
    </ConfigShell>
  )
}
