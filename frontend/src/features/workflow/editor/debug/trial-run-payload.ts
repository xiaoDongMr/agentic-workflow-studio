import type { GlobalDebugFieldValue } from '@/features/workflow/editor/workflow-editor.types'

export interface SingleNodeTrialCache {
  fields: GlobalDebugFieldValue[]
  jsonMode: boolean
  combinedJson: string
}

export function safeParseJsonField(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return {}
  }
}

export function buildDebugPayloadFromFields(fields: GlobalDebugFieldValue[]) {
  return buildPayloadFromFieldEntries(fields)
}

export function buildDebugPayloadFromCombinedJson(value: string) {
  const parsed = JSON.parse(value) as Record<string, unknown>
  const firstObjectField = Object.values(parsed).find(
    (fieldValue) => typeof fieldValue === 'object' && fieldValue !== null && !Array.isArray(fieldValue),
  )

  if (firstObjectField && typeof firstObjectField === 'object') {
    return {
      ...parsed,
      ...(firstObjectField as Record<string, unknown>),
    }
  }

  return parsed
}

export function buildPayloadFromFieldEntries(fields: GlobalDebugFieldValue[]) {
  return Object.fromEntries(
    fields.map((field) => [
      field.name,
      field.type === 'json'
        ? safeParseJsonField(field.value)
        : field.type.endsWith('-array')
          ? parseArrayFieldValue(field.value)
          : field.value,
    ]),
  )
}

export function syncCombinedJsonWithFields(combinedJson: string, fields: GlobalDebugFieldValue[]) {
  const parsed = parseJsonObject(combinedJson)
  if (!parsed) {
    return JSON.stringify(buildPayloadFromFieldEntries(fields), null, 2)
  }
  const fieldPayload = buildPayloadFromFieldEntries(fields)
  const nextPayload = Object.fromEntries(
    fields.map((field) => [
      field.name,
      Object.prototype.hasOwnProperty.call(parsed, field.name)
        ? parsed[field.name]
        : fieldPayload[field.name],
    ]),
  )
  return JSON.stringify(nextPayload, null, 2)
}

function parseArrayFieldValue(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return value.split('\n').map((item) => item.trim()).filter(Boolean)
  }
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}
