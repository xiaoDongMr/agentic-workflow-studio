import type { HTMLAttributes } from 'react'
import { PanelLeftClose, RefreshCw, SendHorizontal, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface AiAssistantPanelProps extends HTMLAttributes<HTMLDivElement> {
  onCollapse?: () => void
}

export function AiAssistantPanel({ className, onCollapse, ...props }: AiAssistantPanelProps) {
  const generatedSteps = [
    {
      title: '开始（StartInput）',
      items: ['功能：接收工作流输入消息。', '说明：根据需求补全输入 Schema，并将消息标准化。'],
    },
    {
      title: '意图识别（IntentAgent）',
      items: ['功能：识别用户是咨询、投诉还是订单查询。', '输出：intent（string）'],
    },
    {
      title: '知识检索（KnowledgeSearch）',
      items: ['功能：检索知识库与 FAQ。', '输出：knowledge_hits（array）'],
    },
    {
      title: '订单查询（OrderSkill）',
      items: ['功能：当命中订单场景时，调用订单查询技能。', '输出：order_info（json）'],
    },
    {
      title: '生成回复（ReplyAgent）',
      items: ['功能：整合知识库与技能结果，生成最终回复。', '输出：reply_content（string）'],
    },
  ]

  return (
    <section
      className={cn(
        'flex h-full flex-col overflow-hidden rounded-[28px] border border-white/8 bg-slate-950/92 shadow-[0_20px_60px_rgba(2,6,23,0.46)] backdrop-blur',
        className,
      )}
      {...props}
    >
      <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
        <div className="flex items-center gap-2">
          <p className="text-base font-semibold text-white">AI 助手</p>
          <span className="text-slate-500">·</span>
          <p className="text-xs font-medium text-slate-300">自动语言生成</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/6 hover:text-white"
            aria-label="重新生成"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onCollapse}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/6 hover:text-white"
            aria-label="收起 AI 助手"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">
          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 shadow-[0_8px_24px_rgba(59,130,246,0.12)]">
            <p className="text-xs leading-5 text-slate-100">
              采用意图主干、知识检索、订单技能与回复生成的组合流程，保证结构清晰且数据可追溯。
            </p>
            <div className="mt-2 flex items-center justify-end gap-2 text-xs text-slate-400">
              <span>10:30:35</span>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-blue-500/25 bg-blue-500/10 text-blue-200">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="flex-1 rounded-[22px] border border-white/8 bg-white/4 p-4">
              <p className="text-sm font-semibold text-white">已为您生成工作流</p>
              <div className="mt-4 space-y-4">
                {generatedSteps.map((step) => (
                  <div key={step.title}>
                    <p className="text-xs font-medium text-slate-100">{step.title}</p>
                    <ul className="mt-2 space-y-2 text-xs leading-5 text-slate-300">
                      {step.items.map((item) => (
                        <li key={item}>- {item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="mt-5">
                <Button size="sm">应用到画布</Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-white/8 px-4 py-4">
        <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-slate-950/85 px-4 py-3">
          <input
            type="text"
            readOnly
            value="在这里输入你的提示语，可对节点引用至对话"
            className="flex-1 bg-transparent text-xs text-slate-300 outline-none placeholder:text-slate-500"
          />
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500 text-white transition-colors hover:bg-blue-400"
            aria-label="发送"
          >
            <SendHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  )
}
