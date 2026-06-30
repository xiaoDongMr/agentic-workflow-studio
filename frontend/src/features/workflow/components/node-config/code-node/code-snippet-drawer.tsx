import { FileCode2, X } from 'lucide-react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'

import { CodeMetaBadge } from './code-node-ui'
import { PythonCodeEditor } from './python-code-editor'

interface CodeSnippetDrawerProps {
  code: string
  onClose: () => void
  onChange: (value: string) => void
}

export function CodeSnippetDrawer({ code, onClose, onChange }: CodeSnippetDrawerProps) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[125] flex bg-slate-950/76 p-3 text-slate-100 backdrop-blur-md">
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-white/10 bg-slate-950 shadow-[0_28px_96px_rgba(2,6,23,0.62)]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/8 bg-[linear-gradient(135deg,rgba(14,165,233,0.14),rgba(15,23,42,0.96))] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-sky-300/18 bg-sky-400/10 text-sky-100">
              <FileCode2 className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">脚本片段编辑</p>
              <p className="mt-1 text-[11px] text-slate-500">使用 args.params 获取输入，return ret 输出结果。</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <CodeMetaBadge label="Python" value={`${code.length} 字符`} />
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-slate-900/80 text-slate-300 transition hover:border-rose-300/28 hover:text-white"
              aria-label="关闭脚本片段编辑"
              title="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 bg-slate-950 p-3">
          <div className="h-full overflow-hidden rounded-2xl border border-white/8 bg-slate-950/72">
            <PythonCodeEditor value={code} onChange={onChange} fill />
          </div>
        </div>
      </section>
    </div>,
    document.body,
  )
}
