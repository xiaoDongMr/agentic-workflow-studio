import { CheckCircle2, FileCode2, Maximize2 } from 'lucide-react'

import { PythonCodeEditor } from './python-code-editor'

interface CodeSnippetCardProps {
  code: string
  language: string
  sandboxMessage: string
  onExpand: () => void
  onChange: (value: string) => void
}

export function CodeSnippetCard({
  code,
  language,
  sandboxMessage,
  onExpand,
  onChange,
}: CodeSnippetCardProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-sky-300/14 bg-slate-950/50">
      <div className="flex items-center justify-between gap-3 border-b border-white/8 bg-[linear-gradient(135deg,rgba(14,165,233,0.08),rgba(15,23,42,0.66))] px-3 py-2.5">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-50">
            <FileCode2 className="h-3.5 w-3.5 text-sky-200" />
            脚本内容
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-lg border border-white/8 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-sky-100">
            {language}
          </span>
          <span className="rounded-lg border border-white/8 bg-white/[0.04] px-2 py-1 text-[10px] text-slate-400">
            {code.length} 字符
          </span>
          <button
            type="button"
            onClick={onExpand}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.04] px-2 text-[11px] text-slate-300 transition hover:border-sky-300/24 hover:text-sky-100"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            放大
          </button>
        </div>
      </div>

      <PythonCodeEditor value={code} onChange={onChange} minHeight={300} />

      <div className="flex items-center gap-2 border-t border-white/8 bg-slate-950/72 px-3 py-2">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-sky-200" />
        <p className="truncate text-[11px] text-slate-500">{sandboxMessage}</p>
      </div>
    </div>
  )
}
