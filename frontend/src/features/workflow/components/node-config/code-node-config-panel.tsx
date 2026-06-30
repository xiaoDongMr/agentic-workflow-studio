import {
  Braces,
  CheckCircle2,
  FileCode2,
  Server,
  Settings2,
} from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'

import { openWorkflowNodeCodeWorkspace, type WorkflowCodeWorkspace } from '@/api/workflow'
import {
  BasicInfoSection,
  ConfigSection,
  ConfigShell,
  IOSection,
  SwitchRow,
  type NodeConfigPanelProps,
} from '@/features/workflow/components/node-config/config-fields'
import { CodeEntryCard } from '@/features/workflow/components/node-config/code-node/code-entry-card'
import { CodeModeSwitch, CodeNodeSummary, SandboxBindingHint } from '@/features/workflow/components/node-config/code-node/code-node-ui'
import { CodeSnippetCard } from '@/features/workflow/components/node-config/code-node/code-snippet-card'
import { CodeSnippetDrawer } from '@/features/workflow/components/node-config/code-node/code-snippet-drawer'
import { CodeWorkspaceDrawer } from '@/features/workflow/components/node-config/code-node/code-workspace-drawer'
import {
  formatCodeFileName,
  formatCodeLanguage,
  getCodeWorkspaceOpenState,
  resolveCodeAuthoringMode,
  resolveCodeFilePath,
  resolveCodeOutputKey,
  resolveCodeSnippet,
} from '@/features/workflow/components/node-config/code-node/code-node-utils'
import { ErrorStrategyConfig } from '@/features/workflow/components/node-config/error-strategy-config'
import { getAvailableInputSources } from '@/features/workflow/components/node-config/variable-utils'
import { DEFAULT_CODE_SNIPPET } from '@/features/workflow/code-node-defaults'
import { getErrorMessage } from '@/features/workflow/utils/error-message'

export function CodeNodeConfigPanel({
  node,
  nodes,
  edges,
  onUpdateNode,
  sandbox,
  sandboxSession,
  workflowId = '',
  workflowSaved = false,
  className,
}: NodeConfigPanelProps) {
  const inputSources = useMemo(() => getAvailableInputSources(node, nodes, edges), [edges, node, nodes])
  const codeSyncStatus = node.config.codeSyncStatus ?? 'saved'
  const codeMode = resolveCodeAuthoringMode(node.config.codeSource)
  const codeFilePath = resolveCodeFilePath(workflowId, node.id, node.config.codeFilePath)
  const codeFileName = formatCodeFileName(codeFilePath)
  const errorStrategy = node.config.errorStrategy ?? 'interrupt'
  const [openingMode, setOpeningMode] = useState<'drawer' | 'external' | null>(null)
  const [codeWorkspaceError, setCodeWorkspaceError] = useState('')
  const [codeWorkspace, setCodeWorkspace] = useState<WorkflowCodeWorkspace | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [snippetDrawerOpen, setSnippetDrawerOpen] = useState(false)
  const [copiedPath, setCopiedPath] = useState(false)
  const openState = useMemo(
    () =>
      getCodeWorkspaceOpenState({
        sandbox,
        sandboxSession,
        workflowId,
        workflowSaved,
      }),
    [sandbox, sandboxSession, workflowId, workflowSaved],
  )

  const prepareCodeWorkspace = useCallback(async () => {
    if (!openState.canOpen) {
      setCodeWorkspaceError(openState.message)
      return null
    }
    setCodeWorkspaceError('')
    try {
      const workspace = await openWorkflowNodeCodeWorkspace(
        workflowId,
        node.id,
        node.config.codeEntryFunction ?? 'main',
      )
      onUpdateNode({
        config: {
          codeFilePath: workspace.entryFilePath,
          codeSource: 'sandbox_file',
          codeSyncStatus: 'saved',
        },
      })
      setCodeWorkspace(workspace)
      return workspace
    } catch (error) {
      setCodeWorkspaceError(getErrorMessage(error, '打开沙箱 Code 失败'))
      return null
    }
  }, [node.config.codeEntryFunction, node.id, onUpdateNode, openState, workflowId])

  const openCodeWorkspaceDrawer = useCallback(async () => {
    setOpeningMode('drawer')
    try {
      const workspace = await prepareCodeWorkspace()
      if (workspace) {
        setDrawerOpen(true)
      }
    } finally {
      setOpeningMode(null)
    }
  }, [prepareCodeWorkspace])

  const openCodeWorkspaceExternal = useCallback(async () => {
    setOpeningMode('external')
    try {
      const workspace = await prepareCodeWorkspace()
      if (workspace) {
        window.open(workspace.codeUrl, '_blank', 'noopener,noreferrer')
      }
    } finally {
      setOpeningMode(null)
    }
  }, [prepareCodeWorkspace])

  const copyCodePath = useCallback(async () => {
    const path = codeFilePath
    try {
      await navigator.clipboard.writeText(path)
      setCopiedPath(true)
      window.setTimeout(() => setCopiedPath(false), 1600)
    } catch {
      setCopiedPath(false)
    }
  }, [codeFilePath])

  return (
    <ConfigShell node={node} className={className}>
      <CodeNodeSummary
        codeMode={codeMode}
        entryFunction={node.config.codeEntryFunction ?? 'main'}
        fileName={codeFileName}
        filePath={codeMode === 'sandbox_file' ? codeFilePath : ''}
        syncStatus={codeSyncStatus}
      />

      <BasicInfoSection node={node} onUpdateNode={onUpdateNode} />

      <ConfigSection title="代码入口" icon={<FileCode2 className="h-4 w-4 text-emerald-300" />}>
        <CodeModeSwitch
          value={codeMode}
          onChange={(value) =>
            onUpdateNode({
              config: {
                codeSource: value,
                prompt:
                  value === 'sandbox_snippet' && !(node.config.prompt ?? '').trim()
                    ? DEFAULT_CODE_SNIPPET
                    : node.config.prompt,
                codeSyncStatus: 'saved',
              },
            })
          }
        />
        {codeMode === 'sandbox_file' ? (
          <CodeEntryCard
            entryFunction={node.config.codeEntryFunction ?? 'main'}
            fileName={codeFileName}
            filePath={codeFilePath}
            language={formatCodeLanguage(node.config.codeLanguage)}
            openMessage={openState.message}
            syncStatus={codeSyncStatus}
            copiedPath={copiedPath}
            workspaceError={codeWorkspaceError}
            onEntryFunctionChange={(value) => onUpdateNode({ config: { codeEntryFunction: value } })}
            onCopyPath={copyCodePath}
            onOpenCode={openCodeWorkspaceDrawer}
            onOpenExternal={openCodeWorkspaceExternal}
            canOpenCode={openState.canOpen && openingMode === null}
            openingMode={openingMode}
          />
        ) : (
          <CodeSnippetCard
            code={resolveCodeSnippet(node.config.prompt)}
            language={formatCodeLanguage(node.config.codeLanguage)}
            sandboxMessage={openState.canOpen ? '运行时会在当前调试沙箱中执行脚本片段。' : openState.message}
            onExpand={() => setSnippetDrawerOpen(true)}
            onChange={(value) =>
              onUpdateNode({
                config: {
                  prompt: value,
                  codeSource: 'sandbox_snippet',
                  codeSyncStatus: 'saved',
                },
              })
            }
          />
        )}
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
      {drawerOpen && codeWorkspace ? (
        <CodeWorkspaceDrawer
          workspace={codeWorkspace}
          onClose={() => setDrawerOpen(false)}
          onOpenExternal={() => window.open(codeWorkspace.codeUrl, '_blank', 'noopener,noreferrer')}
        />
      ) : null}
      {snippetDrawerOpen ? (
        <CodeSnippetDrawer
          code={resolveCodeSnippet(node.config.prompt)}
          onClose={() => setSnippetDrawerOpen(false)}
          onChange={(value) =>
            onUpdateNode({
              config: {
                prompt: value,
                codeSource: 'sandbox_snippet',
                codeSyncStatus: 'saved',
              },
            })
          }
        />
      ) : null}
    </ConfigShell>
  )
}
