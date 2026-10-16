import type {
  UsageDailyAggregate,
  UsageLocationBreakdown,
  UsageLocationModelBreakdown,
  UsageModelBreakdown,
  UsageSession
} from '../usage/usage-rollup-records'

export type AntigravityUsageMetric = Record<never, never>

export type AntigravityUsageLocationBreakdown = UsageLocationBreakdown<AntigravityUsageMetric>
export type AntigravityUsageModelBreakdown = UsageModelBreakdown<AntigravityUsageMetric>
export type AntigravityUsageLocationModelBreakdown =
  UsageLocationModelBreakdown<AntigravityUsageMetric>
export type AntigravityUsageSession = UsageSession<AntigravityUsageMetric>
export type AntigravityUsageDailyAggregate = UsageDailyAggregate<AntigravityUsageMetric>

export type AntigravityUsageProcessedFile = {
  path: string
  mtimeMs: number
  size: number
}

export type AntigravityUsagePersistedFile = AntigravityUsageProcessedFile & {
  sessions: AntigravityUsageSession[]
  dailyAggregates: AntigravityUsageDailyAggregate[]
  sessionCwd: string | null
}

export type AntigravityUsagePersistedState = {
  schemaVersion: number
  worktreeFingerprint: string | null
  processedFiles: AntigravityUsagePersistedFile[]
  sessions: AntigravityUsageSession[]
  dailyAggregates: AntigravityUsageDailyAggregate[]
  scanState: {
    enabled: boolean
    lastScanStartedAt: number | null
    lastScanCompletedAt: number | null
    lastScanError: string | null
  }
}

export type AntigravityUsageParsedEvent = {
  sessionId: string
  timestamp: string
  model: string | null
  cwd: string | null
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  totalTokens: number
}

export type AntigravityUsageAttributedEvent = AntigravityUsageParsedEvent & {
  day: string
  projectKey: string
  projectLabel: string
  repoId: string | null
  worktreeId: string | null
}
