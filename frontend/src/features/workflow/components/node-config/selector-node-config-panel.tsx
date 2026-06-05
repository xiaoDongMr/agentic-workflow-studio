import { Check, ChevronDown, GitBranch, Link2, PenLine, Plus, Route, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import {
  BasicInfoSection,
  ConfigSection,
  ConfigShell,
  type NodeConfigPanelProps,
} from '@/features/workflow/components/node-config/config-fields'
import {
  createSelectorBranch,
  createSelectorCondition,
  createSelectorOperand,
  createSelectorOperandFromVariable,
  getSelectorBranches,
  SELECTOR_OPERATOR_LABELS,
  SELECTOR_ELSE_BRANCH,
  serializeSelectorBranches,
} from '@/features/workflow/components/node-config/selector-utils'
import {
  formatValueType,
  getAvailableInputSources,
  groupVariableSources,
  type WorkflowVariableSource,
} from '@/features/workflow/components/node-config/variable-utils'
import { useClickOutside } from '@/features/workflow/components/node-config/use-click-outside'
import { cn } from '@/lib/utils'
import type {
  WorkflowSelectorBranch,
  WorkflowSelectorCondition,
  WorkflowSelectorOperand,
  WorkflowSelectorOperator,
} from '@/types/workflow'

const SELECTOR_OUTPUT_KEY = 'branch'

export function SelectorNodeConfigPanel({
  node,
  nodes,
  edges,
  onUpdateNode,
  className,
}: NodeConfigPanelProps) {
  const variableSources = useMemo(() => getAvailableInputSources(node, nodes, edges), [edges, node, nodes])
  const branches = useMemo(() => getSelectorBranches(node), [node])

  const commitBranches = (nextBranches: WorkflowSelectorBranch[]) => {
    onUpdateNode({
      config: {
        selectorBranches: nextBranches,
        selectorElseBranch: SELECTOR_ELSE_BRANCH,
        prompt: serializeSelectorBranches(nextBranches),
        outputKey: node.config.outputKey || SELECTOR_OUTPUT_KEY,
      },
    })
  }

  const updateBranch = (branchId: string, patch: Partial<WorkflowSelectorBranch>) => {
    commitBranches(branches.map((branch) => (branch.id === branchId ? { ...branch, ...patch } : branch)))
  }

  const removeBranch = (branchId: string) => {
    const nextBranches = branches.filter((branch) => branch.id !== branchId)
    commitBranches(nextBranches.length ? nextBranches : [createSelectorBranch(1)])
  }

  const addCondition = (branch: WorkflowSelectorBranch) => {
    updateBranch(branch.id, {
      conditions: [...branch.conditions, createSelectorCondition(variableSources[0]?.value ?? '')],
    })
  }

  const updateCondition = (
    branch: WorkflowSelectorBranch,
    conditionId: string,
    patch: Partial<WorkflowSelectorCondition>,
  ) => {
    updateBranch(branch.id, {
      conditions: branch.conditions.map((condition) =>
        condition.id === conditionId ? { ...condition, ...patch } : condition,
      ),
    })
  }

  const removeCondition = (branch: WorkflowSelectorBranch, conditionId: string) => {
    const nextConditions = branch.conditions.filter((condition) => condition.id !== conditionId)
    updateBranch(branch.id, {
      conditions: nextConditions.length ? nextConditions : [createSelectorCondition(variableSources[0]?.value ?? '')],
    })
  }

  return (
    <ConfigShell node={node} className={className}>
      <BasicInfoSection node={node} onUpdateNode={onUpdateNode} />

      <ConfigSection title="条件分支" icon={<GitBranch className="h-4 w-4 text-cyan-300" />}>
        <div className="rounded-xl border border-cyan-300/15 bg-cyan-400/8 px-2.5 py-2 text-[10px] leading-4 text-cyan-100/80">
          从上到下匹配条件分支；同一分支内多个条件为“且”关系。待匹配值和比较值都可以引用上游变量或填写自定义值。
        </div>

        <div className="space-y-2.5">
          {branches.map((branch, branchIndex) => (
            <div key={branch.id} className="rounded-2xl border border-white/8 bg-slate-950/58 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-cyan-400/14 px-1.5 text-[10px] font-semibold text-cyan-100">
                    如果
                  </span>
                  {branches.length > 1 && (
                    <span className="truncate text-[11px] text-slate-400">条件分支 {branchIndex + 1}</span>
                  )}
                </div>
                {branches.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeBranch(branch.id)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/6 hover:text-rose-300"
                    aria-label="删除分支"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>

              <div className={cn('mt-2.5', branch.conditions.length > 1 ? 'space-y-2' : 'space-y-1.5')}>
                {branch.conditions.map((condition, conditionIndex) => {
                  const hasConnector = branch.conditions.length > 1
                  const isFirstCondition = conditionIndex === 0
                  const isLastCondition = conditionIndex === branch.conditions.length - 1

                  return (
                    <div key={condition.id} className={cn('relative', hasConnector && 'pl-5')}>
                      {hasConnector && (
                        <>
                          <span
                            className={cn(
                              'absolute left-2 w-px bg-gradient-to-b from-cyan-300/28 via-blue-300/22 to-cyan-300/16',
                              isFirstCondition ? 'top-1/2 -bottom-2' : isLastCondition ? '-top-2 bottom-1/2' : '-top-2 -bottom-2',
                            )}
                          />
                          {!isFirstCondition && (
                            <span className="absolute left-0 -top-[14px] z-10 inline-flex h-4 w-4 items-center justify-center rounded-full border border-cyan-300/20 bg-slate-950 text-[8px] font-semibold leading-none text-cyan-200 shadow-[0_0_0_3px_rgba(2,6,23,0.92)]">
                              且
                            </span>
                          )}
                        </>
                      )}
                      <ConditionRow
                        condition={condition}
                        variableSources={variableSources}
                        canRemove={branch.conditions.length > 1}
                        onChange={(patch) => updateCondition(branch, condition.id, patch)}
                        onRemove={() => removeCondition(branch, condition.id)}
                      />
                    </div>
                  )
                })}
              </div>

              <button
                type="button"
                onClick={() => addCondition(branch)}
                className="mt-2 flex h-7 w-full items-center justify-center gap-1 rounded-xl border border-dashed border-blue-300/18 bg-blue-400/6 text-[10px] font-medium text-blue-200/90 transition hover:border-blue-300/40 hover:bg-blue-400/12 hover:text-blue-100"
              >
                <Plus className="h-3 w-3" />
                新增条件
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => commitBranches([...branches, createSelectorBranch(branches.length + 1)])}
          className="flex h-8 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-blue-300/22 bg-slate-950/45 px-2.5 text-[11px] font-medium text-blue-100/90 transition hover:border-blue-300/45 hover:bg-blue-400/10 hover:text-blue-50"
        >
          <Plus className="h-3.5 w-3.5" />
          新增分支
        </button>
      </ConfigSection>

      <ConfigSection title="否则分支" icon={<Route className="h-4 w-4 text-blue-300" />}>
        <div className="rounded-2xl border border-white/8 bg-slate-950/58 p-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-blue-400/14 px-1.5 text-[10px] font-semibold text-blue-100">
              否则
            </span>
            <span className="text-[11px] text-slate-400">所有条件分支均未命中时执行</span>
          </div>
        </div>
      </ConfigSection>
    </ConfigShell>
  )
}

function ConditionRow({
  condition,
  variableSources,
  canRemove,
  onChange,
  onRemove,
}: {
  condition: WorkflowSelectorCondition
  variableSources: WorkflowVariableSource[]
  canRemove: boolean
  onChange: (patch: Partial<WorkflowSelectorCondition>) => void
  onRemove: () => void
}) {
  const operator = condition.operator || 'contains'

  return (
    <div className="rounded-xl border border-white/8 bg-slate-950/66 p-2 shadow-inner shadow-white/[0.02] transition-colors hover:border-white/12">
      {canRemove && (
        <div className="mb-1 flex justify-end">
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex h-5 w-5 items-center justify-center rounded-md text-slate-500 transition hover:bg-white/6 hover:text-rose-300"
            aria-label="删除条件"
          >
            <Trash2 className="h-2.5 w-2.5" />
          </button>
        </div>
      )}

      <div className="space-y-1.5">
        <OperandEditor
          operand={condition.left}
          variableSources={variableSources}
          placeholder="待匹配值"
          onChange={(left) => onChange({ left })}
        />
        <OperatorSelect
          value={operator}
          onChange={(nextOperator) => onChange({ operator: nextOperator })}
        />
        <OperandEditor
          operand={condition.right}
          variableSources={variableSources}
          placeholder="比较值"
          onChange={(right) => onChange({ right })}
        />
      </div>
    </div>
  )
}

function OperandEditor({
  operand,
  variableSources,
  placeholder,
  onChange,
}: {
  operand: WorkflowSelectorOperand
  variableSources: WorkflowVariableSource[]
  placeholder: string
  onChange: (operand: WorkflowSelectorOperand) => void
}) {
  const sourceType = operand.sourceType === 'literal' ? 'literal' : 'node'
  const operandSource = operand.source ?? [operand.nodeId, operand.fieldPath].filter(Boolean).join('.')

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <OperandModeSelect
        value={sourceType}
        onChange={(nextType) => {
          if (nextType === 'node') {
            const nextSource = variableSources[0]?.value ?? ''
            const nextVariable = variableSources[0]
            onChange(nextVariable ? createSelectorOperandFromVariable(nextVariable) : createSelectorOperand('node', nextSource))
            return
          }
          onChange(createSelectorOperand('literal', '', 'String'))
        }}
      />

      {sourceType === 'node' ? (
        <VariableSourceSelect
          value={operandSource}
          options={variableSources}
          onChange={(value) => {
            const nextSource = variableSources.find((source) => source.value === value)
            onChange(nextSource ? createSelectorOperandFromVariable(nextSource) : createSelectorOperand('node', value))
          }}
        />
      ) : (
        <input
          value={String(operand.literalValue ?? operand.source ?? '')}
          placeholder={placeholder}
          onChange={(event) => onChange(createSelectorOperand('literal', event.target.value))}
          className="h-8 min-w-0 flex-1 rounded-xl border border-white/8 bg-slate-950/80 px-2.5 text-[11px] text-slate-200 outline-none transition placeholder:text-slate-600 hover:border-white/14 focus:border-blue-400/50"
        />
      )}
    </div>
  )
}

function OperandModeSelect({
  value,
  onChange,
}: {
  value: 'node' | 'literal'
  onChange: (value: 'node' | 'literal') => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useClickOutside(rootRef, open, () => setOpen(false))
  const selected = value === 'node'
    ? { value: 'node' as const, label: '引用', icon: <Link2 className="h-3 w-3" /> }
    : { value: 'literal' as const, label: '自定义', icon: <PenLine className="h-3 w-3" /> }
  const options = [
    { value: 'node' as const, label: '引用', icon: <Link2 className="h-2.5 w-2.5" /> },
    { value: 'literal' as const, label: '自定义', icon: <PenLine className="h-2.5 w-2.5" /> },
  ]

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        title={selected.label}
        aria-label={`变量值来源：${selected.label}`}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-xl border border-white/8 bg-slate-950/72 text-slate-500 outline-none transition',
          'hover:border-blue-300/35 hover:bg-slate-900/85 hover:text-blue-100',
          open && 'border-blue-400/55 bg-blue-500/12 text-blue-100 ring-2 ring-blue-400/10',
        )}
      >
        <span className="text-current">{selected.icon}</span>
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-1.5 w-28 rounded-xl border border-white/10 bg-slate-950/98 p-1 shadow-[0_18px_48px_rgba(2,6,23,0.55)] backdrop-blur">
          {options.map((option) => {
            const isSelected = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={cn(
                  'flex h-7 w-full items-center gap-1.5 rounded-lg px-2 text-left text-[10px] leading-none transition',
                  isSelected ? 'bg-blue-400/14 text-blue-100' : 'text-slate-300 hover:bg-white/7 hover:text-white',
                )}
              >
                <span className="text-slate-400">{option.icon}</span>
                <span className="flex-1 whitespace-nowrap">{option.label}</span>
                {isSelected && <Check className="h-3 w-3 text-blue-200" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function OperatorSelect({
  value,
  onChange,
}: {
  value: WorkflowSelectorOperator
  onChange: (value: WorkflowSelectorOperator) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useClickOutside(rootRef, open, () => setOpen(false))
  const selectedLabel = SELECTOR_OPERATOR_LABELS[value] ?? SELECTOR_OPERATOR_LABELS.equals

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <div className="flex items-center gap-2 px-1">
        <span className="h-px flex-1 bg-gradient-to-r from-transparent via-white/8 to-white/12" />
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className={cn(
            'flex h-6 min-w-[78px] items-center justify-center gap-1 rounded-full border border-white/10 bg-slate-950/82 px-2.5 text-center text-[10px] font-medium text-slate-200 outline-none transition',
            'shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-cyan-300/30 hover:bg-cyan-400/8 hover:text-cyan-100 focus:border-blue-400/60',
            open && 'border-cyan-300/45 bg-cyan-400/10 text-cyan-100 ring-2 ring-cyan-300/10',
          )}
        >
          <span>{selectedLabel}</span>
          <ChevronDown className={cn('h-2.5 w-2.5 text-slate-500 transition', open && 'rotate-180 text-cyan-200')} />
        </button>
        <span className="h-px flex-1 bg-gradient-to-l from-transparent via-white/8 to-white/12" />
      </div>

      {open && (
        <div className="absolute left-1/2 z-50 mt-1.5 w-32 -translate-x-1/2 overflow-hidden rounded-xl border border-white/10 bg-slate-950/98 p-1 shadow-[0_18px_48px_rgba(2,6,23,0.55)] backdrop-blur">
          {Object.entries(SELECTOR_OPERATOR_LABELS).map(([operator, label]) => {
            const selected = operator === value
            return (
              <button
                key={operator}
                type="button"
                onClick={() => {
                  onChange(operator as WorkflowSelectorOperator)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition',
                  selected ? 'bg-blue-400/14 text-blue-100' : 'text-slate-300 hover:bg-white/7 hover:text-white',
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', selected ? 'bg-cyan-300' : 'bg-slate-700')} />
                <span className="min-w-0 flex-1 text-[10px] font-medium">{label}</span>
                {selected && <Check className="h-3 w-3 text-cyan-200" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function VariableSourceSelect({
  value,
  options,
  onChange,
}: {
  value: string
  options: WorkflowVariableSource[]
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useClickOutside(rootRef, open, () => setOpen(false))
  const selectedOption = options.find((option) => option.value === value)
  const groupedOptions = useMemo(() => groupVariableSources(options), [options])

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-white/8 bg-slate-950/80 px-2.5 text-left outline-none transition',
          'hover:border-blue-300/35 hover:bg-slate-900/85 focus:border-blue-400/60',
          open && 'border-blue-400/55 bg-blue-950/20 ring-2 ring-blue-400/10',
        )}
      >
        {selectedOption ? (
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="truncate text-[11px] font-medium text-slate-100">
              {selectedOption.nodeTitle}.{selectedOption.outputName}
            </span>
            <TypeBadge type={selectedOption.type} />
          </span>
        ) : (
          <span className="truncate text-[11px] text-slate-500">
            {options.length ? '请选择变量值' : '暂无可引用变量'}
          </span>
        )}
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-slate-500 transition', open && 'rotate-180 text-blue-200')} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-slate-950/98 p-1 shadow-[0_18px_48px_rgba(2,6,23,0.55)] backdrop-blur">
          {groupedOptions.map((group) => (
            <div key={group.title} className="mt-1 border-t border-white/6 pt-1 first:mt-0 first:border-t-0 first:pt-0">
              <p className="px-2 py-1 text-[9px] font-medium text-slate-500">{group.title}</p>
              {group.options.map((option) => {
                const selected = option.value === value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value)
                      setOpen(false)
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition',
                      selected ? 'bg-blue-400/14 text-blue-100' : 'text-slate-300 hover:bg-white/7 hover:text-white',
                    )}
                  >
                    <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                      {selected && <Check className="h-3.5 w-3.5 text-blue-200" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-medium">{option.outputName}</span>
                      <span className="mt-0.5 block truncate text-[9px] text-slate-500">{option.value}</span>
                    </span>
                    <TypeBadge type={option.type} muted />
                  </button>
                )
              })}
            </div>
          ))}
          {options.length === 0 && (
            <div className="px-2.5 py-3 text-[10px] leading-4 text-slate-500">
              暂无可引用的上游变量，请先连接前驱节点，或切换为自定义值。
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TypeBadge({ type, muted = false }: { type: string; muted?: boolean }) {
  return (
    <span className={cn('shrink-0 rounded bg-white/6 px-1 py-0.5 text-[8px] leading-3', muted ? 'text-slate-500' : 'text-slate-400')}>
      {formatShortType(type)}
    </span>
  )
}

function formatShortType(type: string) {
  return formatValueType(type).split(' ')[0]
}
