import { useMemo } from 'react'

import { buildSelectorEvaluation, formatResolvedValue } from '@/features/workflow/editor/selector-debug/selector-evaluation'
import { cn } from '@/lib/utils'
import type { WorkflowNode } from '@/types/workflow'

export function SelectorTrialResult({
  node,
  input,
  output,
}: {
  node: WorkflowNode
  input: Record<string, unknown>
  output: Record<string, unknown>
}) {
  const evaluation = useMemo(() => buildSelectorEvaluation(node, input, output), [node, input, output])

  return (
    <div className="space-y-3">
      <div className="rounded-[18px] border border-emerald-400/18 bg-emerald-500/[0.08] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-medium tracking-[0.08em] text-emerald-200/90">命中分支</p>
            <span className="rounded-full border border-emerald-300/20 bg-emerald-400/14 px-2.5 py-1 text-sm font-semibold text-emerald-100">
              {evaluation.matchedBranchLabel}
            </span>
          </div>
          <span className="text-[11px] text-emerald-100/80">
            输出 {evaluation.outputKey}: {evaluation.branchOutputLabel}
          </span>
        </div>
        {evaluation.matchedExpression && (
          <p className="mt-2 truncate text-[11px] text-emerald-100/70">{evaluation.matchedExpression}</p>
        )}
      </div>

      <div className="rounded-[18px] border border-white/8 bg-slate-900/55 p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-white">条件明细</p>
          <span className="text-[11px] text-slate-500">{evaluation.branchResults.length + 1} 个分支</span>
        </div>
        <div className="space-y-2">
          {evaluation.branchResults.map((branch, branchIndex) => (
            <div
              key={branch.id}
              className={cn(
                'rounded-[16px] border p-2.5 transition-colors',
                branch.matched
                  ? 'border-emerald-400/24 bg-emerald-500/[0.05]'
                  : 'border-white/8 bg-slate-950/45',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-400/10 text-[10px] font-semibold text-cyan-100">
                    {branchIndex + 1}
                  </span>
                  <span className="text-sm font-semibold text-white">{branch.displayLabel}</span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-medium',
                      branch.matched ? 'bg-emerald-400/14 text-emerald-100' : 'bg-white/6 text-slate-300',
                    )}
                  >
                    {branch.matched ? '命中' : '未命中'}
                  </span>
                </div>
                <span className="text-[11px] text-slate-500">{branch.summary}</span>
              </div>
              <div className="mt-2 space-y-1.5">
                {branch.conditions.map((condition) => (
                  <div
                    key={condition.id}
                    className={cn(
                      'rounded-xl border px-2.5 py-2',
                      condition.matched
                        ? 'border-emerald-400/14 bg-emerald-500/[0.03]'
                        : 'border-rose-400/14 bg-rose-500/[0.025]',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex flex-wrap items-center gap-1.5 text-sm text-slate-100">
                        <span className="font-medium">{condition.leftLabel}</span>
                        <span className="text-cyan-200">{condition.operatorLabel}</span>
                        <span className="font-medium">{condition.rightLabel}</span>
                      </div>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-medium',
                          condition.matched ? 'bg-emerald-400/14 text-emerald-100' : 'bg-rose-400/12 text-rose-100',
                        )}
                      >
                        {condition.matched ? '通过' : '未通过'}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-slate-500">
                      实际值：{formatResolvedValue(condition.leftValue)} / {formatResolvedValue(condition.rightValue)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div
            className={cn(
              'rounded-[16px] border p-2.5',
              evaluation.elseMatched ? 'border-emerald-400/24 bg-emerald-500/[0.05]' : 'border-white/8 bg-slate-950/45',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">否则</span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-medium',
                    evaluation.elseMatched ? 'bg-emerald-400/14 text-emerald-100' : 'bg-white/6 text-slate-300',
                  )}
                >
                  {evaluation.elseMatched ? '命中' : '未命中'}
                </span>
              </div>
              <span className="text-[11px] text-slate-500">所有条件分支未命中时进入</span>
            </div>
          </div>
        </div>
      </div>

      <details className="rounded-[16px] border border-white/8 bg-slate-900/35 p-3">
        <summary className="cursor-pointer text-xs font-medium text-slate-400">调试快照</summary>
        <div className="mt-3 space-y-3">
          <SelectorSnapshotBlock title="输入" value={JSON.stringify(input, null, 2)} />
          <SelectorSnapshotBlock title="输出" value={JSON.stringify(output, null, 2)} />
        </div>
      </details>
    </div>
  )
}

function SelectorSnapshotBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-slate-950/60 p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">{title}</p>
      </div>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-slate-300">
        {value || '无'}
      </pre>
    </div>
  )
}
