import type { HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-white/10 bg-white/6 px-2.5 py-1 text-xs font-medium text-slate-200',
        className,
      )}
      {...props}
    />
  )
}
