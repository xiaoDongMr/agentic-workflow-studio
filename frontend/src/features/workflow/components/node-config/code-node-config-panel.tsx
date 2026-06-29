import { AlertCircle, Braces, CheckCircle2, Clock3, FileCode2, Server, Settings2 } from 'lucide-react'
import { useMemo } from 'react'

import {
  BasicInfoSection,
  ConfigSection,
  ConfigShell,
  EditableField,
  IOSection,
  SwitchRow,
  type NodeConfigPanelProps,
} from '@/features/workflow/components/node-config/config-fields'
import { ErrorStrategyConfig } from '@/features/workflow/components/node-config/error-strategy-config'
import { getAvailableInputSources } from '@/features/workflow/components/node-config/variable-utils'
import { cn } from '@/lib/utils'
import type { WorkflowNodeConfig } from '@/types/workflow'

const CODE_SYNC_STATUS_LABELS: Record<NonNullable<WorkflowNodeConfig['codeSyncStatus']>, string> = {
  dirty: '待同步',
  failed: '同步失败',
  saved: '已同步',
  saving: '同步中',
}

export function CodeNodeConfigPanel({
  node,
  nodes,
  edges,
  onUpdateNode,
  className,
}: NodeConfigPanelProps) {
  const inputSources = useMemo(() => getAvailableInputSources(node, nodes, edges), [edges, node, nodes])
  const codeSyncStatus = node.config.codeSyncStatus ?? 'saved'
  const errorStrategy = node.config.errorStrategy ?? 'interrupt'

  return (
    <ConfigShell node={node} className={className}>
      <CodeNodeSummary
        entryFunction={node.config.codeEntryFunction ?? 'main'}
        filePath={node.config.codeFilePath ?? '/workspace/code/main.py'}
        syncStatus={codeSyncStatus}
      />

      <BasicInfoSection node={node} onUpdateNode={onUpdateNode} />

      <ConfigSection title="代码入口" icon={<FileCode2 className="h-4 w-4 text-emerald-300" />}>
        <CodeEntryCard
          entryFunction={node.config.codeEntryFunction ?? 'main'}
          filePath={node.config.codeFilePath ?? '/workspace/code/main.py'}
          language={formatCodeLanguage(node.config.codeLanguage)}
          syncStatus={codeSyncStatus}
          onEntryFunctionChange={(value) => onUpdateNode({ config: { codeEntryFunction: value } })}
          onFilePathChange={(value) => onUpdateNode({ config: { codeFilePath: value } })}
        />
      </ConfigSection>

      <ConfigSection title="输入变量" icon={<Braces className="h-4 w-4 text-blue-300" />}>
        <IOSection
          title=""
          emptyLabel="输入变量"
          items={node.inputs}
          sourceOptions={inputSources}
          inputMappings={node.config.inputMappings}
          onChange={(items) => onUpdateNode({ inputs: items })}
          onInputMappingsChange={(inputMappings) => onUpdateNode({ config: { inputMappings } })}
        />
      </ConfigSection>

      <ConfigSection title="输出变量" icon={<Braces className="h-4 w-4 text-violet-300" />}>
        <IOSection
          title=""
          emptyLabel="输出变量"
          items={node.outputs}
          onChange={(items) => onUpdateNode({ outputs: items, config: { outputKey: resolveCodeOutputKey(items) } })}
        />
      </ConfigSection>

      <ConfigSection title="运行设置" icon={<Settings2 className="h-4 w-4 text-amber-300" />}>
        <SwitchRow
          label="启用节点"
          checked={node.config.enabled}
          onChange={(checked) => onUpdateNode({ config: { enabled: checked } })}
        />
        <ErrorStrategyConfig
          errorStrategy={errorStrategy}
          fallbackOutput={node.config.fallbackOutput ?? ''}
          retryCount={node.config.retryCount ?? 1}
          timeoutSeconds={node.config.timeoutSeconds ?? 180}
          showTimeout
          onChange={(patch) => onUpdateNode({ config: patch })}
        />
      </ConfigSection>

      <ConfigSection title="调试沙箱" icon={<Server className="h-4 w-4 text-emerald-300" />}>
        <SandboxBindingHint syncStatus={codeSyncStatus} />
        <div className="flex items-start gap-2 rounded-xl border border-emerald-300/14 bg-emerald-400/[0.06] px-3 py-2.5">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-200" />
          <div>
            <p className="text-xs text-white">运行前检查沙箱状态</p>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              单节点或全局调试时，编码节点会依赖当前 workflow 已绑定的调试沙箱。
            </p>
          </div>
        </div>
      </ConfigSection>
    </ConfigShell>
  )
}

function CodeNodeSummary({
  entryFunction,
  filePath,
  syncStatus,
}: {
  entryFunction: string
  filePath: string
  syncStatus: NonNullable<WorkflowNodeConfig['codeSyncStatus']>
}) {
  return (
    <div className="rounded-[20px] border border-emerald-300/14 bg-[radial-gradient(circle_at_12%_0%,rgba(16,185,129,0.16),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.78),rgba(2,6,23,0.72))] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Python 代码执行</p>
          <p className="mt-1 truncate font-mono text-[11px] text-emerald-100/70" title={filePath}>
            {filePath}
          </p>
        </div>
        <StatusPill status={syncStatus} />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <SummaryTile label="代码来源" value="沙箱文件" />
        <SummaryTile label="入口函数" value={entryFunction || 'main'} />
        <SummaryTile label="运行环境" value="调试沙箱" />
      </div>
    </div>
  )
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/8 bg-slate-950/48 px-2.5 py-2">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="mt-1 truncate text-[11px] font-semibold text-slate-100" title={value}>
        {value}
      </p>
    </div>
  )
}

function CodeEntryCard({
  entryFunction,
  filePath,
  language,
  syncStatus,
  onEntryFunctionChange,
  onFilePathChange,
}: {
  entryFunction: string
  filePath: string
  language: string
  syncStatus: NonNullable<WorkflowNodeConfig['codeSyncStatus']>
  onEntryFunctionChange: (value: string) => void
  onFilePathChange: (value: string) => void
}) {
  return (
    <div className="rounded-2xl border border-emerald-300/14 bg-[linear-gradient(135deg,rgba(16,185,129,0.08),rgba(15,23,42,0.72))] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-emerald-50">沙箱文件入口</p>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">代码统一在调试沙箱 code 环境中编辑与同步。</p>
        </div>
        <StatusPill status={syncStatus} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <CodeMetaBadge label="语言" value={language} />
        <CodeMetaBadge label="来源" value="沙箱文件" />
      </div>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-[1.35fr_0.65fr]">
        <EditableField
          label="入口文件"
          value={filePath}
          placeholder="/workspace/code/main.py"
          onChange={onFilePathChange}
        />
        <EditableField
          label="入口函数"
          value={entryFunction}
          placeholder="main"
          onChange={onEntryFunctionChange}
        />
      </div>
    </div>
  )
}

function CodeMetaBadge({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/8 bg-slate-950/52 px-2 py-1 text-[10px] text-slate-400">
      {label}
      <span className="text-[11px] font-semibold text-emerald-100">{value}</span>
    </span>
  )
}

function SandboxBindingHint({ syncStatus }: { syncStatus: NonNullable<WorkflowNodeConfig['codeSyncStatus']> }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/56 p-3">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white">使用当前 workflow 绑定的调试沙箱</p>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">
            如未绑定、沙箱未运行或已过期，请先在顶部“沙箱”菜单创建或关联可用沙箱。
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-slate-950/70 px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
          <Clock3 className="h-3.5 w-3.5" />
          代码同步状态
        </span>
        <StatusPill status={syncStatus} />
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: NonNullable<WorkflowNodeConfig['codeSyncStatus']> }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-xl border px-2 py-1 text-[10px] font-semibold',
        status === 'saved' && 'border-emerald-300/18 bg-emerald-400/10 text-emerald-100',
        status === 'dirty' && 'border-amber-300/18 bg-amber-400/10 text-amber-100',
        status === 'saving' && 'border-sky-300/18 bg-sky-400/10 text-sky-100',
        status === 'failed' && 'border-rose-300/18 bg-rose-400/10 text-rose-100',
      )}
    >
      {CODE_SYNC_STATUS_LABELS[status]}
    </span>
  )
}

function formatCodeLanguage(language?: WorkflowNodeConfig['codeLanguage']) {
  if (language === 'python' || !language) {
    return 'Python'
  }
  return language
}

function resolveCodeOutputKey(outputs: Array<{ name: string }>) {
  return outputs.find((output) => output.name.trim())?.name.trim() || 'code_result'
}
