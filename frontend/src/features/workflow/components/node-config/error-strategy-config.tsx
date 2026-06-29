import { AlertTriangle } from 'lucide-react'

import {
  EditableArea,
  EditableField,
} from '@/features/workflow/components/node-config/config-fields'
import { cn } from '@/lib/utils'
import type { WorkflowNodeConfig } from '@/types/workflow'

export type WorkflowErrorStrategy = NonNullable<WorkflowNodeConfig['errorStrategy']>

interface ErrorStrategyConfigProps {
  errorStrategy: WorkflowErrorStrategy
  fallbackOutput: string
  retryCount: number
  timeoutSeconds?: number
  onChange: (patch: Partial<WorkflowNodeConfig>) => void
  showTimeout?: boolean
}

const ERROR_STRATEGY_OPTIONS: Array<{
  description: string
  label: string
  value: WorkflowErrorStrategy
}> = [
  {
    description: '节点失败时立即停止当前工作流。',
    label: '中断工作流',
    value: 'interrupt',
  },
  {
    description: '节点失败时返回兜底输出并继续。',
    label: '使用兜底输出',
    value: 'fallback',
  },
  {
    description: '忽略错误并继续后续节点。',
    label: '忽略并继续',
    value: 'ignore',
  },
]

export function ErrorStrategyConfig({
  errorStrategy,
  fallbackOutput,
  retryCount,
  timeoutSeconds,
  onChange,
  showTimeout = false,
}: ErrorStrategyConfigProps) {
  return (
    <div className="space-y-2.5">
      <div className={cn('grid gap-2.5', showTimeout ? 'sm:grid-cols-2' : '')}>
        {showTimeout ? (
          <EditableField
            label="超时时间（秒）"
            type="number"
            value={String(timeoutSeconds ?? 180)}
            onChange={(value) => onChange({ timeoutSeconds: normalizeInteger(value, 180, 1) })}
          />
        ) : null}
        <EditableField
          label="重试次数（0-10）"
          type="number"
          value={String(retryCount)}
          onChange={(value) => onChange({ retryCount: normalizeInteger(value, 1, 0, 10) })}
        />
      </div>

      <div>
        <p className="text-[11px] text-slate-400">异常策略</p>
        <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-xl border border-white/8 bg-slate-950/62 p-1">
          {ERROR_STRATEGY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange({ errorStrategy: option.value })}
              className={cn(
                'min-w-0 rounded-lg border px-2 py-1.5 text-center transition',
                option.value === errorStrategy
                  ? 'border-amber-300/24 bg-amber-400/12 text-amber-50'
                  : 'border-transparent text-slate-400 hover:border-white/8 hover:bg-white/[0.045] hover:text-slate-100',
              )}
            >
              <span className="flex items-center justify-center gap-1 text-[11px] font-semibold">
                {option.value === errorStrategy ? <AlertTriangle className="h-3.5 w-3.5 text-amber-200" /> : null}
                {option.label}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-1.5 rounded-lg border border-white/8 bg-slate-950/45 px-2.5 py-2 text-[11px] leading-4 text-slate-500">
          {ERROR_STRATEGY_OPTIONS.find((option) => option.value === errorStrategy)?.description}
        </p>
      </div>

      {errorStrategy === 'fallback' ? (
        <EditableArea
          label="兜底输出"
          value={fallbackOutput}
          rows={4}
          placeholder='{"output": null}'
          onChange={(value) => onChange({ fallbackOutput: value })}
        />
      ) : null}
    </div>
  )
}

function normalizeInteger(value: string, fallback: number, minValue: number, maxValue?: number) {
  const parsedValue = Number(value)
  if (!Number.isInteger(parsedValue)) {
    return fallback
  }
  const lowerBounded = Math.max(parsedValue, minValue)
  return typeof maxValue === 'number' ? Math.min(lowerBounded, maxValue) : lowerBounded
}
