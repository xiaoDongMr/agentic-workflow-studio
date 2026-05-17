import { Plus, SlidersHorizontal, Sparkles, Trash2 } from 'lucide-react'
import type { HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'
import type { WorkflowInputMapping, WorkflowNode, WorkflowNodeIO } from '@/types/workflow'

interface NodeConfigPanelProps extends HTMLAttributes<HTMLDivElement> {
  node: WorkflowNode
  onUpdateNode: (
    partial: Partial<Omit<WorkflowNode, 'config'>> & {
      config?: Partial<WorkflowNode['config']>
    },
  ) => void
}

export function NodeConfigPanel({
  node,
  onUpdateNode,
  className,
}: NodeConfigPanelProps) {
  const inputMappings = node.config.inputMappings

  return (
    <div
      className={cn(
        'flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[28px] border border-white/8 bg-slate-950/92 shadow-[0_24px_80px_rgba(2,6,23,0.48)] backdrop-blur',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-white">节点配置</p>
          <p className="mt-1 text-xs text-slate-400">当前节点：{node.title}</p>
        </div>
        <Sparkles className="h-4 w-4 text-blue-300" />
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
        <section className="rounded-3xl border border-white/8 bg-white/4 p-4">
          <p className="text-sm font-medium text-white">基础信息</p>
          <div className="mt-4 space-y-4 text-sm">
            <EditableField
              label="节点名称"
              value={node.title}
              onChange={(value) => onUpdateNode({ title: value })}
            />
            <EditableArea
              label="节点描述"
              value={node.description}
              onChange={(value) => onUpdateNode({ description: value })}
              rows={3}
            />
            <Field label="节点类型" value={node.type} />
          </div>
        </section>

        <section className="rounded-3xl border border-white/8 bg-white/4 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <SlidersHorizontal className="h-4 w-4 text-blue-300" />
            AI 配置
          </div>

          <div className="mt-4 space-y-4">
            <SwitchRow
              label="启用节点"
              checked={node.config.enabled}
              onChange={(checked) => onUpdateNode({ config: { enabled: checked } })}
            />
            <SwitchRow
              label="失败转人工"
              checked={node.config.fallbackToHuman}
              onChange={(checked) => onUpdateNode({ config: { fallbackToHuman: checked } })}
            />
            <SelectField
              label="模型"
              value={node.config.model}
              options={['GPT-4o', 'Embedding + Rerank', 'Function Calling', 'Rule Engine', 'HTTP Bridge', 'System', 'N/A']}
              onChange={(value) => onUpdateNode({ config: { model: value } })}
            />
            <SelectField
              label="响应模式"
              value={node.config.responseMode}
              options={['text', 'json', 'stream']}
              onChange={(value) =>
                onUpdateNode({
                  config: { responseMode: value as WorkflowNode['config']['responseMode'] },
                })
              }
            />
            <div>
              <p className="text-xs text-slate-400">温度</p>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={node.config.temperature}
                  onChange={(event) =>
                    onUpdateNode({ config: { temperature: Number(event.target.value) } })
                  }
                  className="h-2 w-full cursor-pointer accent-blue-500"
                />
                <span className="w-10 text-right text-sm text-white">{node.config.temperature}</span>
              </div>
            </div>
            <EditableField
              label="最大 Token"
              type="number"
              value={String(node.config.maxTokens)}
              onChange={(value) => onUpdateNode({ config: { maxTokens: Number(value) || 0 } })}
            />
            <EditableField
              label="输出字段"
              value={node.config.outputKey}
              onChange={(value) => onUpdateNode({ config: { outputKey: value } })}
            />
            <EditableArea
              label="提示词"
              value={node.config.prompt}
              onChange={(value) => onUpdateNode({ config: { prompt: value } })}
              rows={6}
            />
          </div>
        </section>

        <section className="rounded-3xl border border-white/8 bg-white/4 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-white">输入映射</p>
            <button
              type="button"
              onClick={() =>
                onUpdateNode({
                  config: {
                    inputMappings: [
                      ...inputMappings,
                      {
                        field: '',
                        sourceType: 'context',
                        source: '',
                      },
                    ],
                  },
                })
              }
              className="inline-flex items-center gap-1 rounded-xl border border-white/8 bg-slate-950/70 px-2 py-1 text-[11px] text-slate-300 transition-colors hover:border-blue-400/25 hover:text-white"
            >
              <Plus className="h-3.5 w-3.5" />
              添加
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {inputMappings.map((mapping, index) => (
              <MappingRow
                key={`${mapping.field}-${index}`}
                mapping={mapping}
                onChange={(nextMapping) =>
                  onUpdateNode({
                    config: {
                      inputMappings: inputMappings.map((item, itemIndex) =>
                        itemIndex === index ? nextMapping : item,
                      ),
                    },
                  })
                }
                onRemove={() =>
                  onUpdateNode({
                    config: {
                      inputMappings: inputMappings.filter((_, itemIndex) => itemIndex !== index),
                    },
                  })
                }
              />
            ))}
            {inputMappings.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/50 px-3 py-3 text-xs text-slate-500">
                暂无输入映射，点击右上角“添加”创建。
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-white/8 bg-white/4 p-4">
          <p className="text-sm font-medium text-white">输入 / 输出</p>
          <div className="mt-4 space-y-4">
            <IOSection
              title="输入"
              items={node.inputs}
              onChange={(items) => onUpdateNode({ inputs: items })}
            />
            <IOSection
              title="输出"
              items={node.outputs}
              onChange={(items) => onUpdateNode({ outputs: items })}
            />
          </div>
        </section>
      </div>
    </div>
  )
}

function SwitchRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/8 bg-slate-950/55 px-3 py-3">
      <div>
        <p className="text-sm text-white">{label}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 rounded-full border transition-colors',
          checked ? 'border-blue-400/60 bg-blue-500/80' : 'border-white/10 bg-white/8',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white transition-transform',
            checked ? 'translate-x-[21px]' : 'translate-x-[3px]',
          )}
        />
      </button>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <div className="mt-2 rounded-2xl border border-white/8 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100">
        {value}
      </div>
    </div>
  )
}

function EditableField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'number'
}) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-white/8 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-blue-400/50"
      />
    </div>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-white/8 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-blue-400/50"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  )
}

function EditableArea({
  label,
  value,
  onChange,
  rows,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  rows: number
}) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <textarea
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full resize-none rounded-2xl border border-white/8 bg-slate-950/80 px-3 py-3 text-sm text-slate-200 outline-none focus:border-blue-400/50"
      />
    </div>
  )
}

function IOSection({
  title,
  items,
  onChange,
}: {
  title: string
  items: WorkflowNode['inputs']
  onChange: (items: WorkflowNodeIO[]) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-400">{title}</p>
        <button
          type="button"
          onClick={() =>
            onChange([
              ...items,
              {
                name: '',
                type: 'string',
                description: '',
              },
            ])
          }
          className="inline-flex items-center gap-1 rounded-xl border border-white/8 bg-slate-950/70 px-2 py-1 text-[11px] text-slate-300 transition-colors hover:border-blue-400/25 hover:text-white"
        >
          <Plus className="h-3.5 w-3.5" />
          添加
        </button>
      </div>
      <div className="mt-2 space-y-2">
        {items.map((item, index) => (
          <IOEditorCard
            key={`${title}-${index}`}
            item={item}
            onChange={(nextItem) =>
              onChange(items.map((currentItem, currentIndex) => (currentIndex === index ? nextItem : currentItem)))
            }
            onRemove={() => onChange(items.filter((_, currentIndex) => currentIndex !== index))}
          />
        ))}
        {items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/50 px-3 py-3 text-xs text-slate-500">
            暂无{title}字段，点击右上角“添加”创建。
          </div>
        )}
      </div>
    </div>
  )
}

function IOEditorCard({
  item,
  onChange,
  onRemove,
}: {
  item: WorkflowNodeIO
  onChange: (item: WorkflowNodeIO) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/80 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-400">字段配置</p>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center gap-1 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/6 hover:text-rose-300"
          aria-label="删除字段"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_112px]">
        <EditableField
          label="字段名"
          value={item.name}
          onChange={(value) => onChange({ ...item, name: value })}
        />
        <EditableField
          label="类型"
          value={item.type}
          onChange={(value) => onChange({ ...item, type: value })}
        />
      </div>
      <div className="mt-3">
        <EditableArea
          label="描述"
          value={item.description}
          onChange={(value) => onChange({ ...item, description: value })}
          rows={2}
        />
      </div>
    </div>
  )
}

function MappingRow({
  mapping,
  onChange,
  onRemove,
}: {
  mapping: WorkflowInputMapping
  onChange: (mapping: WorkflowInputMapping) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-400">映射配置</p>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center gap-1 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/6 hover:text-rose-300"
          aria-label="删除输入映射"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_112px]">
        <EditableField
          label="字段名"
          value={mapping.field}
          onChange={(value) => onChange({ ...mapping, field: value })}
        />
        <SelectField
          label="来源类型"
          value={mapping.sourceType}
          options={['node', 'context', 'literal']}
          onChange={(value) =>
            onChange({ ...mapping, sourceType: value as WorkflowInputMapping['sourceType'] })
          }
        />
      </div>
      <div className="mt-3">
        <EditableField
          label="来源值"
          value={mapping.source}
          onChange={(value) => onChange({ ...mapping, source: value })}
        />
      </div>
    </div>
  )
}
