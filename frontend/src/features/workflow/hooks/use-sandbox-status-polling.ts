import { useCallback, useEffect, useRef, useState } from 'react'

import { getSandbox, type SandboxSummary } from '@/api/sandbox-pool'
import {
  SANDBOX_READY_POLL_INTERVAL_MS,
  SANDBOX_READY_POLL_TIMEOUT_MS,
  TERMINAL_SANDBOX_STATUSES,
} from '@/features/workflow/workflow-sandbox-constants'

export function useSandboxStatusPolling(onSandboxChange: (sandbox: SandboxSummary) => void) {
  const [polling, setPolling] = useState(false)
  const generationRef = useRef(0)

  const cancelPolling = useCallback(() => {
    generationRef.current += 1
    setPolling(false)
  }, [])

  const pollUntilReady = useCallback(
    async (sandboxId: string) => {
      const normalizedSandboxId = sandboxId.trim()
      if (!normalizedSandboxId) {
        setPolling(false)
        return null
      }

      const generation = generationRef.current + 1
      generationRef.current = generation
      setPolling(true)
      const deadline = Date.now() + SANDBOX_READY_POLL_TIMEOUT_MS

      while (Date.now() < deadline && generationRef.current === generation) {
        try {
          const sandbox = await getSandbox(normalizedSandboxId)
          if (generationRef.current !== generation) {
            return sandbox
          }

          onSandboxChange(sandbox)
          if (TERMINAL_SANDBOX_STATUSES.has(sandbox.status)) {
            setPolling(false)
            return sandbox
          }
        } catch {
          // Creation and Kubernetes reads can briefly race. The loop is bounded by SANDBOX_READY_POLL_TIMEOUT_MS.
        }

        await new Promise((resolve) => window.setTimeout(resolve, SANDBOX_READY_POLL_INTERVAL_MS))
      }

      if (generationRef.current === generation) {
        setPolling(false)
      }
      return null
    },
    [onSandboxChange],
  )

  useEffect(() => cancelPolling, [cancelPolling])

  return {
    cancelPolling,
    pollUntilReady,
    polling,
  }
}
