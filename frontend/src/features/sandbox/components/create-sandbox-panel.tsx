import type { FormEvent } from 'react'
import { LoaderCircle, Plus, SlidersHorizontal, Sparkles } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SearchableSelect } from '@/features/sandbox/components/searchable-select'
import type { SandboxImageCapability } from '@/features/sandbox/sandbox-image-capabilities'
import type { CreateSandboxFormState } from '@/features/sandbox/sandbox-pool-types'
import { formInputClassName } from '@/features/sandbox/sandbox-pool-utils'
import { cn } from '@/lib/utils'

export function CreateSandboxPanel({
  value,
  images,
  selectedImageId,
  creating,
  disabled,
  showAdvanced,
  onChange,
  onSelectImage,
  onSubmit,
  onGenerateId,
  onToggleAdvanced,
}: {
  value: CreateSandboxFormState
  images: SandboxImageCapability[]
  selectedImageId: string
  creating: boolean
  disabled: boolean
  showAdvanced: boolean
  onChange: (nextValue: CreateSandboxFormState) => void
  onSelectImage: (imageId: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onGenerateId: () => void
  onToggleAdvanced: () => void
}) {
  const customImages = images.filter((image) => image.source === 'custom' && !image.default)
  const selectedImage = customImages.find((image) => image.id === selectedImageId) ?? customImages[0]

  return (
    <section className="rounded-3xl border border-white/8 bg-white/[0.035] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-white">创建沙箱</h3>
          <p className="mt-1 text-sm text-slate-500">基于选中的运行镜像创建一个 AioSandbox 实例。</p>
        </div>
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-blue-300/18 bg-blue-400/10 text-blue-200">
          <Plus className="h-4 w-4" />
        </span>
      </div>

      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <label className="block">
          <span className="text-xs font-medium text-slate-400">运行镜像</span>
          <SearchableSelect
            value={selectedImageId}
            onChange={(imageId) => {
              const nextImage = images.find((item) => item.id === imageId)
              onSelectImage(imageId)
              onChange({ ...value, image: nextImage?.default ? '' : nextImage?.image ?? '' })
            }}
            disabled={disabled || creating}
            className="mt-1.5"
            searchPlaceholder="搜索镜像名称或地址"
            options={images.map((image) => ({
              value: image.id,
              label: `${image.name} ${image.default ? '(默认)' : image.source === 'custom' ? '(自定义)' : ''}`,
              description: image.image,
            }))}
          />
        </label>

        <div className="rounded-2xl border border-white/8 bg-slate-950/42 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-100">{selectedImage?.name ?? '资源池默认镜像'}</div>
              <div className="mt-1 break-all font-mono text-xs text-slate-500">{selectedImage?.image ?? '-'}</div>
            </div>
            <Badge className="shrink-0 rounded-xl border-blue-300/18 bg-blue-400/10 px-2.5 py-1 text-blue-100">
              {selectedImage?.default ? '默认' : '自定义'}
            </Badge>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <label className="block">
            <span className="text-xs font-medium text-slate-400">沙箱 ID</span>
            <input
              value={value.sandboxId}
              readOnly
              disabled={disabled}
              className={cn(
                formInputClassName('mt-1.5 cursor-default font-mono text-xs'),
                'disabled:cursor-not-allowed disabled:opacity-60',
              )}
            />
          </label>
          <Button
            type="button"
            variant="secondary"
            onClick={onGenerateId}
            disabled={disabled || creating}
            className="h-10 w-full md:w-auto"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            重生成
          </Button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" variant="secondary" onClick={onToggleAdvanced} disabled={disabled || creating} className="shrink-0">
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            {showAdvanced ? '收起高级配置' : '高级配置'}
          </Button>
          <Button type="submit" disabled={disabled || creating || !value.sandboxId.trim()} className="h-10 shrink-0">
            {creating ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            {creating ? '创建中' : '创建沙箱'}
          </Button>
        </div>

        {showAdvanced ? (
          <div className="rounded-[24px] border border-white/8 bg-slate-950/45 p-4">
            <div className="flex flex-col gap-2 border-b border-white/8 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-sm font-semibold text-white">运行参数</h4>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  仅用于临时调试、验证新镜像或排查运行问题。普通创建建议保持为空。
                </p>
              </div>
              <Badge className="w-fit rounded-xl border-amber-400/18 bg-amber-400/10 px-2.5 py-1 text-amber-100">
                可选
              </Badge>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <label className="block rounded-2xl border border-white/8 bg-white/[0.035] p-3 lg:col-span-2">
                <span className="text-xs font-medium text-slate-300">临时镜像覆盖</span>
                <p className="mt-1 text-xs text-slate-500">一般不需要填写。仅用于排查镜像问题，优先使用上方已登记镜像。</p>
                <input
                  value={value.image}
                  onChange={(event) => onChange({ ...value, image: event.target.value })}
                  placeholder="例如：registry.example.com/aio-sandbox:debug"
                  disabled={disabled || creating}
                  className={cn(formInputClassName('mt-3 font-mono text-xs'), 'disabled:cursor-not-allowed disabled:opacity-60')}
                />
              </label>

              <label className="block rounded-2xl border border-white/8 bg-white/[0.035] p-3">
                <span className="text-xs font-medium text-slate-300">环境变量</span>
                <p className="mt-1 text-xs text-slate-500">传入容器启动参数，每行一组 KEY=VALUE。</p>
                <textarea
                  rows={4}
                  value={value.envText}
                  onChange={(event) => onChange({ ...value, envText: event.target.value })}
                  placeholder={'LOG_LEVEL=debug\nFEATURE_FLAG=true'}
                  disabled={disabled || creating}
                  className={cn(
                    formInputClassName('mt-3 resize-none font-mono text-xs'),
                    'disabled:cursor-not-allowed disabled:opacity-60',
                  )}
                />
              </label>

              <label className="block rounded-2xl border border-white/8 bg-white/[0.035] p-3">
                <span className="text-xs font-medium text-slate-300">资源标签</span>
                <p className="mt-1 text-xs text-slate-500">追加到 Kubernetes labels，用于筛选和归类。</p>
                <textarea
                  rows={4}
                  value={value.labelsText}
                  onChange={(event) => onChange({ ...value, labelsText: event.target.value })}
                  placeholder={'owner=team-a\npurpose=debug'}
                  disabled={disabled || creating}
                  className={cn(
                    formInputClassName('mt-3 resize-none font-mono text-xs'),
                    'disabled:cursor-not-allowed disabled:opacity-60',
                  )}
                />
              </label>
            </div>
          </div>
        ) : null}
      </form>
    </section>
  )
}
