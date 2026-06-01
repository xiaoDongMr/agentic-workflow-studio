import { http } from '@/api/http'

export interface ModelOption {
  name: string
  displayName?: string | null
  description?: string | null
  supportsThinking: boolean
  supportsVision: boolean
}

interface ModelOptionDto {
  name: string
  display_name?: string | null
  description?: string | null
  supports_thinking: boolean
  supports_vision: boolean
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
    supportsVision: model.supports_vision,
  }
}

export async function listModelOptions(): Promise<ModelOption[]> {
  const { data } = await http.get<ModelOptionsResponse>('/config/models')
  return data.models.map(toModelOption)
}
