import { http } from '@/api/http'

export type SandboxStatus = 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Unknown'

export interface SandboxSummary {
  sandboxId: string
  sandboxUrl: string
  status: SandboxStatus
  imageId: string
  image: string
  podName: string
  serviceName: string
  ingressName: string
  namespace: string
  nodeName: string
  podIp: string
  createdAt: string
  labels: Record<string, string>
}

export interface SandboxPoolHealth {
  backend: 'kubernetes_api'
  namespace: string
  client: string
  enabled: boolean
  extra: {
    clientVersion?: unknown
    error?: string
    [key: string]: unknown
  }
}

export interface SandboxCreateRequest {
  sandboxId: string
  imageId?: string
  image?: string
  env?: Record<string, string>
  labels?: Record<string, string>
}

export interface SandboxListRequest {
  limit?: number
  continueToken?: string
  status?: SandboxStatus | ''
  imageId?: string
  sandboxId?: string
}

export interface SandboxListResult {
  sandboxes: SandboxSummary[]
  continueToken: string
  remainingItemCount: number | null
  limit: number
}

export type SandboxImageSource = 'builtin' | 'custom'

export interface SandboxImageSummary {
  id: string
  name: string
  image: string
  digest: string
  source: SandboxImageSource
  status: string
  description: string
  pythonVersion: string
  capabilityManifest: {
    tools?: string[]
    runtimes?: string[]
    capabilities?: string[]
    limits?: string[]
    [key: string]: unknown
  }
  isDefault: boolean
  createdAt: string
  updatedAt: string
  preloadStatus: string
  preloadReady: number
  preloadDesired: number
  preloadMessage: string
}

export interface SandboxImageCreateRequest {
  name: string
  image: string
  digest?: string
  description?: string
  pythonVersion?: string
  capabilityManifest?: SandboxImageSummary['capabilityManifest']
}

export interface SandboxPythonPackage {
  name: string
  version: string
}

export interface SandboxPythonProbeResult {
  sandboxId: string
  sandboxUrl: string
  pythonVersion: string
  packageCount: number
  packages: SandboxPythonPackage[]
  rawOutput: string
}

interface SandboxSummaryDto {
  sandbox_id: string
  sandbox_url?: string
  status?: SandboxStatus
  image_id?: string
  image?: string
  pod_name?: string
  service_name?: string
  ingress_name?: string
  namespace?: string
  node_name?: string
  pod_ip?: string
  created_at?: string
  labels?: Record<string, string>
}

interface SandboxListResponseDto {
  sandboxes: SandboxSummaryDto[]
  continue_token?: string
  remaining_item_count?: number | null
  limit?: number
}

interface SandboxPoolHealthDto {
  backend: SandboxPoolHealth['backend']
  namespace: string
  client: string
  enabled: boolean
  extra?: SandboxPoolHealth['extra']
}

interface SandboxCreateRequestDto {
  sandbox_id: string
  image_id?: string
  image?: string
  env?: Record<string, string>
  labels?: Record<string, string>
}

interface SandboxImageSummaryDto {
  id: string
  name: string
  image: string
  digest?: string
  source?: SandboxImageSource
  status?: string
  description?: string
  python_version?: string
  capability_manifest?: SandboxImageSummary['capabilityManifest']
  is_default?: boolean
  created_at?: string
  updated_at?: string
  preload_status?: string
  preload_ready?: number
  preload_desired?: number
  preload_message?: string
}

interface SandboxImageListResponseDto {
  images: SandboxImageSummaryDto[]
}

interface SandboxImageCreateRequestDto {
  name: string
  image: string
  digest?: string
  description?: string
  python_version?: string
  capability_manifest?: SandboxImageSummary['capabilityManifest']
}

interface SandboxPythonPackageDto {
  name: string
  version: string
}

interface SandboxPythonProbeResultDto {
  sandbox_id: string
  sandbox_url?: string
  python_version?: string
  package_count?: number
  packages?: SandboxPythonPackageDto[]
  raw_output?: string
}

function toSandboxSummary(item: SandboxSummaryDto): SandboxSummary {
  return {
    sandboxId: item.sandbox_id,
    sandboxUrl: item.sandbox_url ?? '',
    status: item.status ?? 'Unknown',
    imageId: item.image_id ?? '',
    image: item.image ?? '',
    podName: item.pod_name ?? '',
    serviceName: item.service_name ?? '',
    ingressName: item.ingress_name ?? '',
    namespace: item.namespace ?? '',
    nodeName: item.node_name ?? '',
    podIp: item.pod_ip ?? '',
    createdAt: item.created_at ?? '',
    labels: item.labels ?? {},
  }
}

function toSandboxImageSummary(item: SandboxImageSummaryDto): SandboxImageSummary {
  return {
    id: item.id,
    name: item.name,
    image: item.image,
    digest: item.digest ?? '',
    source: item.source ?? 'custom',
    status: item.status ?? 'active',
    description: item.description ?? '',
    pythonVersion: item.python_version ?? '',
    capabilityManifest: item.capability_manifest ?? {},
    isDefault: Boolean(item.is_default),
    createdAt: item.created_at ?? '',
    updatedAt: item.updated_at ?? '',
    preloadStatus: item.preload_status ?? '',
    preloadReady: item.preload_ready ?? 0,
    preloadDesired: item.preload_desired ?? 0,
    preloadMessage: item.preload_message ?? '',
  }
}

function toSandboxPoolHealth(item: SandboxPoolHealthDto): SandboxPoolHealth {
  return {
    backend: item.backend,
    namespace: item.namespace,
    client: item.client,
    enabled: item.enabled,
    extra: item.extra ?? {},
  }
}

function toSandboxPythonProbeResult(item: SandboxPythonProbeResultDto): SandboxPythonProbeResult {
  const packages = item.packages ?? []
  return {
    sandboxId: item.sandbox_id,
    sandboxUrl: item.sandbox_url ?? '',
    pythonVersion: item.python_version ?? '',
    packageCount: item.package_count ?? packages.length,
    packages: packages.map((packageItem) => ({
      name: packageItem.name,
      version: packageItem.version,
    })),
    rawOutput: item.raw_output ?? '',
  }
}

export async function getSandboxPoolHealth(): Promise<SandboxPoolHealth> {
  const { data } = await http.get<SandboxPoolHealthDto>('/sandbox-pool/health')
  return toSandboxPoolHealth(data)
}

export async function listSandboxes(request: SandboxListRequest = {}): Promise<SandboxListResult> {
  const params: Record<string, string | number> = {}
  if (request.limit) {
    params.limit = request.limit
  }
  if (request.continueToken) {
    params.continue = request.continueToken
  }
  if (request.status) {
    params.status = request.status
  }
  if (request.imageId) {
    params.image_id = request.imageId
  }
  if (request.sandboxId) {
    params.sandbox_id = request.sandboxId
  }

  const { data } = await http.get<SandboxListResponseDto>('/sandboxes', { params })
  return {
    sandboxes: data.sandboxes.map(toSandboxSummary),
    continueToken: data.continue_token ?? '',
    remainingItemCount: data.remaining_item_count ?? null,
    limit: data.limit ?? request.limit ?? data.sandboxes.length,
  }
}

export async function createSandbox(request: SandboxCreateRequest): Promise<SandboxSummary> {
  const payload: SandboxCreateRequestDto = {
    sandbox_id: request.sandboxId,
  }
  if (request.imageId) {
    payload.image_id = request.imageId
  }
  if (request.image) {
    payload.image = request.image
  }
  if (request.env && Object.keys(request.env).length > 0) {
    payload.env = request.env
  }
  if (request.labels && Object.keys(request.labels).length > 0) {
    payload.labels = request.labels
  }
  const { data } = await http.post<SandboxSummaryDto>('/sandboxes', payload)
  return toSandboxSummary(data)
}

export async function listSandboxImages(): Promise<SandboxImageSummary[]> {
  const { data } = await http.get<SandboxImageListResponseDto>('/sandbox-images')
  return data.images.map(toSandboxImageSummary)
}

export async function createSandboxImage(request: SandboxImageCreateRequest): Promise<SandboxImageSummary[]> {
  const payload: SandboxImageCreateRequestDto = {
    name: request.name,
    image: request.image,
  }
  if (request.digest) {
    payload.digest = request.digest
  }
  if (request.description) {
    payload.description = request.description
  }
  if (request.pythonVersion) {
    payload.python_version = request.pythonVersion
  }
  if (request.capabilityManifest) {
    payload.capability_manifest = request.capabilityManifest
  }
  const { data } = await http.post<SandboxImageListResponseDto>('/sandbox-images', payload)
  return data.images.map(toSandboxImageSummary)
}

export async function deleteSandboxImage(imageId: string): Promise<SandboxImageSummary[]> {
  const { data } = await http.delete<SandboxImageListResponseDto>(`/sandbox-images/${encodeURIComponent(imageId)}`)
  return data.images.map(toSandboxImageSummary)
}

export async function deleteSandbox(sandboxId: string): Promise<void> {
  await http.delete(`/sandboxes/${encodeURIComponent(sandboxId)}`)
}

export async function getSandbox(sandboxId: string): Promise<SandboxSummary> {
  const { data } = await http.get<SandboxSummaryDto>(`/sandboxes/${encodeURIComponent(sandboxId)}`)
  return toSandboxSummary(data)
}

export async function probeSandboxPythonPackages(sandboxId: string): Promise<SandboxPythonProbeResult> {
  const { data } = await http.post<SandboxPythonProbeResultDto>(
    `/sandboxes/${encodeURIComponent(sandboxId)}/python-packages/probe`,
  )
  return toSandboxPythonProbeResult(data)
}
