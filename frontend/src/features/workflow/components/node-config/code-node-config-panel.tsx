import {
  Braces,
  CheckCircle2,
  FileCode2,
  Server,
  Settings2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  getWorkflowNodeCodeWorkspaceStatus,
  listWorkflowNodeCodeWorkspacePackages,
  openWorkflowNodeCodeWorkspace,
  restoreWorkflowNodeCodeWorkspacePackageVersion,
  saveWorkflowNodeCodeWorkspacePackage,
  type WorkflowCodePackageSummary,
  type WorkflowCodeWorkspace,
  type WorkflowCodeWorkspaceStatus,
} from '@/api/workflow'
import {
  BasicInfoSection,
  ConfigSection,
  ConfigShell,
  IOSection,
  SwitchRow,
  type NodeConfigPanelProps,
} from '@/features/workflow/components/node-config/config-fields'
import {
  BrowserWorkspaceDrawer,
  type BrowserWorkspaceViewMode,
} from '@/features/workflow/components/node-config/code-node/browser-workspace-drawer'
import { CodeEntryCard } from '@/features/workflow/components/node-config/code-node/code-entry-card'
import { CodeWorkspaceHistoryDrawer } from '@/features/workflow/components/node-config/code-node/code-workspace-history-drawer'
import {
  formatWorkspacePackageSaveResult,
  formatWorkspacePackageStatus,
} from '@/features/workflow/components/node-config/code-node/code-workspace-package-utils'
import {
  CodeCapabilitySwitch,
  CodeModeSwitch,
  CodeNodeSummary,
  SandboxBindingHint,
} from '@/features/workflow/components/node-config/code-node/code-node-ui'
import { CodeSnippetCard } from '@/features/workflow/components/node-config/code-node/code-snippet-card'
import { CodeSnippetDrawer } from '@/features/workflow/components/node-config/code-node/code-snippet-drawer'
import { CodeWorkspaceDrawer } from '@/features/workflow/components/node-config/code-node/code-workspace-drawer'
import {
  formatCodeFileName,
  formatCodeLanguage,
  buildBrowserPreviewUrl,
  getCodeWorkspaceOpenState,
  isBrowserCapableSandbox,
  isLegacyCodeResultOutput,
  resolveDefaultEntryFileName,
  resolveCodeAuthoringMode,
  resolveCodeFilePath,
  resolveCodeOutputKey,
  resolveCodeSnippet,
} from '@/features/workflow/components/node-config/code-node/code-node-utils'
import { ErrorStrategyConfig } from '@/features/workflow/components/node-config/error-strategy-config'
import { getAvailableInputSources } from '@/features/workflow/components/node-config/variable-utils'
import {
  DEFAULT_CODE_NODE_INPUTS,
  DEFAULT_CODE_NODE_OUTPUTS,
  DEFAULT_BROWSER_CODE_NODE_INPUTS,
  DEFAULT_BROWSER_CODE_NODE_OUTPUTS,
  DEFAULT_CODE_SNIPPET,
} from '@/features/workflow/code-node-defaults'
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
  validationResult,
}: NodeConfigPanelProps) {
  const inputSources = useMemo(() => getAvailableInputSources(node, nodes, edges), [edges, node, nodes])
  const codeSyncStatus = node.config.codeSyncStatus ?? 'saved'
  const codeCapability = node.config.codeCapability ?? 'python'
  const codeMode = codeCapability === 'browser' ? 'sandbox_file' : resolveCodeAuthoringMode(node.config.codeSource)
  const entryFunction = codeCapability === 'browser' ? 'main' : (node.config.codeEntryFunction ?? 'main')
  const defaultEntryFileName = resolveDefaultEntryFileName(codeCapability)
  const codeFilePath = resolveCodeFilePath(workflowId, node.id, node.config.codeFilePath, defaultEntryFileName)
  const codeFileName = formatCodeFileName(codeFilePath)
  const errorStrategy = node.config.errorStrategy ?? 'interrupt'
  const browserCapable = isBrowserCapableSandbox(sandbox)
  const browserPreviewUrl = buildBrowserPreviewUrl(sandbox?.sandboxUrl)
  const [openingMode, setOpeningMode] = useState<'drawer' | 'external' | null>(null)
  const [codeWorkspaceError, setCodeWorkspaceError] = useState('')
  const [codeWorkspace, setCodeWorkspace] = useState<WorkflowCodeWorkspace | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [browserWorkspaceView, setBrowserWorkspaceView] = useState<BrowserWorkspaceViewMode>('split')
  const [snippetDrawerOpen, setSnippetDrawerOpen] = useState(false)
  const [copiedPath, setCopiedPath] = useState(false)
  const [workspacePackageStatus, setWorkspacePackageStatus] = useState<WorkflowCodeWorkspaceStatus | null>(null)
  const [workspacePackageMessage, setWorkspacePackageMessage] = useState('')
  const [packageSaving, setPackageSaving] = useState(false)
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false)
  const [workspacePackages, setWorkspacePackages] = useState<WorkflowCodePackageSummary[]>([])
  const [restoringPackageId, setRestoringPackageId] = useState('')
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
  const canOpenWorkspace = openState.canOpen && openingMode === null
  const canOpenBrowserWorkspace = canOpenWorkspace && Boolean(browserPreviewUrl)

  const refreshWorkspacePackageStatus = useCallback(async () => {
    if (!workflowSaved || !workflowId || codeMode !== 'sandbox_file') {
      setWorkspacePackageStatus(null)
      return
    }
    try {
      const status = await getWorkflowNodeCodeWorkspaceStatus(workflowId, node.id)
      setWorkspacePackageStatus(status)
      setWorkspacePackageMessage(formatWorkspacePackageStatus(status))
    } catch {
      setWorkspacePackageStatus(null)
    }
  }, [codeMode, node.id, workflowId, workflowSaved])

  const refreshWorkspacePackages = useCallback(async () => {
    if (!workflowSaved || !workflowId || codeMode !== 'sandbox_file') {
      setWorkspacePackages([])
      return
    }
    try {
      const packages = await listWorkflowNodeCodeWorkspacePackages(workflowId, node.id, 20)
      setWorkspacePackages(packages)
    } catch {
      setWorkspacePackages([])
    }
  }, [codeMode, node.id, workflowId, workflowSaved])

  useEffect(() => {
    void refreshWorkspacePackageStatus()
  }, [refreshWorkspacePackageStatus])

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
        entryFunction,
        codeCapability,
      )
      const shouldUseBrowserOutputs = codeCapability === 'browser'
      const shouldMigrateLegacyOutput = isLegacyCodeResultOutput(node.outputs)
      const nextOutputs = shouldUseBrowserOutputs
        ? DEFAULT_BROWSER_CODE_NODE_OUTPUTS
        : shouldMigrateLegacyOutput
          ? DEFAULT_CODE_NODE_OUTPUTS
          : node.outputs
      onUpdateNode({
        inputs: shouldUseBrowserOutputs ? DEFAULT_BROWSER_CODE_NODE_INPUTS : node.inputs,
        outputs: nextOutputs,
        config: {
          codeFilePath: workspace.entryFilePath,
          codeSource: 'sandbox_file',
          codeCapability,
          codeSyncStatus: 'saved',
          outputKey: resolveCodeOutputKey(nextOutputs),
        },
      })
      setCodeWorkspace(workspace)
      return workspace
    } catch (error) {
      setCodeWorkspaceError(getErrorMessage(error, '打开沙箱 Code 失败'))
      return null
    }
  }, [codeCapability, entryFunction, node.id, node.inputs, node.outputs, onUpdateNode, openState, workflowId])

  const openCodeWorkspaceDrawer = useCallback(async () => {
    setOpeningMode('drawer')
    try {
      const workspace = await prepareCodeWorkspace()
      if (workspace) {
        setBrowserWorkspaceView('split')
        setDrawerOpen(true)
      }
    } finally {
      setOpeningMode(null)
    }
  }, [prepareCodeWorkspace])

  const openBrowserWorkspace = useCallback(async (viewMode: BrowserWorkspaceViewMode) => {
    setOpeningMode('drawer')
    try {
      const workspace = await prepareCodeWorkspace()
      if (workspace) {
        setBrowserWorkspaceView(viewMode)
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

  const saveWorkspacePackage = useCallback(async () => {
    if (!workflowId || !canOpenWorkspace) {
      setWorkspacePackageMessage(openState.message)
      return
    }
    setPackageSaving(true)
    setWorkspacePackageMessage('正在保存代码工作区')
    try {
      const result = await saveWorkflowNodeCodeWorkspacePackage(workflowId, node.id, {
        codeCapability,
        entryFile: codeFileName,
      })
      setWorkspacePackageMessage(formatWorkspacePackageSaveResult(result))
      await refreshWorkspacePackageStatus()
      await refreshWorkspacePackages()
    } catch (error) {
      setWorkspacePackageMessage(getErrorMessage(error, '保存代码工作区失败'))
    } finally {
      setPackageSaving(false)
    }
  }, [
    canOpenWorkspace,
    codeCapability,
    codeFileName,
    node.id,
    openState.message,
    refreshWorkspacePackageStatus,
    refreshWorkspacePackages,
    workflowId,
  ])

  const openPackageHistory = useCallback(async () => {
    setHistoryDrawerOpen(true)
    await refreshWorkspacePackages()
  }, [refreshWorkspacePackages])

  const restoreWorkspacePackageVersion = useCallback(async (packageId: string) => {
    if (!workflowId || !canOpenWorkspace) {
      setWorkspacePackageMessage(openState.message)
      return
    }
    setRestoringPackageId(packageId)
    setWorkspacePackageMessage('正在恢复历史版本到沙箱')
    try {
      const result = await restoreWorkflowNodeCodeWorkspacePackageVersion(workflowId, node.id, packageId, {
        codeCapability,
      })
      setWorkspacePackageMessage(result.message || (result.restored ? '历史版本已恢复' : '历史版本恢复失败'))
      if (result.restored) {
        await prepareCodeWorkspace()
      }
      await refreshWorkspacePackageStatus()
      await refreshWorkspacePackages()
    } catch (error) {
      setWorkspacePackageMessage(getErrorMessage(error, '恢复历史版本失败'))
    } finally {
      setRestoringPackageId('')
    }
  }, [
    canOpenWorkspace,
    codeCapability,
    node.id,
    openState.message,
    prepareCodeWorkspace,
    refreshWorkspacePackageStatus,
    refreshWorkspacePackages,
    workflowId,
  ])

  const inputIssues = validationResult?.issues.filter((issue) => issue.scope === 'input' || issue.scope === 'inputMapping') ?? []
  const outputIssues = validationResult?.issues.filter((issue) => issue.scope === 'output' || issue.fieldPath?.startsWith('config.')) ?? []

  return (
    <ConfigShell node={node} className={className} validationResult={validationResult}>
      <CodeNodeSummary
        codeMode={codeMode}
        capability={codeCapability}
        entryFunction={entryFunction}
        fileName={codeFileName}
        filePath={codeMode === 'sandbox_file' ? codeFilePath : ''}
        syncStatus={codeSyncStatus}
      />

      <BasicInfoSection node={node} onUpdateNode={onUpdateNode} />

      <ConfigSection title="执行能力" icon={<Settings2 className="h-4 w-4 text-sky-300" />}>
        <CodeCapabilitySwitch
          value={codeCapability}
          onChange={(value) => {
            if (value === 'browser') {
              onUpdateNode({
                inputs: DEFAULT_BROWSER_CODE_NODE_INPUTS,
                outputs: DEFAULT_BROWSER_CODE_NODE_OUTPUTS,
                config: {
                  codeCapability: 'browser',
                  codeSource: 'sandbox_file',
                  codeFilePath: '',
                  codeEntryFunction: 'main',
                  outputKey: resolveCodeOutputKey(DEFAULT_BROWSER_CODE_NODE_OUTPUTS),
                  codeSyncStatus: 'saved',
                },
              })
              return
            }
            onUpdateNode({
              inputs: DEFAULT_CODE_NODE_INPUTS,
              outputs: DEFAULT_CODE_NODE_OUTPUTS,
              config: {
                codeCapability: 'python',
                codeSource: 'sandbox_snippet',
                codeFilePath: '',
                prompt: !(node.config.prompt ?? '').trim() ? DEFAULT_CODE_SNIPPET : node.config.prompt,
                outputKey: resolveCodeOutputKey(DEFAULT_CODE_NODE_OUTPUTS),
                codeSyncStatus: 'saved',
              },
            })
          }}
        />
      </ConfigSection>

      <ConfigSection
        title={codeCapability === 'browser' ? '浏览器工作台' : '代码入口'}
        icon={<FileCode2 className="h-4 w-4 text-emerald-300" />}
      >
        {codeCapability === 'python' ? (
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
        ) : null}
        {codeMode === 'sandbox_file' ? (
          <CodeEntryCard
            entryFunction={entryFunction}
            fileName={codeFileName}
            filePath={codeFilePath}
            language={formatCodeLanguage(node.config.codeLanguage)}
            openMessage={openState.message}
            syncStatus={codeSyncStatus}
            copiedPath={copiedPath}
            workspaceError={codeWorkspaceError}
            browserCapable={browserCapable}
            browserMode={codeCapability === 'browser'}
            browserPreviewMessage={browserPreviewUrl ? '预览地址使用 /vnc/index.html?autoconnect=true' : openState.message}
            packageMessage={workspacePackageMessage || formatWorkspacePackageStatus(workspacePackageStatus)}
            packageFileCount={workspacePackageStatus?.fileCount ?? 0}
            packageSavedAt={workspacePackageStatus?.savedAt ?? null}
            packageTotalSize={workspacePackageStatus?.totalSize ?? 0}
            packageSaving={packageSaving}
            onEntryFunctionChange={(value) => onUpdateNode({ config: { codeEntryFunction: value } })}
            onCopyPath={copyCodePath}
            onOpenBrowserOnly={
              codeCapability === 'browser'
                ? () => openBrowserWorkspace('browser')
                : undefined
            }
            onOpenCode={
              codeCapability === 'browser'
                ? () => openBrowserWorkspace('split')
                : openCodeWorkspaceDrawer
            }
            onOpenExternal={openCodeWorkspaceExternal}
            onOpenHistory={openPackageHistory}
            onSaveWorkspace={saveWorkspacePackage}
            canOpenCode={codeCapability === 'browser' ? canOpenBrowserWorkspace : canOpenWorkspace}
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
          validationIssues={inputIssues}
        />
      </ConfigSection>

      <ConfigSection title="输出变量" icon={<Braces className="h-4 w-4 text-violet-300" />}>
        <IOSection
          title=""
          emptyLabel="输出变量"
          items={node.outputs}
          onChange={(items) => onUpdateNode({ outputs: items, config: { outputKey: resolveCodeOutputKey(items) } })}
          validationIssues={outputIssues}
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
        codeCapability === 'browser' && browserPreviewUrl ? (
          <BrowserWorkspaceDrawer
            workspace={codeWorkspace}
            previewUrl={browserPreviewUrl}
            initialView={browserWorkspaceView}
            onClose={() => setDrawerOpen(false)}
          />
        ) : (
          <CodeWorkspaceDrawer
            workspace={codeWorkspace}
            onClose={() => setDrawerOpen(false)}
            onOpenExternal={() => window.open(codeWorkspace.codeUrl, '_blank', 'noopener,noreferrer')}
          />
        )
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
      {historyDrawerOpen ? (
        <CodeWorkspaceHistoryDrawer
          packages={workspacePackages}
          restoringPackageId={restoringPackageId}
          onClose={() => setHistoryDrawerOpen(false)}
          onRestore={restoreWorkspacePackageVersion}
        />
      ) : null}
    </ConfigShell>
  )
}
