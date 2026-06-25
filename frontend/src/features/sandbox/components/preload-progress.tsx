import { preloadProgressPercent } from '@/features/sandbox/sandbox-pool-utils'
import { cn } from '@/lib/utils'

export function PreloadProgress({
  ready,
  desired,
  status,
  compact = false,
}: {
  ready: number
  desired: number
  status: string
  compact?: boolean
}) {
  const percent = preloadProgressPercent(ready, desired, status)
  return (
    <div className={cn('space-y-1.5', compact && 'space-y-1')}>
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span className="text-slate-500">
          {desired > 0 ? `${ready}/${desired} 节点` : status === 'builtin' ? '内置镜像' : '等待节点'}
        </span>
        <span className={cn('font-medium', status === 'ready' ? 'text-emerald-200' : 'text-slate-300')}>{percent}%</span>
      </div>
      <div className={cn('h-1.5 overflow-hidden rounded-full bg-slate-900', compact && 'h-1')}>
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            status === 'ready' || status === 'builtin' ? 'bg-emerald-300' : status === 'unknown' ? 'bg-amber-300' : 'bg-blue-300',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
