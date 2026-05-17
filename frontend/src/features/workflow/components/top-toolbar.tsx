import { MonitorPlay, MoreHorizontal, Play, Rocket, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface TopToolbarProps {
  activeTab: 'visual' | 'code' | 'logs'
  onChangeTab: (tab: TopToolbarProps['activeTab']) => void
}

const tabs = [
  { key: 'visual', label: '可视化画布' },
  { key: 'code', label: '代码视图' },
  { key: 'logs', label: '运行日志' },
] as const

export function TopToolbar({ activeTab, onChangeTab }: TopToolbarProps) {
  return (
    <header className="flex flex-col gap-4 border-b border-white/8 bg-slate-950/60 px-4 py-4 backdrop-blur lg:px-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-white">智能客服自动处理流程</h1>
            <Badge className="border-emerald-400/20 bg-emerald-500/10 text-emerald-200">
              运行中
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            当前为基础框架版本，已预留请求层、状态层、节点画布容器与配置面板。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-white/8 bg-white/4 px-3 py-2 text-xs text-slate-300">
            <ShieldCheck className="h-4 w-4 text-emerald-300" />
            草稿中
          </div>
          <Button variant="secondary" size="sm">
            <Rocket className="mr-2 h-4 w-4" />
            调试
          </Button>
          <Button size="sm">
            <Play className="mr-2 h-4 w-4" />
            运行
          </Button>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="inline-flex rounded-2xl border border-white/8 bg-white/4 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChangeTab(tab.key)}
              className={cn(
                'rounded-xl px-4 py-2 text-sm transition-colors',
                activeTab === tab.key
                  ? 'bg-blue-500 text-white shadow-[0_8px_20px_rgba(59,130,246,0.24)]'
                  : 'text-slate-400 hover:text-slate-200',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 rounded-2xl border border-white/8 bg-white/4 px-3 py-2 text-xs text-slate-300">
          <MonitorPlay className="h-4 w-4 text-blue-300" />
          FlowGram.AI 接入位
        </div>
      </div>
    </header>
  )
}
