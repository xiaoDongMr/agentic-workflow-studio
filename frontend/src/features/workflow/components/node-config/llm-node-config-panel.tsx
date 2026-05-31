import {
  BasicInfoSection,
  ConfigSection,
  ConfigShell,
  EditableArea,
  EditableField,
  IOSection,
  SelectField,
  SwitchRow,
  getAvailableInputSources,
  type NodeConfigPanelProps,
} from '@/features/workflow/components/node-config/config-fields'
import type { WorkflowNode } from '@/types/workflow'

const LLM_MODEL_OPTIONS = ['', 'doubao-2.0-pro', 'doubao-1.5-pro', 'deepseek-r1', 'gpt-4o-mini']
const ERROR_STRATEGY_OPTIONS: NonNullable<WorkflowNode['config']['errorStrategy']>[] = [
  'interrupt',
  'fallback',
  'ignore',
]

const ERROR_STRATEGY_LABEL: Record<NonNullable<WorkflowNode['config']['errorStrategy']>, string> = {
  interrupt: '中断流程',
  fallback: '使用兜底输出',
  ignore: '忽略并继续',
}

export function LlmNodeConfigPanel({ node, nodes, edges, onUpdateNode, className }: NodeConfigPanelProps) {
  const config = node.config
  const modelOptions = config.model && !LLM_MODEL_OPTIONS.includes(config.model)
    ? [config.model, ...LLM_MODEL_OPTIONS]
    : LLM_MODEL_OPTIONS
  const inputSources = getAvailableInputSources(node, nodes, edges)

  return (
    <ConfigShell node={node} className={className}>
      <BasicInfoSection node={node} onUpdateNode={onUpdateNode} />

      <ConfigSection title="输入变量">
        <IOSection
          title=""
          emptyLabel="输入变量"
          items={node.inputs}
          sourceOptions={inputSources}
          inputMappings={config.inputMappings}
          onChange={(items) => onUpdateNode({ inputs: items })}
          onInputMappingsChange={(inputMappings) => onUpdateNode({ config: { inputMappings } })}
        />
      </ConfigSection>

      <ConfigSection title="模型配置">
        <SelectField
          label="模型基座"
          value={config.model}
          options={modelOptions}
          onChange={(value) => onUpdateNode({ config: { model: value } })}
        />
      </ConfigSection>

      <ConfigSection title="提示词">
        <EditableArea
          label="系统提示词"
          value={config.systemPrompt ?? config.prompt}
          placeholder="可以使用 {{变量名}}、{{变量名.子变量名}} 引用输入变量。"
          onChange={(value) => onUpdateNode({ config: { systemPrompt: value, prompt: value } })}
          rows={6}
        />
        <EditableArea
          label="用户提示词"
          value={config.userPrompt ?? '{{input}}'}
          placeholder="例如：请基于 {{input}} 输出总结。"
          onChange={(value) => onUpdateNode({ config: { userPrompt: value } })}
          rows={6}
        />
      </ConfigSection>

      <ConfigSection title="输出变量">
        <IOSection title="" emptyLabel="输出变量" items={node.outputs} onChange={(items) => onUpdateNode({ outputs: items })} />
      </ConfigSection>

      <ConfigSection title="异常处理">
        <div className="grid gap-3">
          <EditableField
            label="整体超时（秒）"
            type="number"
            value={String(config.timeoutSeconds ?? 180)}
            onChange={(value) => onUpdateNode({ config: { timeoutSeconds: Number(value) || 180 } })}
          />
          <EditableField
            label="重试次数"
            type="number"
            value={String(config.retryCount ?? 0)}
            onChange={(value) => onUpdateNode({ config: { retryCount: Number(value) || 0 } })}
          />
        </div>
        <SwitchRow
          label="首 Token 超时检测"
          checked={Boolean(config.firstTokenTimeoutEnabled)}
          onChange={(checked) => onUpdateNode({ config: { firstTokenTimeoutEnabled: checked } })}
          description="预留给 token 级流式调用。"
        />
        <SelectField
          label="异常策略"
          value={ERROR_STRATEGY_LABEL[config.errorStrategy ?? 'interrupt']}
          options={ERROR_STRATEGY_OPTIONS.map((item) => ERROR_STRATEGY_LABEL[item])}
          onChange={(label) => {
            const strategy = ERROR_STRATEGY_OPTIONS.find((item) => ERROR_STRATEGY_LABEL[item] === label) ?? 'interrupt'
            onUpdateNode({ config: { errorStrategy: strategy } })
          }}
        />
        {(config.errorStrategy ?? 'interrupt') === 'fallback' && (
          <EditableArea
            label="兜底输出"
            value={config.fallbackOutput ?? ''}
            onChange={(value) => onUpdateNode({ config: { fallbackOutput: value } })}
            rows={3}
          />
        )}
      </ConfigSection>
    </ConfigShell>
  )
}
