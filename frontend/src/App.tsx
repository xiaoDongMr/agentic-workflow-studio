import { useMemo, useState } from 'react'
import {
  LoaderCircle,
  PanelLeftOpen,
  Sparkles,
  X,
} from 'lucide-react'

import { AiAssistantPanel } from '@/features/workflow/components/ai-assistant-panel'
import { NavigationSidebar } from '@/features/workflow/components/navigation-sidebar'
import { NodeConfigPanel } from '@/features/workflow/components/node-config-panel'
import { UnsavedWorkflowDialog } from '@/features/workflow/components/unsaved-workflow-dialog'
import { WorkflowCanvas } from '@/features/workflow/components/workflow-canvas'
import { WorkflowEditorHeader } from '@/features/workflow/components/workflow-editor-header'
import { WorkflowOverview } from '@/features/workflow/components/workflow-overview'
import { useWorkflowSandboxSession } from '@/features/workflow/hooks/use-workflow-sandbox-session'
import { useWorkflowWorkspace } from '@/features/workflow/hooks/use-workflow-workspace'
import { validateWorkflowGraph } from '@/features/workflow/validation/workflow-validation-service'
import { SandboxPoolPage } from '@/features/sandbox/sandbox-pool-page'
import { cn } from '@/lib/utils'

function App() {
  const [aiAssistantCollapsed, setAiAssistantCollapsed] = useState(false)
  const [navigationCollapsed, setNavigationCollapsed] = useState(false)
  const workspace = useWorkflowWorkspace()
  const {
    activeView,
    allWorkflowEdges,
    allWorkflowNodes,
    canvasApi,
    draftHydrated,
    hasUnsavedChanges,
    currentWorkflowSaved,
    lastSavedAt,
    leaveDialogSaving,
    localDrafts,
    openingProjectId,
    pendingLeaveAction,
    projectsError,
    projectsLoading,
    restoringVersionId,
    saveMessage,
    saveStatus,
    selectedNode,
    selectedNodeId,
    workflow,
    workflowEditorOpen,
    workflowProjectFilter,
    workflowProjectPage,
    workflowProjectPageSize,
    workflowProjectQuery,
    workflowProjectTotal,
    workflowProjects,
    workflowVersions,
    versionsError,
    versionsLoading,
    cancelPendingLeave,
    changeActiveView,
    closeWorkflowEditor,
    createWorkflow,
    deleteLocalWorkflowProject,
    deleteSavedWorkflowProject,
    duplicateLocalWorkflowProject,
    duplicateSavedWorkflowProject,
    handleSaveWorkflow,
    openLocalWorkflowDraft,
    openWorkflowProject,
    refreshWorkflowProjects,
    restoreSavedWorkflowVersion,
    saveAndContinuePendingLeave,
    setCanvasApi,
    setSelectedNodeId,
    setWorkflowProjectFilter,
    setWorkflowProjectPage,
    setWorkflowProjectQuery,
    stashAndContinuePendingLeave,
    updateLocalWorkflowProject,
    updateSavedWorkflowProject,
    updateSelectedNode,
    updateWorkflowMetadata,
  } = workspace
  const workflowSandboxSession = useWorkflowSandboxSession({
    enabled: workflowEditorOpen && currentWorkflowSaved,
    workflowId: workflow.id,
  })
  const validationResult = useMemo(
    () => validateWorkflowGraph(workflow.nodes, workflow.edges),
    [workflow.edges, workflow.nodes],
  )

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#14203d_0%,#090d18_38%,#05070c_100%)] text-slate-100">
      <div className="flex min-h-screen">
        <NavigationSidebar
          activeView={activeView}
          collapsed={navigationCollapsed}
          onChangeView={changeActiveView}
          onToggleCollapsed={() => setNavigationCollapsed((current) => !current)}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          {activeView === 'workflow' ? (
            workflowEditorOpen ? (
              <main className="min-h-0 flex-1 p-4 lg:p-6">
                <div className="flex h-full min-h-[820px] flex-col gap-3">
                  <WorkflowEditorHeader
                    description={workflow.description}
                    hasUnsavedChanges={hasUnsavedChanges}
                    lastSavedAt={lastSavedAt}
                    name={workflow.name}
                    saveMessage={saveMessage}
                    saveStatus={saveStatus}
                    versions={workflowVersions}
                    versionsError={versionsError}
                    versionsLoading={versionsLoading}
                    version={workflow.version}
                    restoringVersionId={restoringVersionId}
                    availableSandboxes={workflowSandboxSession.availableSandboxes}
                    availableSandboxesHasNextPage={workflowSandboxSession.availableSandboxesHasNextPage}
                    availableSandboxesHasPreviousPage={workflowSandboxSession.availableSandboxesHasPreviousPage}
                    availableSandboxesLoading={workflowSandboxSession.availableSandboxesLoading}
                    availableSandboxesPageIndex={workflowSandboxSession.availableSandboxesPageIndex}
                    sandboxImages={workflowSandboxSession.sandboxImages}
                    sandboxImagesLoading={workflowSandboxSession.sandboxImagesLoading}
                    sandboxStatusPolling={workflowSandboxSession.sandboxStatusPolling}
                    sandboxSession={workflowSandboxSession.session}
                    sandbox={workflowSandboxSession.sandbox}
                    sandboxSessionError={workflowSandboxSession.error}
                    sandboxSessionLoading={workflowSandboxSession.loading}
                    sandboxSessionUpdating={workflowSandboxSession.updating}
                    canUseSandboxSession={workflowSandboxSession.canLoad}
                    onBack={closeWorkflowEditor}
                    onAssociateSandbox={workflowSandboxSession.associateSandboxById}
                    onCreateSandbox={workflowSandboxSession.createAndAssociateSandbox}
                    onLoadNextAvailableSandboxes={workflowSandboxSession.loadNextAvailableSandboxes}
                    onLoadPreviousAvailableSandboxes={workflowSandboxSession.loadPreviousAvailableSandboxes}
                    onRefreshAvailableSandboxes={workflowSandboxSession.refreshAvailableSandboxes}
                    onRefreshSandboxImages={workflowSandboxSession.refreshSandboxImages}
                    onRefreshSandboxSession={workflowSandboxSession.refresh}
                    onRestoreVersion={restoreSavedWorkflowVersion}
                    onSave={handleSaveWorkflow}
                    onUpdateMetadata={updateWorkflowMetadata}
                  />

                  <div className="relative min-h-0 flex-1">
                    {draftHydrated ? (
                      <WorkflowCanvas
                        key={`${workflow.id}:${workflow.version}`}
                        className="h-full"
                        workflowId={workflow.id}
                        nodes={workflow.nodes}
                        edges={workflow.edges}
                        sandbox={workflowSandboxSession.sandbox}
                        selectedNodeId={selectedNodeId}
                        onSelectNode={setSelectedNodeId}
                        onReady={setCanvasApi}
                      />
                    ) : (
                      <section className="relative flex h-full min-h-[680px] items-center justify-center overflow-hidden rounded-[28px] border border-white/8 bg-slate-950/70 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
                        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-slate-300 backdrop-blur">
                          <LoaderCircle className="h-4 w-4 animate-spin text-blue-300" />
                          恢复画布草稿中
                        </div>
                      </section>
                    )}

                    <AiAssistantPanel
                      className={cn(
                        'absolute bottom-3 left-3 top-3 z-20 hidden w-[min(680px,calc(100%_-_400px))] xl:flex 2xl:w-[720px]',
                        aiAssistantCollapsed && 'pointer-events-none opacity-0',
                      )}
                      onCollapse={() => setAiAssistantCollapsed(true)}
                    />

                    {aiAssistantCollapsed && (
                      <button
                        type="button"
                        onClick={() => setAiAssistantCollapsed(false)}
                        className="absolute left-3 top-1/2 z-20 hidden -translate-y-1/2 items-center gap-2 rounded-r-2xl rounded-l-xl border border-white/10 bg-slate-950/92 px-3 py-3 text-slate-200 shadow-[0_20px_48px_rgba(2,6,23,0.4)] backdrop-blur transition-colors hover:border-blue-400/25 hover:bg-slate-900/95 xl:flex"
                        aria-label="展开 AI 助手"
                      >
                        <Sparkles className="h-4 w-4 text-blue-300" />
                        <PanelLeftOpen className="h-4 w-4" />
                        <span className="text-xs font-medium tracking-[0.08em] text-slate-300 [writing-mode:vertical-rl]">
                          AI 助手
                        </span>
                      </button>
                    )}

                    {selectedNode && (
                      <div className="absolute right-3 top-3 z-20 h-[calc(100%-24px)] w-[min(480px,calc(100%_-_24px))] 2xl:w-[min(540px,calc(100%_-_24px))]">
                        <NodeConfigPanel
                          key={selectedNode.id}
                          className="h-full"
                          node={selectedNode}
                          nodes={allWorkflowNodes}
                          edges={allWorkflowEdges}
                          sandbox={workflowSandboxSession.sandbox}
                          sandboxSession={workflowSandboxSession.session}
                          workflowId={workflow.id}
                          workflowSaved={currentWorkflowSaved}
                          validationResult={validationResult.nodeResults[selectedNode.id]}
                          onUpdateNode={(partial) => {
                            if (canvasApi) {
                              canvasApi.updateSelectedNode(partial)
                              return
                            }

                            updateSelectedNode(partial)
                          }}
                        />
                        <button
                          type="button"
                          className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-xl border border-white/10 bg-slate-900/90 text-slate-300 shadow-lg transition hover:border-blue-300/30 hover:bg-slate-800 hover:text-white"
                          onClick={() => setSelectedNodeId('')}
                          aria-label="关闭节点配置"
                          title="关闭节点配置"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </main>
            ) : draftHydrated ? (
              <WorkflowOverview
                workflow={workflow}
                localDrafts={localDrafts}
                projects={workflowProjects}
                projectsFilter={workflowProjectFilter}
                projectsPage={workflowProjectPage}
                projectsPageSize={workflowProjectPageSize}
                projectsQuery={workflowProjectQuery}
                projectsTotal={workflowProjectTotal}
                loadingProjects={projectsLoading}
                projectsError={projectsError}
                openingProjectId={openingProjectId}
                onCreateWorkflow={createWorkflow}
                onOpenWorkflow={openWorkflowProject}
                onOpenLocalDraft={openLocalWorkflowDraft}
                onRefreshProjects={refreshWorkflowProjects}
                onChangeProjectsFilter={setWorkflowProjectFilter}
                onChangeProjectsPage={setWorkflowProjectPage}
                onChangeProjectsQuery={setWorkflowProjectQuery}
                onUpdateLocalDraft={updateLocalWorkflowProject}
                onDeleteLocalDraft={deleteLocalWorkflowProject}
                onDuplicateLocalDraft={duplicateLocalWorkflowProject}
                onUpdateProject={updateSavedWorkflowProject}
                onDeleteProject={deleteSavedWorkflowProject}
                onDuplicateProject={duplicateSavedWorkflowProject}
              />
            ) : (
              <main className="min-h-0 flex-1 p-4 lg:p-6">
                <section className="relative flex h-full min-h-[680px] items-center justify-center overflow-hidden rounded-[28px] border border-white/8 bg-slate-950/70 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
                  <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-slate-300 backdrop-blur">
                    <LoaderCircle className="h-4 w-4 animate-spin text-blue-300" />
                    恢复工作流草稿中
                  </div>
                </section>
              </main>
            )
          ) : (
            <SandboxPoolPage />
          )}
        </div>
      </div>
      {pendingLeaveAction && (
        <UnsavedWorkflowDialog
          saving={leaveDialogSaving}
          workflowName={workflow.name}
          onCancel={cancelPendingLeave}
          onSaveAndContinue={saveAndContinuePendingLeave}
          onStashAndContinue={stashAndContinuePendingLeave}
        />
      )}
    </div>
  )
}

export default App
