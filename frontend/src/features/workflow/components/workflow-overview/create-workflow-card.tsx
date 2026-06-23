import { Plus } from 'lucide-react'

export function CreateWorkflowCard({ onCreateWorkflow }: { onCreateWorkflow: () => void }) {
  return (
    <button
      type="button"
      onClick={onCreateWorkflow}
      className="group flex min-h-[260px] flex-col overflow-hidden rounded-[24px] border border-dashed border-blue-300/24 bg-blue-400/[0.055] text-left transition hover:border-blue-300/44 hover:bg-blue-400/[0.09] hover:shadow-[0_22px_70px_rgba(37,99,235,0.16)]"
    >
      <CreateWorkflowPreview />
      <div className="mt-auto p-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-lg font-semibold tracking-tight text-white">新建项目</p>
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-blue-300/22 bg-blue-400/14 text-blue-100 transition group-hover:scale-105">
            <Plus className="h-4 w-4" />
          </span>
        </div>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-400">
          创建一个只包含开始节点的新工作流，进入画布后继续添加大模型、选择器、循环和代码节点。
        </p>
      </div>
    </button>
  )
}

function CreateWorkflowPreview() {
  return (
    <div className="relative h-[120px] overflow-hidden border-b border-white/8 bg-[radial-gradient(circle_at_22%_18%,rgba(96,165,250,0.22),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(30,41,59,0.72))]">
      <div className="absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(255,255,255,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.18)_1px,transparent_1px)] [background-size:28px_28px]" />
      <svg className="relative h-full w-full" viewBox="0 0 640 300" role="img" aria-label="新建工作流缩略图">
        <path
          d="M138,150 C210,150 240,96 310,96 C376,96 410,150 488,150"
          fill="none"
          stroke="#60a5fa"
          strokeDasharray="10 12"
          strokeLinecap="round"
          strokeWidth="4"
          opacity="0.5"
        />
        <rect x="70" y="124" width="116" height="54" rx="18" fill="#0f2f4f" stroke="#38bdf8" strokeOpacity="0.55" strokeWidth="2" />
        <rect x="262" y="70" width="116" height="54" rx="18" fill="#1e1b4b" stroke="#a78bfa" strokeOpacity="0.38" strokeWidth="2" strokeDasharray="7 7" />
        <rect x="454" y="124" width="116" height="54" rx="18" fill="#172554" stroke="#60a5fa" strokeOpacity="0.34" strokeWidth="2" strokeDasharray="7 7" />
        <circle cx="128" cy="151" r="8" fill="#38bdf8" opacity="0.9" />
        <circle cx="320" cy="97" r="8" fill="#a78bfa" opacity="0.72" />
        <circle cx="512" cy="151" r="8" fill="#60a5fa" opacity="0.72" />
      </svg>
      <div className="absolute left-4 top-4 rounded-full border border-blue-300/18 bg-blue-400/12 px-3 py-1 text-xs font-medium text-blue-100 backdrop-blur">
        Blank Workflow
      </div>
    </div>
  )
}
