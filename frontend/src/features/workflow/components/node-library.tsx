import {
  Bot,
  Braces,
  ChevronDown,
  FileCode2,
  GitBranch,
  ImagePlus,
  MessageSquareCode,
  Play,
  Plus,
  Search,
  Settings2,
  Waypoints,
  Workflow,
} from 'lucide-react'
import { useMemo, useState, type HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

interface NodeLibraryProps extends HTMLAttributes<HTMLDivElement> {
  onAddNode?: (key: 'llm' | 'selector' | 'loop' | 'code' | 'end') => void
}

export function NodeLibrary({ className, onAddNode, ...props }: NodeLibraryProps) {
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')

  const sections = useMemo(
    () => [
      {
        title: '基础能力',
        items: [
          { title: '大模型', icon: Bot, nodeKey: 'llm' as const },
          { title: '选择器', icon: GitBranch, nodeKey: 'selector' as const },
          { title: '循环', icon: Waypoints, nodeKey: 'loop' as const },
          { title: '编码', icon: FileCode2, nodeKey: 'code' as const },
          { title: '结束', icon: Braces, nodeKey: 'end' as const },
        ],
      },
    ],
    [],
  )

  const filteredSections = useMemo(
    () =>
      sections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => item.title.toLowerCase().includes(keyword.toLowerCase())),
        }))
        .filter((section) => section.items.length > 0),
    [keyword, sections],
  )

  return (
    <section
      className={cn(
        'pointer-events-auto',
        className,
      )}
      {...props}
    >
      {open && (
        <div className="mb-3 w-[640px] max-w-full rounded-[24px] border border-slate-300/90 bg-white/96 p-4 shadow-[0_20px_40px_rgba(15,23,42,0.22)] backdrop-blur">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3">
            <Search className="h-4 w-4 text-slate-500" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索节点、插件、工作流"
              className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
            />
          </div>

          <div className="mt-4 max-h-[500px] space-y-5 overflow-y-auto pr-1">
            {filteredSections.map((section) => (
              <div key={section.title}>
                <p className="mb-3 text-sm font-semibold text-slate-500">{section.title}</p>
                <div className="grid gap-x-8 gap-y-3 md:grid-cols-2">
                  {section.items.map((item) => {
                    const Icon = item.icon

                    return (
                      <button
                        key={`${section.title}-${item.title}`}
                        type="button"
                        onClick={() => {
                          onAddNode?.(item.nodeKey)
                          setOpen(false)
                          setKeyword('')
                        }}
                        className="flex items-center gap-3 rounded-2xl px-1 py-1 text-left transition-colors hover:bg-slate-100"
                      >
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500 text-white">
                          <Icon className="h-4 w-4" />
                        </div>
                        <span className="text-sm font-medium text-slate-700">{item.title}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex w-fit max-w-full items-center gap-3 rounded-[20px] border border-white/10 bg-slate-950/92 px-3 py-2 shadow-[0_16px_32px_rgba(2,6,23,0.42)] backdrop-blur">
        <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-slate-300">
          <Search className="h-4 w-4" />
          <ChevronDown className="h-4 w-4" />
        </div>
        <button
          type="button"
          className="rounded-xl border border-white/8 bg-white px-4 py-2 text-sm font-medium text-slate-700"
        >
          100%
        </button>
        <div className="flex items-center gap-1 rounded-xl border border-white/8 bg-white/4 px-2 py-2 text-slate-300">
          <MessageSquareCode className="h-4 w-4" />
          <Workflow className="h-4 w-4" />
          <ImagePlus className="h-4 w-4" />
          <Settings2 className="h-4 w-4" />
        </div>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex items-center gap-2 rounded-2xl bg-indigo-100 px-5 py-2.5 text-sm font-semibold text-indigo-600 transition-colors hover:bg-indigo-200"
        >
          <Plus className="h-4 w-4" />
          添加节点
        </button>
        <button
          type="button"
          className="flex items-center gap-2 rounded-2xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-400"
        >
          <Play className="h-4 w-4 fill-white" />
          试运行
        </button>
      </div>
    </section>
  )
}
