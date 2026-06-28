import { useCallback, useState } from 'react'

import { listSandboxImages, type SandboxImageSummary } from '@/api/sandbox-pool'

export function useSandboxImages() {
  const [images, setImages] = useState<SandboxImageSummary[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const nextImages = await listSandboxImages()
      setImages(nextImages)
      return nextImages
    } catch {
      setImages([])
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    images,
    loading,
    refresh,
  }
}
