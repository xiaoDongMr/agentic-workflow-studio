import { http } from '@/api/http'

export type SandboxStatus = 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Unknown'

export interface SandboxSummary {
  sandboxId: string
  sandboxUrl: string
  status: SandboxStatus
  podName: string
  serviceName: string
  ingressName: string
  namespace: string
  nodeName: string
  podIp: string
  createdAt: string
  threadId: string
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

interface SandboxSummaryDto {
  sandbox_id: string
  sandbox_url?: string
  status?: SandboxStatus
  pod_name?: string
  service_name?: string
  ingress_name?: string
  namespace?: string
  node_name?: string
  pod_ip?: string
  created_at?: string
  thread_id?: string
  labels?: Record<string, string>
}

interface SandboxListResponseDto {
  sandboxes: SandboxSummaryDto[]
}

interface SandboxPoolHealthDto {
  backend: SandboxPoolHealth['backend']
  namespace: string
  client: string
  enabled: boolean
  extra?: SandboxPoolHealth['extra']
}

function toSandboxSummary(item: SandboxSummaryDto): SandboxSummary {
  return {
    sandboxId: item.sandbox_id,
    sandboxUrl: item.sandbox_url ?? '',
    status: item.status ?? 'Unknown',
    podName: item.pod_name ?? '',
    serviceName: item.service_name ?? '',
    ingressName: item.ingress_name ?? '',
    namespace: item.namespace ?? '',
    nodeName: item.node_name ?? '',
    podIp: item.pod_ip ?? '',
    createdAt: item.created_at ?? '',
    threadId: item.thread_id ?? '',
    labels: item.labels ?? {},
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

export async function getSandboxPoolHealth(): Promise<SandboxPoolHealth> {
  const { data } = await http.get<SandboxPoolHealthDto>('/sandbox-pool/health')
  return toSandboxPoolHealth(data)
}

export async function listSandboxes(): Promise<SandboxSummary[]> {
  const { data } = await http.get<SandboxListResponseDto>('/sandboxes')
  return data.sandboxes.map(toSandboxSummary)
}

export async function deleteSandbox(sandboxId: string): Promise<void> {
  await http.delete(`/sandboxes/${encodeURIComponent(sandboxId)}`)
}
