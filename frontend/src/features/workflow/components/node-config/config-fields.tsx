import { Plus, SlidersHorizontal, Sparkles, Trash2 } from 'lucide-react'
import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { IOSection } from '@/features/workflow/components/node-config/io-section'
import type { WorkflowInputMapping, WorkflowNode } from '@/types/workflow'

const DEFAULT_MODEL_LABEL = '默认模型'
const INPUT_MAPPING_SOURCE_TYPES: WorkflowInputMapping['sourceType'][] = ['node', 'context', 'literal']

export { IOSection } from '@/features/workflow/components/node-config/io-section'

export interface NodeConfigPanelProps extends HTMLAttributes<HTMLDivElement> {
  node: WorkflowNode
  nodes?: WorkflowNode[]
  edges?: { source: string; target: string }[]
  onUpdateNode: (
    partial: Partial<Omit<WorkflowNode, 'config'>> & {
      config?: Partial<WorkflowNode['config']>
    },
  ) => void
}

export function ConfigShell({
  node,
  className,
  children,
}: {
  node: WorkflowNode
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'aw-node-config-panel flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[22px] border border-white/8 bg-slate-950/92 shadow-[0_24px_80px_rgba(2,6,23,0.48)] backdrop-blur',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-white/8 px-3.5 py-2.5">
        <div>
          <p className="text-[13px] font-semibold text-white">节点配置</p>
          <p className="mt-0.5 truncate text-[11px] text-slate-400">{node.title}</p>
        </div>
        <Sparkles className="h-3.5 w-3.5 text-blue-300" />
      </div>

      <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-3.5">{children}</div>
    </div>
  )
}

export function ConfigSection({
  title,
  icon,
  children,
}: {
  title: string
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-white/8 bg-white/4 p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-white">
        {icon}
        {title}
      </div>
      <div className="mt-2.5 space-y-2.5">{children}</div>
    </section>
  )
}

export function BasicInfoSection({ node, onUpdateNode }: NodeConfigPanelProps) {
  return (
    <ConfigSection title="基础信息">
      <EditableField label="节点名称" value={node.title} onChange={(value) => onUpdateNode({ title: value })} />
      <EditableArea
        label="节点描述"
        value={node.description}
        onChange={(value) => onUpdateNode({ description: value })}
        rows={3}
      />
    </ConfigSection>
  )
}

export function RuntimeSwitchSection({ node, onUpdateNode }: NodeConfigPanelProps) {
  return (
    <ConfigSection title="运行设置" icon={<SlidersHorizontal className="h-4 w-4 text-blue-300" />}>
      <SwitchRow
        label="启用节点"
        checked={node.config.enabled}
        onChange={(checked) => onUpdateNode({ config: { enabled: checked } })}
      />
    </ConfigSection>
  )
}

export function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-slate-400">{label}</p>
      <div className="mt-1.5 rounded-xl border border-white/8 bg-slate-950/80 px-2.5 py-2 text-xs text-slate-100">
        {value}
      </div>
    </div>
  )
}

export function EditableField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'number'
  placeholder?: string
}) {
  return (
    <div>
      <p className="text-[11px] text-slate-400">{label}</p>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-xl border border-white/8 bg-slate-950/80 px-2.5 py-2 text-[11px] leading-4 text-slate-100 outline-none placeholder:text-[11px] placeholder:text-slate-600 focus:border-blue-400/50"
      />
    </div>
  )
}

export function SelectField({
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
      <p className="text-[11px] text-slate-400">{label}</p>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-xl border border-white/8 bg-slate-950/80 px-2.5 py-2 text-[11px] leading-4 text-slate-100 outline-none focus:border-blue-400/50"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option || DEFAULT_MODEL_LABEL}
          </option>
        ))}
      </select>
    </div>
  )
}

export function EditableArea({
  label,
  value,
  onChange,
  rows,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  rows: number
  placeholder?: string
}) {
  return (
    <div>
      <p className="text-[11px] text-slate-400">{label}</p>
      <textarea
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full resize-none rounded-xl border border-white/8 bg-slate-950/80 px-2.5 py-2.5 text-[11px] leading-4 text-slate-200 outline-none placeholder:text-[11px] placeholder:text-slate-600 focus:border-blue-400/50"
      />
    </div>
  )
}

export function SwitchRow({
  label,
  checked,
  onChange,
  description,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  description?: string
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-white/8 bg-slate-950/55 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-white">{label}</p>
        {description && <p className="mt-1 text-[11px] text-slate-500">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full border p-0.5 transition-colors',
          checked ? 'border-blue-400/60 bg-blue-500/80' : 'border-white/10 bg-white/8',
        )}
      >
        <span
          className={cn(
            'h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0',
          )}
        />
      </button>
    </div>
  )
}

export function InputMappingSection({
  title = '输入映射',
  emptyText = '暂无输入映射，点击右上角“添加”创建。',
  mappings,
  onChange,
}: {
  title?: string
  emptyText?: string
  mappings: WorkflowInputMapping[]
  onChange: (mappings: WorkflowInputMapping[]) => void
}) {
  return (
    <ConfigSection title={title}>
      <div className="-mt-1 flex justify-end">
        <button
          type="button"
          onClick={() => onChange([...mappings, { field: '', sourceType: 'context', source: '' }])}
          className="inline-flex items-center gap-1 rounded-lg border border-white/8 bg-slate-950/70 px-2 py-1 text-[10px] text-slate-300 transition-colors hover:border-blue-400/25 hover:text-white"
        >
          <Plus className="h-3 w-3" />
          添加
        </button>
      </div>
      <div className="space-y-3">
        {mappings.map((mapping, index) => (
          <MappingRow
            key={`${mapping.field}-${index}`}
            mapping={mapping}
            onChange={(nextMapping) =>
              onChange(mappings.map((item, itemIndex) => (itemIndex === index ? nextMapping : item)))
            }
            onRemove={() => onChange(mappings.filter((_, itemIndex) => itemIndex !== index))}
          />
        ))}
        {mappings.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/50 px-2.5 py-2.5 text-[11px] text-slate-500">
            {emptyText}
          </div>
        )}
      </div>
    </ConfigSection>
  )
}

export function IOConfigSection({ node, onUpdateNode }: NodeConfigPanelProps) {
  return (
    <>
      <ConfigSection title="输入变量">
        <IOSection title="" emptyLabel="输入变量" items={node.inputs} onChange={(items) => onUpdateNode({ inputs: items })} />
      </ConfigSection>
      <ConfigSection title="输出变量">
        <IOSection title="" emptyLabel="输出变量" items={node.outputs} onChange={(items) => onUpdateNode({ outputs: items })} />
      </ConfigSection>
    </>
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
    <div className="rounded-xl border border-white/8 bg-slate-950/70 p-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-slate-400">映射配置</p>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center gap-1 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/6 hover:text-rose-300"
          aria-label="删除输入映射"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <div className="grid gap-2.5">
        <EditableField
          label="字段名"
          value={mapping.field}
          onChange={(value) => onChange({ ...mapping, field: value })}
        />
        <SelectField
          label="来源类型"
          value={mapping.sourceType}
          options={INPUT_MAPPING_SOURCE_TYPES}
          onChange={(value) => onChange({ ...mapping, sourceType: value as WorkflowInputMapping['sourceType'] })}
        />
      </div>
      <div className="mt-2.5">
        <EditableField label="来源值" value={mapping.source} onChange={(value) => onChange({ ...mapping, source: value })} />
      </div>
    </div>
  )
}
