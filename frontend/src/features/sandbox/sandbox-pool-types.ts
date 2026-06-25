import type { SandboxStatus } from '@/api/sandbox-pool'

export interface CreateSandboxFormState {
  sandboxId: string
  image: string
  envText: string
  labelsText: string
}

export interface CustomImageFormState {
  name: string
  image: string
  description: string
}

export type SandboxPoolTab = 'images' | 'sandboxes'

export interface SandboxStatusFilterOption {
  value: SandboxStatus | ''
  label: string
}
