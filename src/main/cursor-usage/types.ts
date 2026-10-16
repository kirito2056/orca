import type {
  UsageDailyAggregate,
  UsageLocationBreakdown,
  UsageLocationModelBreakdown,
  UsageModelBreakdown,
  UsageSession
} from '../usage/usage-rollup-records'

export type CursorUsageMetric = {
  estimatedCostUsd: number | null
  cacheWriteInputTokens?: number
}

export type CursorUsageLocationBreakdown = UsageLocationBreakdown<CursorUsageMetric>
export type CursorUsageModelBreakdown = UsageModelBreakdown<CursorUsageMetric>
export type CursorUsageLocationModelBreakdown = UsageLocationModelBreakdown<CursorUsageMetric>
export type CursorUsageSession = UsageSession<CursorUsageMetric>
export type CursorUsageDailyAggregate = UsageDailyAggregate<CursorUsageMetric>

export type CursorUsageEvent = {
  key: string
  conversationId: string
  timestamp: string
  model: string | null
  inputTokens: number
  cachedInputTokens: number
  cacheWriteInputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCostUsd: number | null
}

export type CursorUsagePersistedState = {
  schemaVersion: number
  worktreeFingerprint: string | null
  processedEvents: CursorUsageEvent[]
  sessions: CursorUsageSession[]
  dailyAggregates: CursorUsageDailyAggregate[]
  scanState: {
    enabled: boolean
    lastScanStartedAt: number | null
    lastScanCompletedAt: number | null
    lastScanError: string | null
  }
}

export type CursorUsageParsedEvent = {
  sessionId: string
  timestamp: string
  model: string | null
  cwd: string | null
  estimatedCostUsd: number | null
  inputTokens: number
  cachedInputTokens: number
  cacheWriteInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  totalTokens: number
}

export type CursorUsageAttributedEvent = CursorUsageParsedEvent & {
  day: string
  projectKey: string
  projectLabel: string
  repoId: string | null
  worktreeId: string | null
}
