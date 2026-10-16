import { record as jsonRecord, type JsonRecord } from '../../shared/codex-rollout-jsonl-cursor'
import { ensureNumber, extractString } from '../usage/usage-record-coercion'
import type { AntigravityUsageParsedEvent } from './types'

export type AntigravityUsageParseContext = {
  sessionId: string
  cwd: string | null
  currentModel: string | null
}

const MODEL_SELECTION_CHANGE = /setting `Model Selection` from .*? to (.+?)\. No need/

function parseRecord(line: string): JsonRecord | undefined {
  try {
    return jsonRecord(JSON.parse(line))
  } catch {
    return undefined
  }
}

function timestampIso(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function parseAntigravityUsageLine(
  line: string,
  context: AntigravityUsageParseContext
): AntigravityUsageParsedEvent | null {
  const hasUsage = line.includes('"output_tokens"')
  if (!hasUsage && !line.includes('Model Selection')) {
    return null
  }
  const record = parseRecord(line)
  if (!record) {
    return null
  }
  const content = extractString(record.content)
  const selected = content ? MODEL_SELECTION_CHANGE.exec(content)?.[1]?.trim() : undefined
  if (selected) {
    context.currentModel = selected
  }
  if (!hasUsage || record.source !== 'MODEL') {
    return null
  }
  const timestamp = timestampIso(record.created_at)
  if (!timestamp) {
    return null
  }
  const cachedInputTokens = ensureNumber(record.cache_read_tokens)
  const inputTokens = ensureNumber(record.input_tokens) + cachedInputTokens
  const outputTokens = ensureNumber(record.output_tokens)
  const totalTokens = inputTokens + outputTokens
  if (totalTokens === 0) {
    return null
  }
  return {
    sessionId: context.sessionId,
    timestamp,
    model: context.currentModel,
    cwd: context.cwd,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens: 0,
    totalTokens
  }
}
