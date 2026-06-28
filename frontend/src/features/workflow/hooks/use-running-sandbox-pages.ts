import { useCallback, useState } from 'react'

import { listSandboxes, type SandboxSummary } from '@/api/sandbox-pool'
import { RUNNING_SANDBOX_PAGE_SIZE } from '@/features/workflow/workflow-sandbox-constants'

export function useRunningSandboxPages(enabled: boolean) {
  const [sandboxes, setSandboxes] = useState<SandboxSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [currentToken, setCurrentToken] = useState('')
  const [nextToken, setNextToken] = useState('')
  const [tokenStack, setTokenStack] = useState<string[]>([])

  const reset = useCallback(() => {
    setSandboxes([])
    setCurrentToken('')
    setNextToken('')
    setTokenStack([])
  }, [])

  const loadPage = useCallback(
    async (token = '', previousTokens: string[] = []) => {
      if (!enabled) {
        reset()
        return []
      }

      setLoading(true)
      try {
        const page = await listSandboxes({
          continueToken: token,
          limit: RUNNING_SANDBOX_PAGE_SIZE,
          status: 'Running',
        })
        setSandboxes(page.sandboxes)
        setCurrentToken(token)
        setNextToken(page.continueToken)
        setTokenStack(previousTokens)
        return page.sandboxes
      } catch {
        reset()
        return []
      } finally {
        setLoading(false)
      }
    },
    [enabled, reset],
  )

  const refresh = useCallback(() => loadPage('', []), [loadPage])

  const loadNextPage = useCallback(() => {
    if (!nextToken) {
      return Promise.resolve([])
    }
    return loadPage(nextToken, [...tokenStack, currentToken])
  }, [currentToken, loadPage, nextToken, tokenStack])

  const loadPreviousPage = useCallback(() => {
    if (tokenStack.length === 0) {
      return Promise.resolve([])
    }

    const previousToken = tokenStack[tokenStack.length - 1] ?? ''
    return loadPage(previousToken, tokenStack.slice(0, -1))
  }, [loadPage, tokenStack])

  return {
    hasNextPage: Boolean(nextToken),
    hasPreviousPage: tokenStack.length > 0,
    loadNextPage,
    loadPreviousPage,
    loading,
    pageIndex: tokenStack.length + 1,
    refresh,
    sandboxes,
  }
}
