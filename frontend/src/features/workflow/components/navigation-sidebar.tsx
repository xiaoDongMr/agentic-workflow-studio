import {
  Bot,
  Boxes,
  Cog,
  Database,
  FileClock,
  LayoutPanelLeft,
  Sparkles,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const navItems = [
  { key: 'design', label: '工作流设计', icon: LayoutPanelLeft, active: true },
  { key: 'logs', label: '运行记录', icon: FileClock },
  { key: 'data', label: '数据管理', icon: Database },
  { key: 'skills', label: '技能库', icon: Sparkles },
  { key: 'templates', label: '模板中心', icon: Boxes },
  { key: 'settings', label: '设置', icon: Cog },
]

export function NavigationSidebar() {
  return (
    <aside className="hidden w-[76px] shrink-0 border-r border-white/8 bg-slate-950/90 px-3 py-5 xl:flex xl:flex-col">
      <div className="flex justify-center rounded-2xl border border-white/8 bg-white/4 px-2 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300">
          <Bot className="h-5 w-5" />
        </div>
      </div>

      <nav className="mt-6 flex flex-1 flex-col gap-2">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.key}
              type="button"
              className={cn(
                'flex items-center justify-center rounded-2xl px-3 py-3 text-left text-sm transition-colors',
                item.active
                  ? 'bg-blue-500/14 text-white shadow-[inset_0_0_0_1px_rgba(96,165,250,0.35)]'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
              )}
              title={item.label}
            >
              <Icon className="h-4 w-4" />
            </button>
          )
        })}
      </nav>

      <div className="flex justify-center">
        <Badge
          className="h-10 w-10 justify-center rounded-2xl border-blue-500/20 bg-[radial-gradient(circle_at_top,#2563eb33,transparent_55%),linear-gradient(180deg,#111a34_0%,#090f1f_100%)] p-0 text-blue-200"
          title="AI 助手"
        >
          AI
        </Badge>
      </div>
    </aside>
  )
}
