import type { GlobalDebugFieldValue } from '@/features/workflow/editor/workflow-editor.types'

export function SelectorTrialInputSection({
  fields,
  error,
  onChange,
}: {
  fields: GlobalDebugFieldValue[]
  error?: string
  onChange: (fieldName: string, value: string) => void
}) {
  if (fields.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-3 py-4 text-xs text-slate-500">
        当前选择器无需手动输入。上游引用会在全局调试时由上游节点提供，单节点调试仅验证现有规则结构。
      </div>
    )
  }

  const groups = [
    {
      key: 'node',
      title: '上游引用',
      description: '填写规则中引用的上游变量值。',
      fields: fields.filter((field) => field.group === 'node'),
    },
    {
      key: 'context',
      title: '运行输入',
      description: '填写规则中引用的入口参数。',
      fields: fields.filter((field) => field.group === 'context'),
    },
  ].filter((group) => group.fields.length > 0)

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.key} className="rounded-[18px] border border-white/8 bg-slate-900/45 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">{group.title}</p>
              <p className="mt-0.5 text-[10px] text-slate-500">{group.description}</p>
            </div>
            <span className="rounded-full border border-white/8 bg-white/5 px-2.5 py-1 text-[10px] text-slate-400">
              {group.fields.length} 项
            </span>
          </div>
          <div className="space-y-2">
            {group.fields.map((field) => (
              <SelectorDebugFieldInput key={field.name} field={field} error={error} onChange={onChange} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function SelectorDebugFieldInput({
  field,
  error,
  onChange,
}: {
  field: GlobalDebugFieldValue
  error?: string
  onChange: (fieldName: string, value: string) => void
}) {
  const sourceLabel = field.sourceLabel || (field.group === 'node' ? '上游变量' : '运行输入')

  return (
    <div className="rounded-[14px] border border-white/8 bg-slate-950/35 p-2.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium text-slate-100">{field.label || field.name}</span>
            {field.valueType && (
              <span className="rounded-md border border-white/8 bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400">
                {field.valueType}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
            <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-slate-400">{sourceLabel}</span>
            {field.description && <span className="leading-4">{field.description}</span>}
          </div>
        </div>
        {field.usageHints?.[0] && (
          <span className="rounded-full border border-cyan-400/14 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-100">
            {field.usageHints[0]}
          </span>
        )}
      </div>
      {field.type === 'json' ? (
        <textarea
          value={field.value}
          onChange={(event) => onChange(field.name, event.target.value)}
          placeholder="输入 JSON 调试值"
          spellCheck={false}
          className="min-h-24 w-full resize-y rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 font-mono text-xs text-slate-100 outline-none transition-colors placeholder:text-slate-500 focus:border-blue-400/40"
        />
      ) : (
        <input
          type="text"
          value={field.value}
          onChange={(event) => onChange(field.name, event.target.value)}
          placeholder="输入调试值"
          className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-500 focus:border-blue-400/40"
        />
      )}
      {error && <p className="mt-1 text-[10px] text-rose-300">{error}</p>}
    </div>
  )
}
