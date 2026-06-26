import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  Clock3,
  Layers3,
  LoaderCircle,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
} from 'lucide-react'

import {
  createSandboxImage,
  createSandbox,
  deleteSandboxImage,
  deleteSandbox,
  getSandboxPoolHealth,
  listSandboxImages,
  listSandboxes,
  probeSandboxPythonPackages,
  type SandboxPoolHealth,
  type SandboxPythonProbeResult,
  type SandboxStatus,
  type SandboxSummary,
} from '@/api/sandbox-pool'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CreateSandboxPanel } from '@/features/sandbox/components/create-sandbox-panel'
import { CustomImageDeleteDialog } from '@/features/sandbox/components/custom-image-delete-dialog'
import { FeedbackToast } from '@/features/sandbox/components/feedback-toast'
import { HealthPanel } from '@/features/sandbox/components/health-panel'
import { SandboxCard } from '@/features/sandbox/components/sandbox-card'
import { SandboxImageCatalogPanel } from '@/features/sandbox/components/sandbox-image-catalog-panel'
import { SearchableSelect } from '@/features/sandbox/components/searchable-select'
import { useTimedMessages } from '@/features/sandbox/hooks/use-timed-messages'
import {
  sandboxImageCapabilities,
  type SandboxImageCapability,
} from '@/features/sandbox/sandbox-image-capabilities'
import {
  CUSTOM_IMAGE_DEFAULT_CAPABILITY_MANIFEST,
  PRELOAD_POLL_INTERVAL_MS,
  PRELOAD_POLL_MAX_ATTEMPTS,
  SANDBOX_PAGE_SIZE_OPTIONS,
  SANDBOX_STATUS_FILTER_OPTIONS,
} from '@/features/sandbox/sandbox-pool-constants'
import type {
  CreateSandboxFormState,
  CustomImageFormState,
  SandboxPoolTab,
} from '@/features/sandbox/sandbox-pool-types'
import {
  createDefaultCustomImageForm,
  createDefaultForm,
  createSandboxId,
  parseKeyValueText,
  toSandboxImageCapability,
} from '@/features/sandbox/sandbox-pool-utils'
import { cn } from '@/lib/utils'

export function SandboxPoolPage() {
  const { error, notice, setError, setNotice, clearError, clearNotice, clearMessages } = useTimedMessages()
  const [health, setHealth] = useState<SandboxPoolHealth | null>(null)
  const [sandboxes, setSandboxes] = useState<SandboxSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [registeringImage, setRegisteringImage] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [deletingImageId, setDeletingImageId] = useState('')
  const [pendingDeleteImageId, setPendingDeleteImageId] = useState('')
  const [probeError, setProbeError] = useState('')
  const [probeResult, setProbeResult] = useState<SandboxPythonProbeResult | null>(null)
  const [probing, setProbing] = useState(false)
  const [createForm, setCreateForm] = useState<CreateSandboxFormState>(() => createDefaultForm())
  const [customImageForm, setCustomImageForm] = useState<CustomImageFormState>(() => createDefaultCustomImageForm())
  const [images, setImages] = useState<SandboxImageCapability[]>(sandboxImageCapabilities)
  const [showCreateAdvanced, setShowCreateAdvanced] = useState(false)
  const [selectedImageId, setSelectedImageId] = useState(() => sandboxImageCapabilities[0]?.id ?? '')
  const [activeTab, setActiveTab] = useState<SandboxPoolTab>('images')
  const [sandboxPageSize, setSandboxPageSize] = useState(SANDBOX_PAGE_SIZE_OPTIONS[0])
  const [sandboxStatusFilter, setSandboxStatusFilter] = useState<SandboxStatus | ''>('')
  const [sandboxImageFilter, setSandboxImageFilter] = useState('')
  const [sandboxIdFilter, setSandboxIdFilter] = useState('')
  const [sandboxPageIndex, setSandboxPageIndex] = useState(0)
  const [sandboxPageTokens, setSandboxPageTokens] = useState<string[]>([''])
  const [sandboxNextContinueToken, setSandboxNextContinueToken] = useState('')
  const [sandboxRemainingItemCount, setSandboxRemainingItemCount] = useState<number | null>(null)

  const createDisabled = !health?.enabled || Boolean(health?.extra.error)
  const selectedImage = useMemo(
    () => images.find((image) => image.id === selectedImageId) ?? images[0],
    [images, selectedImageId],
  )

  const stats = useMemo(() => {
    const running = sandboxes.filter((item) => item.status === 'Running').length
    const pending = sandboxes.filter((item) => item.status === 'Pending').length
    const failed = sandboxes.filter((item) => item.status === 'Failed').length
    const nodes = new Set(sandboxes.map((item) => item.nodeName).filter(Boolean)).size
    return { running, pending, failed, nodes }
  }, [sandboxes])

  const runningSandboxes = useMemo(() => sandboxes.filter((item) => item.status === 'Running'), [sandboxes])
  const hasSandboxFilter = Boolean(sandboxStatusFilter || sandboxImageFilter || sandboxIdFilter.trim())
  const currentSandboxContinueToken = sandboxPageTokens[sandboxPageIndex] ?? ''
  const pendingDeleteImage = useMemo(
    () => images.find((image) => image.id === pendingDeleteImageId && image.source === 'custom'),
    [images, pendingDeleteImageId],
  )

  useEffect(() => {
    if (selectedImageId && images.some((image) => image.id === selectedImageId)) {
      return
    }
    setSelectedImageId(images[0]?.id ?? '')
    setCreateForm((current) => ({ ...current, image: '' }))
  }, [images, selectedImageId])

  useEffect(() => {
    if (!sandboxImageFilter || images.some((image) => image.id === sandboxImageFilter)) {
      return
    }
    setSandboxImageFilter('')
  }, [images, sandboxImageFilter])

  const load = useCallback(async (silent = false, options?: { continueToken?: string; pageIndex?: number; resetPage?: boolean }) => {
    if (silent) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    clearError()

    try {
      const pageIndex = options?.resetPage ? 0 : options?.pageIndex ?? 0
      const continueToken = options?.resetPage ? '' : options?.continueToken ?? ''
      const [nextHealth, nextSandboxPage] = await Promise.all([
        getSandboxPoolHealth(),
        listSandboxes({
          limit: sandboxPageSize,
          continueToken,
          status: sandboxStatusFilter,
          imageId: sandboxImageFilter,
          sandboxId: sandboxIdFilter.trim(),
        }),
      ])
      const nextImages = await listSandboxImages()
      setHealth(nextHealth)
      setSandboxes(nextSandboxPage.sandboxes)
      setSandboxPageIndex(pageIndex)
      setSandboxNextContinueToken(nextSandboxPage.continueToken)
      setSandboxRemainingItemCount(nextSandboxPage.remainingItemCount)
      setSandboxPageTokens((current) => {
        const nextTokens = options?.resetPage ? [''] : current.slice(0, pageIndex + 1)
        if (nextSandboxPage.continueToken) {
          nextTokens[pageIndex + 1] = nextSandboxPage.continueToken
        }
        return nextTokens
      })
      setImages(nextImages.map(toSandboxImageCapability))
    } catch (currentError) {
      const message = currentError instanceof Error ? currentError.message : '加载沙箱资源池失败'
      setError(message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [sandboxIdFilter, sandboxImageFilter, sandboxPageSize, sandboxStatusFilter])

  const refreshImages = useCallback(async () => {
    const nextImages = await listSandboxImages()
    const nextCapabilities = nextImages.map(toSandboxImageCapability)
    setImages(nextCapabilities)
    return nextCapabilities
  }, [])

  useEffect(() => {
    void load(false, { resetPage: true })
  }, [load])

  async function pollImagePreload(imageId: string) {
    for (let attempt = 0; attempt < PRELOAD_POLL_MAX_ATTEMPTS; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, PRELOAD_POLL_INTERVAL_MS))
      try {
        const nextImages = await refreshImages()
        const image = nextImages.find((item) => item.id === imageId)
        if (!image || image.preloadStatus === 'ready' || image.preloadStatus === 'unknown') {
          return
        }
      } catch {
        return
      }
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreating(true)
    clearMessages()

    try {
      const selectedImageValue = selectedImage && !selectedImage.default ? selectedImage.image : ''
      const selectedImageIdForCreate =
        selectedImage && selectedImage.id !== sandboxImageCapabilities[0]?.id ? selectedImage.id : undefined
      const createdSandbox = await createSandbox({
        sandboxId: createForm.sandboxId.trim(),
        imageId: selectedImageIdForCreate,
        image: createForm.image.trim() || selectedImageValue,
        env: parseKeyValueText(createForm.envText, '环境变量'),
        labels: parseKeyValueText(createForm.labelsText, '标签'),
      })
      setNotice(`沙箱 ${createdSandbox.sandboxId} 已提交创建，实例状态会在资源池中持续更新。`)
      setCreateForm(createDefaultForm())
      setShowCreateAdvanced(false)
      await load(true, { resetPage: true })
    } catch (currentError) {
      const message = currentError instanceof Error ? currentError.message : '创建沙箱失败'
      setError(message)
    } finally {
      setCreating(false)
    }
  }

  function handleRegisterCustomImage() {
    void registerCustomImage()
  }

  async function registerCustomImage() {
    const image = customImageForm.image.trim()
    if (!image) {
      setError('请先填写自定义镜像地址')
      return
    }
    setRegisteringImage(true)
    clearMessages()
    try {
      const nextImages = await createSandboxImage({
        name: customImageForm.name.trim() || '自定义 AioSandbox 镜像',
        image,
        description: customImageForm.description.trim() || '基于 AioSandbox 基础镜像扩展的自定义运行镜像。',
        capabilityManifest: CUSTOM_IMAGE_DEFAULT_CAPABILITY_MANIFEST,
      })
      const nextCapabilities = nextImages.map(toSandboxImageCapability)
      const nextImage = nextCapabilities.find((item) => item.image === image)
      setImages(nextCapabilities)
      if (nextImage) {
        setSelectedImageId(nextImage.id)
        setCreateForm((current) => ({ ...current, image: nextImage.image }))
      }
      setCustomImageForm(createDefaultCustomImageForm())
      clearError()
        setNotice(`自定义镜像已登记，并已提交 Kubernetes 节点预热。页面会自动刷新预热进度。`)
        if (nextImage) {
          void pollImagePreload(nextImage.id)
        }
    } catch (currentError) {
      const message = currentError instanceof Error ? currentError.message : '添加自定义镜像失败'
      setError(message)
    } finally {
      setRegisteringImage(false)
    }
  }

  function handleRemoveCustomImage(imageId: string) {
    setPendingDeleteImageId(imageId)
  }

  async function removeCustomImage(imageId: string) {
    setDeletingImageId(imageId)
    clearMessages()
    try {
      const nextImages = await deleteSandboxImage(imageId)
      setImages(nextImages.map(toSandboxImageCapability))
      setPendingDeleteImageId('')
      if (selectedImageId === imageId) {
        setSelectedImageId(sandboxImageCapabilities[0]?.id ?? '')
        setCreateForm((current) => ({ ...current, image: '' }))
      }
      setNotice('自定义镜像已移除，对应的 K8s 预热任务已删除。')
    } catch (currentError) {
      const message = currentError instanceof Error ? currentError.message : '移除自定义镜像失败'
      setError(message)
    } finally {
      setDeletingImageId('')
    }
  }

  function handleSelectImage(imageId: string) {
    const nextImage = images.find((image) => image.id === imageId)
    setSelectedImageId(imageId)
    setCreateForm((current) => ({ ...current, image: nextImage?.default ? '' : nextImage?.image ?? '' }))
  }

  async function handleDelete(sandboxId: string) {
    const confirmed = window.confirm(`确认删除沙箱 ${sandboxId} 吗？该操作会删除对应 Pod、Service 和 Ingress。`)
    if (!confirmed) {
      return
    }

    setDeletingId(sandboxId)
    clearError()
    try {
      await deleteSandbox(sandboxId)
      setSandboxes((current) => current.filter((item) => item.sandboxId !== sandboxId))
      await load(true, { continueToken: currentSandboxContinueToken, pageIndex: sandboxPageIndex })
    } catch (currentError) {
      const message = currentError instanceof Error ? currentError.message : '删除沙箱失败'
      setError(message)
    } finally {
      setDeletingId('')
    }
  }

  async function handleProbePythonPackages(sandboxId: string) {
    setProbing(true)
    setProbeError('')
    try {
      const result = await probeSandboxPythonPackages(sandboxId)
      setProbeResult(result)
    } catch (currentError) {
      const message = currentError instanceof Error ? currentError.message : '探测 Python 依赖失败'
      setProbeError(message)
    } finally {
      setProbing(false)
    }
  }

  function handleNextSandboxPage() {
    if (!sandboxNextContinueToken) {
      return
    }
    void load(true, { continueToken: sandboxNextContinueToken, pageIndex: sandboxPageIndex + 1 })
  }

  function handlePreviousSandboxPage() {
    if (sandboxPageIndex <= 0) {
      return
    }
    const previousPageIndex = sandboxPageIndex - 1
    void load(true, { continueToken: sandboxPageTokens[previousPageIndex] ?? '', pageIndex: previousPageIndex })
  }

  function handleResetSandboxFilters() {
    setSandboxStatusFilter('')
    setSandboxImageFilter('')
    setSandboxIdFilter('')
  }

  return (
    <main className="min-h-0 flex-1 overflow-auto p-4 lg:p-6">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-200/70">Resource Pool</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">沙箱资源池总览</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => void load(true, { continueToken: currentSandboxContinueToken, pageIndex: sandboxPageIndex })}
              disabled={refreshing || loading}
              className="w-fit"
            >
              <RefreshCw className={cn('mr-2 h-4 w-4', refreshing && 'animate-spin')} />
              刷新资源池
            </Button>
          </div>
        </div>

        <FeedbackToast
          error={error}
          notice={notice}
          onClearError={clearError}
          onClearNotice={clearNotice}
        />

        {pendingDeleteImage ? (
          <CustomImageDeleteDialog
            busy={deletingImageId === pendingDeleteImage.id}
            image={pendingDeleteImage}
            onCancel={() => {
              if (!deletingImageId) {
                setPendingDeleteImageId('')
              }
            }}
            onConfirm={() => void removeCustomImage(pendingDeleteImage.id)}
          />
        ) : null}

        <HealthPanel health={health} />

        <section className="rounded-3xl border border-white/8 bg-slate-950/42 p-4">
          <div className="mb-4">
            <div className="inline-grid w-full gap-1 rounded-2xl border border-white/8 bg-slate-950/50 p-1 md:w-auto md:grid-cols-2">
              <button
                type="button"
                onClick={() => setActiveTab('images')}
                className={cn(
                  'rounded-xl px-4 py-2.5 text-left transition md:min-w-[220px]',
                  activeTab === 'images'
                    ? 'bg-white/[0.09] text-white'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-200">
                    <Layers3 className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">镜像管理</span>
                  </span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('sandboxes')}
                className={cn(
                  'rounded-xl px-4 py-2.5 text-left transition md:min-w-[220px]',
                  activeTab === 'sandboxes'
                    ? 'bg-white/[0.09] text-white'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-400/10 text-blue-200">
                    <Server className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">沙箱实例</span>
                  </span>
                </div>
              </button>
            </div>
          </div>

          <div>
            {activeTab === 'images' ? (
              <SandboxImageCatalogPanel
                images={images}
                customImageForm={customImageForm}
                registeringImage={registeringImage}
                probeError={probeError}
                probeResult={probeResult}
                probing={probing}
                runningSandboxes={runningSandboxes}
                selectedImageId={selectedImageId}
                onChangeCustomImageForm={setCustomImageForm}
                onRegisterCustomImage={handleRegisterCustomImage}
                onRemoveCustomImage={handleRemoveCustomImage}
                onSelectImage={handleSelectImage}
                onProbe={(sandboxId) => void handleProbePythonPackages(sandboxId)}
              />
            ) : (
              <div className="space-y-5">
                <CreateSandboxPanel
                  value={createForm}
                  images={images}
                  selectedImageId={selectedImageId}
                  creating={creating}
                  disabled={createDisabled}
                  showAdvanced={showCreateAdvanced}
                  onChange={setCreateForm}
                  onSelectImage={handleSelectImage}
                  onSubmit={handleCreate}
                  onGenerateId={() => setCreateForm((current) => ({ ...current, sandboxId: createSandboxId() }))}
                  onToggleAdvanced={() => setShowCreateAdvanced((current) => !current)}
                />

                <section className="rounded-[28px] border border-white/8 bg-slate-950/62 p-5">
                      <div className="flex flex-col gap-3 border-b border-white/8 pb-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-white">沙箱实例</h3>
                          <p className="mt-1 text-sm text-slate-400">展示当前资源池内可见的 aio-sandbox Pod、Service 和 Ingress。</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="w-fit gap-1.5 rounded-2xl border-emerald-400/18 bg-emerald-400/10 px-3 py-1.5 text-emerald-100">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            运行 {stats.running}
                          </Badge>
                          <Badge className="w-fit gap-1.5 rounded-2xl border-blue-400/18 bg-blue-400/10 px-3 py-1.5 text-blue-100">
                            <LoaderCircle className="h-3.5 w-3.5" />
                            启动 {stats.pending}
                          </Badge>
                          <Badge className="w-fit gap-1.5 rounded-2xl border-amber-400/18 bg-amber-400/10 px-3 py-1.5 text-amber-100">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            异常 {stats.failed}
                          </Badge>
                          <Badge className="w-fit gap-1.5 rounded-2xl border-violet-400/18 bg-violet-400/10 px-3 py-1.5 text-violet-100">
                            <Server className="h-3.5 w-3.5" />
                            节点 {stats.nodes}
                          </Badge>
                          <Badge className="w-fit rounded-2xl border-blue-400/20 bg-blue-400/10 px-3 py-1.5 text-blue-100">
                            本页 {sandboxes.length} 个实例
                          </Badge>
                          {sandboxRemainingItemCount !== null ? (
                            <Badge className="w-fit rounded-2xl border-slate-400/14 bg-slate-400/8 px-3 py-1.5 text-slate-300">
                              后续约 {sandboxRemainingItemCount} 个
                            </Badge>
                          ) : null}
                            <SearchableSelect
                              value={String(sandboxPageSize)}
                              onChange={(nextValue) => setSandboxPageSize(Number(nextValue))}
                              className="w-[118px]"
                              searchPlaceholder="搜索数量"
                              options={SANDBOX_PAGE_SIZE_OPTIONS.map((pageSize) => ({
                                value: String(pageSize),
                                label: `每页 ${pageSize}`,
                              }))}
                            />
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 rounded-[24px] border border-white/8 bg-white/[0.035] p-4 xl:grid-cols-[160px_220px_minmax(0,1fr)_auto] xl:items-end">
                        <label className="block">
                          <span className="text-xs font-medium text-slate-400">状态筛选</span>
                            <SearchableSelect
                            value={sandboxStatusFilter}
                              onChange={(nextValue) => setSandboxStatusFilter(nextValue as SandboxStatus | '')}
                              className="mt-1.5"
                              searchPlaceholder="搜索状态"
                              options={SANDBOX_STATUS_FILTER_OPTIONS.map((item) => ({
                                value: item.value,
                                label: item.label,
                              }))}
                            />
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium text-slate-400">镜像筛选</span>
                            <SearchableSelect
                            value={sandboxImageFilter}
                              onChange={setSandboxImageFilter}
                              className="mt-1.5"
                              searchPlaceholder="搜索镜像名称或地址"
                              options={[
                                { value: '', label: '全部镜像' },
                                ...images.map((image) => ({
                                  value: image.id,
                                  label: image.name,
                                  description: image.image,
                                })),
                              ]}
                            />
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium text-slate-400">沙箱 ID 查询</span>
                          <div className="mt-1.5 flex items-center gap-2 rounded-2xl border border-white/8 bg-slate-950/70 px-3.5">
                            <Search className="h-4 w-4 shrink-0 text-slate-500" />
                            <input
                              value={sandboxIdFilter}
                              onChange={(event) => setSandboxIdFilter(event.target.value)}
                              placeholder="精确匹配 sandbox id"
                              className="h-10 min-w-0 flex-1 bg-transparent font-mono text-xs text-slate-100 outline-none placeholder:text-slate-600"
                            />
                          </div>
                        </label>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={!hasSandboxFilter}
                          onClick={handleResetSandboxFilters}
                          className="h-10"
                        >
                          重置筛选
                        </Button>
                      </div>

                      {loading ? (
                        <div className="flex min-h-[280px] items-center justify-center">
                          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-slate-300">
                            <LoaderCircle className="h-4 w-4 animate-spin text-blue-300" />
                            加载沙箱资源池中
                          </div>
                        </div>
                      ) : sandboxes.length > 0 ? (
                        <>
                          <div className="mt-5 grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                            {sandboxes.map((sandbox) => (
                              <SandboxCard
                                key={sandbox.sandboxId}
                                sandbox={sandbox}
                                deleting={deletingId === sandbox.sandboxId}
                                onDelete={handleDelete}
                              />
                            ))}
                          </div>
                          <div className="mt-5 flex flex-col gap-3 border-t border-white/8 pt-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="text-xs text-slate-500">
                              第 {sandboxPageIndex + 1} 页，当前返回 {sandboxes.length} 个实例
                              {sandboxRemainingItemCount !== null ? `，后续约 ${sandboxRemainingItemCount} 个` : ''}
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                disabled={sandboxPageIndex <= 0 || refreshing}
                                onClick={handlePreviousSandboxPage}
                              >
                                上一页
                              </Button>
                              <span className="rounded-xl border border-white/8 bg-slate-950/48 px-3 py-1.5 text-xs text-slate-300">
                                第 {sandboxPageIndex + 1} 页
                              </span>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                disabled={!sandboxNextContinueToken || refreshing}
                                onClick={handleNextSandboxPage}
                              >
                                下一页
                              </Button>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="mt-5 flex min-h-[280px] flex-col items-center justify-center rounded-[24px] border border-dashed border-blue-300/18 bg-blue-400/[0.035] p-8 text-center">
                          <div className="inline-flex h-14 w-14 items-center justify-center rounded-3xl border border-blue-300/20 bg-blue-400/10 text-blue-200">
                            <Clock3 className="h-6 w-6" />
                          </div>
                          <h4 className="mt-4 text-base font-semibold text-white">暂无沙箱实例</h4>
                          <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">
                            资源池已连接但当前没有由 `agentic-workflow-studio` 管理的沙箱。选择镜像并创建后会显示在这里。
                          </p>
                        </div>
                      )}
                    </section>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
