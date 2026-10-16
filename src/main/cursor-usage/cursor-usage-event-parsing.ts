import { record } from '../../shared/codex-rollout-jsonl-cursor'
import { ensureNumber, extractString } from '../usage/usage-record-coercion'
import type { CursorUsageEvent } from './types'

function parseTimestamp(value: unknown): string | null {
  const ms = typeof value === 'string' ? Number(value) : value
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) {
    return null
  }
  return new Date(ms).toISOString()
}

export function parseCursorUsageEvent(value: unknown): CursorUsageEvent | null {
  const raw = record(value)
  const usage = record(raw?.tokenUsage)
  const timestamp = parseTimestamp(raw?.timestamp)
  if (!raw || !usage || !timestamp) {
    return null
  }
  const cacheReadTokens = ensureNumber(usage.cacheReadTokens)
  const cacheWriteInputTokens = ensureNumber(usage.cacheWriteTokens)
  const cachedInputTokens = cacheReadTokens + cacheWriteInputTokens
  const inputTokens = ensureNumber(usage.inputTokens) + cachedInputTokens
  const outputTokens = ensureNumber(usage.outputTokens)
  const totalTokens = inputTokens + outputTokens
  if (totalTokens <= 0) {
    return null
  }
  const cents = ensureNumber(usage.totalCents) || ensureNumber(raw.chargedCents)
  const conversationId = extractString(raw.conversationId) ?? 'unknown'
  const model = extractString(raw.model)
  return {
    key: [timestamp, conversationId, model, inputTokens, outputTokens].join(':'),
    conversationId,
    timestamp,
    model,
    inputTokens,
    cachedInputTokens,
    cacheWriteInputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd: cents > 0 ? cents / 100 : null
  }
}
