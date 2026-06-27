import { useMemo, useState } from 'react'
import { CheckCircle2, LoaderCircle, Package, UploadCloud } from 'lucide-react'

import type { SandboxPythonProbeResult, SandboxSummary } from '@/api/sandbox-pool'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PreloadProgress } from '@/features/sandbox/components/preload-progress'
import { PythonPackageProbePanel } from '@/features/sandbox/components/python-package-probe-panel'
import { SearchableSelect } from '@/features/sandbox/components/searchable-select'
import type { SandboxImageCapability } from '@/features/sandbox/sandbox-image-capabilities'
import { CUSTOM_IMAGE_PAGE_SIZE_OPTIONS } from '@/features/sandbox/sandbox-pool-constants'
import type { CustomImageFormState } from '@/features/sandbox/sandbox-pool-types'
import {
  formInputClassName,
  preloadClassName,
  preloadLabel,
} from '@/features/sandbox/sandbox-pool-utils'
import { cn } from '@/lib/utils'

export function SandboxImageCatalogPanel({
  images,
  customImageForm,
  registeringImage,
  selectedImageId,
  runningSandboxes,
  probeError,
  probeResult,
  probing,
  onChangeCustomImageForm,
  onRegisterCustomImage,
  onRemoveCustomImage,
  onSelectImage,
  onProbe,
}: {
  images: SandboxImageCapability[]
  customImageForm: CustomImageFormState
  registeringImage: boolean
  selectedImageId: string
  runningSandboxes: SandboxSummary[]
  probeError: string
  probeResult: SandboxPythonProbeResult | null
  probing: boolean
  onChangeCustomImageForm: (nextValue: CustomImageFormState) => void
  onRegisterCustomImage: () => void
  onRemoveCustomImage: (imageId: string) => void
  onSelectImage: (imageId: string) => void
  onProbe: (sandboxId: string) => void
}) {
  const customImages = useMemo(() => images.filter((image) => image.source === 'custom' && !image.default), [images])
  const [customImagePage, setCustomImagePage] = useState(1)
  const [customImagePageSize, setCustomImagePageSize] = useState(CUSTOM_IMAGE_PAGE_SIZE_OPTIONS[0])
  const [selectedProbeSandboxId, setSelectedProbeSandboxId] = useState('')
  const customImagePageCount = Math.max(1, Math.ceil(customImages.length / customImagePageSize))
  const effectiveCustomImagePage = Math.min(customImagePage, customImagePageCount)
  const effectiveProbeSandboxId = runningSandboxes.some((sandbox) => sandbox.sandboxId === selectedProbeSandboxId)
    ? selectedProbeSandboxId
    : runningSandboxes[0]?.sandboxId ?? ''
  const pagedCustomImages = useMemo(() => {
    const startIndex = (effectiveCustomImagePage - 1) * customImagePageSize
    return customImages.slice(startIndex, startIndex + customImagePageSize)
  }, [customImages, effectiveCustomImagePage, customImagePageSize])
  const customImagePageStart = customImages.length === 0 ? 0 : (effectiveCustomImagePage - 1) * customImagePageSize + 1
  const customImagePageEnd = customImages.length === 0 ? 0 : Math.min(effectiveCustomImagePage * customImagePageSize, customImages.length)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-white">镜像管理</h3>
          <p className="mt-1 text-sm text-slate-500">管理自定义 AioSandbox 扩展镜像。登记后会在集群节点预拉取，创建沙箱时优先命中本地缓存。</p>
        </div>
        <Badge className="w-fit rounded-2xl border-violet-400/18 bg-violet-400/10 px-3 py-1.5 text-violet-100">
          {customImages.length} 个自定义镜像
        </Badge>
      </div>

      <div className="space-y-4">
        <section className="overflow-hidden rounded-[28px] border border-violet-300/14 bg-slate-950/50">
          <div className="border-b border-white/8 bg-white/[0.025] p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-semibold text-white">添加自定义镜像并预热</div>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
                  填写已经推送到镜像仓库的 AioSandbox 扩展镜像。平台会保存镜像元数据，并在 Kubernetes 节点上创建预热任务。
                </p>
              </div>
              <Badge className="w-fit rounded-2xl border-blue-400/18 bg-blue-400/10 px-3 py-1.5 text-blue-100">
                Registry {'->'} DB {'->'} K8s cache
              </Badge>
            </div>
          </div>

          <div className="p-5">
            <div className="grid gap-3 md:grid-cols-3">
              {[
                ['1', '镜像已在仓库', '使用集群可访问的镜像地址'],
                ['2', '保存镜像清单', '记录名称、地址和能力说明'],
                ['3', '节点预拉取', '提前缓存镜像提升创建速度'],
              ].map(([step, title, description]) => (
                <div key={step} className="rounded-2xl border border-white/8 bg-white/[0.035] p-4">
                  <div className="flex h-7 w-7 items-center justify-center rounded-xl border border-violet-300/18 bg-violet-400/10 text-xs font-semibold text-violet-100">
                    {step}
                  </div>
                  <div className="mt-3 text-sm font-medium text-slate-100">{title}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">{description}</div>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
              <input
                value={customImageForm.name}
                onChange={(event) => onChangeCustomImageForm({ ...customImageForm, name: event.target.value })}
                placeholder="镜像名称"
                className={formInputClassName('font-mono text-xs')}
              />
              <input
                value={customImageForm.image}
                onChange={(event) => onChangeCustomImageForm({ ...customImageForm, image: event.target.value })}
                placeholder="registry.example.com/aio-sandbox-data:20260624"
                className={formInputClassName('font-mono text-xs')}
              />
              <textarea
                rows={3}
                value={customImageForm.description}
                onChange={(event) => onChangeCustomImageForm({ ...customImageForm, description: event.target.value })}
                placeholder="说明这个镜像新增了哪些依赖或工具"
                className={cn(formInputClassName('resize-none text-xs xl:col-span-2'), 'min-h-[78px]')}
              />
              <div className="flex justify-end xl:col-span-2">
                <Button type="button" variant="secondary" onClick={onRegisterCustomImage} disabled={registeringImage}>
                  {registeringImage ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                  {registeringImage ? '预热中' : '添加并预热到集群'}
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/8 bg-white/[0.035] p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-white">自定义镜像清单</div>
              <p className="mt-1 text-xs text-slate-500">只展示用户添加的扩展镜像；创建沙箱时可选择这些镜像作为运行环境。</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-600">
                {customImagePageStart}-{customImagePageEnd} / {customImages.length}
              </span>
              <SearchableSelect
                value={String(customImagePageSize)}
                onChange={(nextValue) => {
                  setCustomImagePageSize(Number(nextValue))
                  setCustomImagePage(1)
                }}
                className="w-[118px]"
                searchPlaceholder="搜索数量"
                options={CUSTOM_IMAGE_PAGE_SIZE_OPTIONS.map((pageSize) => ({
                  value: String(pageSize),
                  label: `每页 ${pageSize}`,
                }))}
              />
            </div>
          </div>

          {customImages.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-white/12 bg-slate-950/30 p-8 text-center">
              <Package className="mx-auto h-8 w-8 text-slate-600" />
              <div className="mt-3 text-sm font-medium text-slate-200">暂无自定义镜像</div>
              <p className="mt-1 text-xs text-slate-500">先添加一个已经推送到镜像仓库的 AioSandbox 扩展镜像。</p>
            </div>
          ) : (
            <>
              <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {pagedCustomImages.map((image) => {
                  const active = selectedImageId === image.id
                  return (
                    <button
                      key={image.id}
                      type="button"
                      onClick={() => onSelectImage(image.id)}
                      className={cn(
                        'rounded-2xl border p-4 text-left transition',
                        active
                          ? 'border-blue-300/28 bg-blue-400/[0.10]'
                          : 'border-white/8 bg-slate-950/24 hover:border-blue-300/20 hover:bg-white/[0.045]',
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-white">{image.name}</p>
                            <Badge className="rounded-xl border-violet-400/18 bg-violet-400/10 px-2 py-0.5 text-[10px] text-violet-100">
                              自定义
                            </Badge>
                          </div>
                          <p className="mt-2 line-clamp-2 break-all font-mono text-xs text-slate-500">{image.image}</p>
                        </div>
                        {active ? <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-200" /> : null}
                      </div>
                      <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-500">{image.description}</p>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={cn('rounded-xl px-2 py-0.5 text-[10px]', preloadClassName(image.preloadStatus))}>
                            {preloadLabel(image.preloadStatus)}
                          </Badge>
                        </div>
                        <PreloadProgress
                          ready={image.preloadReady}
                          desired={image.preloadDesired}
                          status={image.preloadStatus}
                          compact
                        />
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation()
                            onRemoveCustomImage(image.id)
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              event.stopPropagation()
                              onRemoveCustomImage(image.id)
                            }
                          }}
                          className="rounded-lg px-2 py-1 text-[11px] text-rose-200 hover:bg-rose-400/10"
                        >
                          移除
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
              <div className="mt-4 flex flex-col gap-3 border-t border-white/8 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-slate-500">
                  第 {effectiveCustomImagePage} / {customImagePageCount} 页
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={effectiveCustomImagePage <= 1}
                    onClick={() => setCustomImagePage(Math.max(1, effectiveCustomImagePage - 1))}
                  >
                    上一页
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={effectiveCustomImagePage >= customImagePageCount}
                    onClick={() => setCustomImagePage(Math.min(customImagePageCount, effectiveCustomImagePage + 1))}
                  >
                    下一页
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>

        <PythonPackageProbePanel
          probeError={probeError}
          probeResult={probeResult}
          probing={probing}
          runningSandboxes={runningSandboxes}
          selectedSandboxId={effectiveProbeSandboxId}
          onChangeSandbox={setSelectedProbeSandboxId}
          onProbe={() => {
            if (effectiveProbeSandboxId) {
              onProbe(effectiveProbeSandboxId)
            }
          }}
        />
      </div>
    </div>
  )
}
