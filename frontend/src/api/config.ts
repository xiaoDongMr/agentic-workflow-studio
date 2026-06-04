import { http } from '@/api/http'

export interface ModelOption {
  name: string
  displayName?: string | null
  description?: string | null
  supportsThinking: boolean
  supportsReasoningEffort: boolean
  supportsVision: boolean
  maxTokens?: number | null
  timeoutSeconds?: number | null
}

interface ModelOptionDto {
  name: string
  display_name?: string | null
  description?: string | null
  supports_thinking: boolean
  supports_reasoning_effort?: boolean
  supports_vision: boolean
  max_tokens?: number | null
  timeout?: number | null
}

interface ModelOptionsResponse {
  models: ModelOptionDto[]
}

function toModelOption(model: ModelOptionDto): ModelOption {
  return {
    name: model.name,
    displayName: model.display_name,
    description: model.description,
    supportsThinking: model.supports_thinking,
    supportsReasoningEffort: model.supports_reasoning_effort ?? false,
    supportsVision: model.supports_vision,
    maxTokens: model.max_tokens ?? null,
    timeoutSeconds: model.timeout ?? null,
  }
}

export async function listModelOptions(): Promise<ModelOption[]> {
  const { data } = await http.get<ModelOptionsResponse>('/config/models')
  return data.models.map(toModelOption)
}
