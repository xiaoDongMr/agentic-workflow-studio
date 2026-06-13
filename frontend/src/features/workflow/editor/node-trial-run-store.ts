import { useSyncExternalStore } from 'react'

import type { TrialRunNodeExecution } from '@/features/workflow/editor/workflow-editor.types'

type TrialRunExecutionScope = {
  runId?: string
  nodeId: string
  loopNodeId?: string
}

const executions = new Map<string, TrialRunNodeExecution>()
const selectedLoopIterations = new Map<string, number>()
const listeners = new Map<string, Set<() => void>>()
const globalListeners = new Set<() => void>()
let activeRunId = 'idle'
let version = 0

function buildExecutionScopeKey(scope: TrialRunExecutionScope) {
  return [
    scope.runId || activeRunId,
    scope.loopNodeId || 'root',
    scope.nodeId,
  ].join('::')
}

function buildListenerKey(scope: Pick<TrialRunExecutionScope, 'nodeId' | 'loopNodeId'>) {
  return [
    scope.loopNodeId || 'root',
    scope.nodeId,
  ].join('::')
}

function notify(listenerKey?: string) {
  version += 1
  if (listenerKey) {
    listeners.get(listenerKey)?.forEach((listener) => listener())
  }
  globalListeners.forEach((listener) => listener())
}

function notifyAll() {
  version += 1
  listeners.forEach((nodeListeners) => {
    nodeListeners.forEach((listener) => listener())
  })
  globalListeners.forEach((listener) => listener())
}

export function createTrialRunId(prefix = 'run') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function setActiveTrialRunId(runId: string) {
  activeRunId = runId || 'idle'
  notifyAll()
}

export function getActiveTrialRunId() {
  return activeRunId
}

export function setNodeTrialRunExecution(scope: TrialRunExecutionScope, execution: TrialRunNodeExecution) {
  const scopeKey = buildExecutionScopeKey(scope)
  executions.set(scopeKey, execution)
  notify(buildListenerKey(scope))
}

export function setSelectedLoopIteration(scope: TrialRunExecutionScope, iterationIndex: number) {
  const scopeKey = buildExecutionScopeKey(scope)
  selectedLoopIterations.set(scopeKey, iterationIndex)
  notify(buildListenerKey(scope))
}

export function getSelectedLoopIteration(scope: TrialRunExecutionScope) {
  return selectedLoopIterations.get(buildExecutionScopeKey(scope))
}

export function clearNodeTrialRunExecution(scope?: Partial<TrialRunExecutionScope>) {
  if (scope?.nodeId) {
    const scopeKey = buildExecutionScopeKey({
      nodeId: scope.nodeId,
      loopNodeId: scope.loopNodeId,
      runId: scope.runId,
    })
    executions.delete(scopeKey)
    selectedLoopIterations.delete(scopeKey)
    notify(buildListenerKey({
      nodeId: scope.nodeId,
      loopNodeId: scope.loopNodeId,
    }))
    return
  }

  const scopeKeys = [...executions.keys()]
  executions.clear()
  selectedLoopIterations.clear()
  if (scopeKeys.length > 0) {
    notifyAll()
  } else {
    notify()
  }
}

export function getNodeTrialRunExecution(scope: TrialRunExecutionScope) {
  const scopedExecution = executions.get(buildExecutionScopeKey(scope))
  if (scopedExecution || !scope.loopNodeId) {
    return scopedExecution
  }
  const fallbackExecution = executions.get(buildExecutionScopeKey({
    runId: scope.runId,
    nodeId: scope.nodeId,
  }))
  return fallbackExecution
}

export function useNodeTrialRunExecution(nodeId: string, loopNodeId?: string) {
  return useSyncExternalStore(
    (listener) => {
      const listenerKey = buildListenerKey({ nodeId, loopNodeId })
      const nodeListeners = listeners.get(listenerKey) ?? new Set<() => void>()
      nodeListeners.add(listener)
      listeners.set(listenerKey, nodeListeners)
      return () => {
        nodeListeners.delete(listener)
        if (nodeListeners.size === 0) {
          listeners.delete(listenerKey)
        }
      }
    },
    () => getNodeTrialRunExecution({ nodeId, loopNodeId }),
    () => undefined,
  )
}

export function useSelectedLoopIteration(nodeId: string, loopNodeId?: string) {
  return useSyncExternalStore(
    (listener) => {
      const listenerKey = buildListenerKey({ nodeId, loopNodeId })
      const nodeListeners = listeners.get(listenerKey) ?? new Set<() => void>()
      nodeListeners.add(listener)
      listeners.set(listenerKey, nodeListeners)
      return () => {
        nodeListeners.delete(listener)
        if (nodeListeners.size === 0) {
          listeners.delete(listenerKey)
        }
      }
    },
    () => getSelectedLoopIteration({ nodeId, loopNodeId }),
    () => undefined,
  )
}

export function useTrialRunExecutionVersion() {
  return useSyncExternalStore(
    (listener) => {
      globalListeners.add(listener)
      return () => {
        globalListeners.delete(listener)
      }
    },
    () => version,
    () => 0,
  )
}
