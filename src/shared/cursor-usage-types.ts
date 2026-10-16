export type CursorUsageScope = 'orca' | 'all'
export type CursorUsageRange = '7d' | '30d' | '90d' | 'all'
export type CursorUsageBreakdownKind = 'model' | 'project'

export type CursorUsageScanState = {
  enabled: boolean
  isScanning: boolean
  lastScanStartedAt: number | null
  lastScanCompletedAt: number | null
  lastScanError: string | null
  hasAnyCursorData: boolean
}

export type CursorUsageSummary = {
  scope: CursorUsageScope
  range: CursorUsageRange
  sessions: number
  events: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  totalTokens: number
  estimatedCostUsd: number | null
  topModel: string | null
  topProject: string | null
  hasAnyCursorData: boolean
}

export type CursorUsageDailyPoint = {
  day: string
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  totalTokens: number
}

export type CursorUsageBreakdownRow = {
  key: string
  label: string
  sessions: number
  events: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  totalTokens: number
  estimatedCostUsd: number | null
}

export type CursorUsageSessionRow = {
  sessionId: string
  lastActiveAt: string
  durationMinutes: number
  projectLabel: string
  model: string | null
  events: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  totalTokens: number
}

export type CursorUsageSnapshot = {
  scanState: CursorUsageScanState
  summary: CursorUsageSummary
  daily: CursorUsageDailyPoint[]
  modelBreakdown: CursorUsageBreakdownRow[]
  projectBreakdown: CursorUsageBreakdownRow[]
  recentSessions: CursorUsageSessionRow[]
}
