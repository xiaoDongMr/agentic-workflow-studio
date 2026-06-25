import { useCallback, useEffect, useState } from 'react'

import {
  ERROR_AUTO_DISMISS_MS,
  NOTICE_AUTO_DISMISS_MS,
} from '@/features/sandbox/sandbox-pool-constants'

export function useTimedMessages() {
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!notice) {
      return
    }
    const timer = window.setTimeout(() => setNotice(''), NOTICE_AUTO_DISMISS_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (!error) {
      return
    }
    const timer = window.setTimeout(() => setError(''), ERROR_AUTO_DISMISS_MS)
    return () => window.clearTimeout(timer)
  }, [error])

  const clearError = useCallback(() => setError(''), [])
  const clearNotice = useCallback(() => setNotice(''), [])
  const clearMessages = useCallback(() => {
    setError('')
    setNotice('')
  }, [])

  return {
    error,
    notice,
    setError,
    setNotice,
    clearError,
    clearNotice,
    clearMessages,
  }
}
