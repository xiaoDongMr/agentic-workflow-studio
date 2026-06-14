import { useMemo } from 'react'

import { LlmNodeConfigPanel } from '@/features/workflow/components/node-config/llm-node-config-panel'
import { LoopNodeConfigPanel } from '@/features/workflow/components/node-config/loop-node-config-panel'
import { SelectorNodeConfigPanel } from '@/features/workflow/components/node-config/selector-node-config-panel'
import {
  BasicInfoSection,
  ConfigSection,
  ConfigShell,
  Field,
  IOSection,
  type NodeConfigPanelProps,
} from '@/features/workflow/components/node-config/config-fields'
import { getAvailableInputSources } from '@/features/workflow/components/node-config/variable-utils'
import {
  getEndNodeDisplay,
  isWorkflowNodeInsideLoop,
  LOOP_BODY_END_NODE_DISPLAY,
  type FixedWorkflowNodeDisplay,
} from '@/features/workflow/node-display'

export function NodeConfigPanel(props: NodeConfigPanelProps) {
  const {
    node,
    nodes,
    edges,
    onUpdateNode,
    className,
  } = props

  if (node.type === 'llm') {
    return <LlmNodeConfigPanel node={node} nodes={nodes} edges={edges} onUpdateNode={onUpdateNode} className={className} />
  }
  if (node.type === 'selector') {
    return (
      <SelectorNodeConfigPanel
        node={node}
        nodes={nodes}
        edges={edges}
        onUpdateNode={onUpdateNode}
        className={className}
      />
    )
  }
  if (node.type === 'loop') {
    return <LoopNodeConfigPanel node={node} nodes={nodes} edges={edges} onUpdateNode={onUpdateNode} className={className} />
  }
  if (node.type === 'loop-end') {
    return <FixedInfoPanel node={node} className={className} display={LOOP_BODY_END_NODE_DISPLAY} />
  }
  if (node.type === 'end') {
    const display = getEndNodeDisplay(isWorkflowNodeInsideLoop(node.id, nodes ?? []), node.description)
    return <FixedInfoPanel node={node} className={className} display={display} />
  }

  return <DefaultNodeConfigPanel {...props} />
}

function FixedInfoPanel({
  node,
  className,
  display,
}: {
  node: NodeConfigPanelProps['node']
  className?: string
  display: FixedWorkflowNodeDisplay
}) {
  return (
    <ConfigShell node={{ ...node, title: display.title }} className={className}>
      <ConfigSection title="基础信息">
        <Field label="节点名称" value={display.title} />
        <Field label="节点说明" value={display.description} />
      </ConfigSection>
    </ConfigShell>
  )
}

function DefaultNodeConfigPanel({
  node,
  nodes,
  edges,
  onUpdateNode,
  className,
}: NodeConfigPanelProps) {
  const inputSources = useMemo(() => getAvailableInputSources(node, nodes, edges), [edges, node, nodes])
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
