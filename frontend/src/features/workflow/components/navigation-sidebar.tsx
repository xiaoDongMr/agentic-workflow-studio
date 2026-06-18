import {
  Bot,
  Boxes,
  Cog,
  Database,
  FileClock,
  LayoutPanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Server,
  Sparkles,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type AppNavigationView = 'workflow' | 'sandbox'

const navItems = [
  { key: 'workflow', label: '工作流设计', icon: LayoutPanelLeft },
  { key: 'sandbox', label: '沙箱资源池', icon: Server },
  { key: 'logs', label: '运行记录', icon: FileClock },
  { key: 'data', label: '数据管理', icon: Database },
  { key: 'skills', label: '技能库', icon: Sparkles },
  { key: 'templates', label: '模板中心', icon: Boxes },
  { key: 'settings', label: '设置', icon: Cog },
]

interface NavigationSidebarProps {
  activeView: AppNavigationView
  collapsed: boolean
  onChangeView: (view: AppNavigationView) => void
  onToggleCollapsed: () => void
}

function isEnabledView(key: string): key is AppNavigationView {
  return key === 'workflow' || key === 'sandbox'
}

export function NavigationSidebar({
  activeView,
  collapsed,
  onChangeView,
  onToggleCollapsed,
}: NavigationSidebarProps) {
  return (
    <aside
      className={cn(
        'relative hidden shrink-0 border-r border-white/8 bg-slate-950/90 px-3 py-5 transition-[width] duration-300 ease-out xl:flex xl:flex-col',
        collapsed ? 'w-[76px]' : 'w-[248px]',
      )}
    >
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="group absolute right-2 top-[260px] bottom-32 z-20 hidden w-5 items-center justify-center rounded-full transition-colors hover:bg-white/[0.035] xl:flex"
        aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
        title={collapsed ? '展开侧边栏' : '收起侧边栏'}
      >
        <span className="absolute inset-y-4 left-1/2 w-px -translate-x-1/2 rounded-full bg-white/8 transition-colors group-hover:bg-blue-300/30" />
        <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/8 bg-slate-950/95 text-slate-500 shadow-[0_12px_28px_rgba(2,6,23,0.28)] transition-colors group-hover:border-blue-300/25 group-hover:text-blue-100">
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </span>
      </button>

      <div
        className={cn(
          'flex rounded-2xl border border-white/8 bg-white/4 px-2 py-3',
          collapsed ? 'items-center justify-center' : 'items-center gap-3',
        )}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300">
          <Bot className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold tracking-tight text-white">Agentic Studio</p>
            <p className="mt-0.5 truncate text-xs text-slate-500">Workflow Console</p>
          </div>
        )}
      </div>

      <nav className="mt-6 flex flex-1 flex-col gap-2">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.key}
              type="button"
              disabled={!isEnabledView(item.key)}
              onClick={() => {
                if (isEnabledView(item.key)) {
                  onChangeView(item.key)
                }
              }}
              className={cn(
                'group flex items-center rounded-2xl px-3 py-3 text-left text-sm transition-colors',
                collapsed ? 'justify-center' : 'justify-start gap-3',
                activeView === item.key
                  ? 'bg-blue-500/14 text-white shadow-[inset_0_0_0_1px_rgba(96,165,250,0.35)]'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
                !isEnabledView(item.key) && 'cursor-not-allowed opacity-45 hover:bg-transparent hover:text-slate-400',
              )}
              title={item.label}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                  {!isEnabledView(item.key) && (
                    <span className="rounded-full border border-white/8 bg-white/4 px-2 py-0.5 text-[10px] text-slate-500">
                      即将开放
                    </span>
                  )}
                </>
              )}
            </button>
          )
        })}
      </nav>

      <div className={cn('flex', collapsed ? 'justify-center' : 'justify-stretch')}>
        <Badge
          className={cn(
            'rounded-2xl border-blue-500/20 bg-[radial-gradient(circle_at_top,#2563eb33,transparent_55%),linear-gradient(180deg,#111a34_0%,#090f1f_100%)] text-blue-200',
            collapsed ? 'h-10 w-10 justify-center p-0' : 'h-11 w-full justify-start gap-2 px-3',
          )}
          title="AI 助手"
        >
          <span className="font-semibold">AI</span>
          {!collapsed && <span className="text-xs font-medium text-blue-100/80">助手在线</span>}
        </Badge>
      </div>
    </aside>
  )
}
