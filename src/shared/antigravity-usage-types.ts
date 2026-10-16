export type AntigravityUsageScope = 'orca' | 'all'
export type AntigravityUsageRange = '7d' | '30d' | '90d' | 'all'
export type AntigravityUsageBreakdownKind = 'model' | 'project'

export type AntigravityUsageScanState = {
  enabled: boolean
  isScanning: boolean
  lastScanStartedAt: number | null
  lastScanCompletedAt: number | null
  lastScanError: string | null
  hasAnyAntigravityData: boolean
}

type AntigravityUsageTokenTotals = {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  totalTokens: number
}

export type AntigravityUsageSummary = AntigravityUsageTokenTotals & {
  scope: AntigravityUsageScope
  range: AntigravityUsageRange
  sessions: number
  events: number
  topModel: string | null
  topProject: string | null
  hasAnyAntigravityData: boolean
}

export type AntigravityUsageDailyPoint = AntigravityUsageTokenTotals & {
  day: string
}

export type AntigravityUsageBreakdownRow = AntigravityUsageTokenTotals & {
  key: string
  label: string
  sessions: number
  events: number
}

export type AntigravityUsageSessionRow = AntigravityUsageTokenTotals & {
  sessionId: string
  lastActiveAt: string
  durationMinutes: number
  projectLabel: string
  model: string | null
  events: number
}

export type AntigravityUsageSnapshot = {
  scanState: AntigravityUsageScanState
  summary: AntigravityUsageSummary
  daily: AntigravityUsageDailyPoint[]
  modelBreakdown: AntigravityUsageBreakdownRow[]
  projectBreakdown: AntigravityUsageBreakdownRow[]
  recentSessions: AntigravityUsageSessionRow[]
}
