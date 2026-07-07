export function getErrorMessage(error: unknown, fallback: string) {
  if (isHttpError(error)) {
    const detail = error.response?.data?.detail ?? error.response?.data?.message
    if (typeof detail === 'string' && detail.trim()) {
      return detail
    }
    if (Array.isArray(detail) && detail.length > 0) {
      return detail
        .map((item) => {
          if (typeof item === 'string') {
            return item
          }
          if (item && typeof item === 'object' && 'msg' in item && typeof item.msg === 'string') {
            return item.msg
          }
          return ''
        })
        .filter(Boolean)
        .join('；')
    }
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}

function isHttpError(error: unknown): error is {
  response?: {
    data?: {
      detail?: unknown
      message?: unknown
    }
  }
} {
  return Boolean(error && typeof error === 'object' && 'response' in error)
}
