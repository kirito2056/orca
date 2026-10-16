import { highestUsageKey } from '../usage/highest-usage-key'
import type {
  CursorUsageBreakdownKind,
  CursorUsageBreakdownRow,
  CursorUsageDailyPoint,
  CursorUsageRange,
  CursorUsageScope,
  CursorUsageSessionRow,
  CursorUsageSummary
} from '../../shared/cursor-usage-types'
import type { CursorUsageDailyAggregate, CursorUsageSession } from './types'

function addCost(left: number | null, right: number | null): number | null {
  if (left === null && right === null) {
    return null
  }
  return (left ?? 0) + (right ?? 0)
}

export function buildCursorUsageSummary(
  scope: CursorUsageScope,
  range: CursorUsageRange,
  filteredDaily: CursorUsageDailyAggregate[],
  filteredSessions: CursorUsageSession[]
): CursorUsageSummary {
  let inputTokens = 0
  let cachedInputTokens = 0
  let outputTokens = 0
  let reasoningOutputTokens = 0
  let totalTokens = 0
  let events = 0
  let estimatedCostUsd: number | null = null
  const byModel = new Map<string, number>()
  const byProject = new Map<string, number>()

  for (const row of filteredDaily) {
    inputTokens += row.inputTokens
    cachedInputTokens += row.cachedInputTokens
    outputTokens += row.outputTokens
    reasoningOutputTokens += row.reasoningOutputTokens
    totalTokens += row.totalTokens
    events += row.eventCount
    estimatedCostUsd = addCost(estimatedCostUsd, row.estimatedCostUsd)
    byModel.set(
      row.model ?? 'Unknown model',
      (byModel.get(row.model ?? 'Unknown model') ?? 0) + row.totalTokens
    )
    byProject.set(row.projectLabel, (byProject.get(row.projectLabel) ?? 0) + row.totalTokens)
  }

  const topModel = highestUsageKey(byModel)
  const topProject = highestUsageKey(byProject)

  return {
    scope,
    range,
    sessions: filteredSessions.length,
    events,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens,
    totalTokens,
    estimatedCostUsd,
    topModel,
    topProject,
    hasAnyCursorData: filteredSessions.length > 0 || filteredDaily.length > 0
  }
}

export function buildCursorUsageDailyPoints(
  filteredDaily: CursorUsageDailyAggregate[]
): CursorUsageDailyPoint[] {
  const byDay = new Map<string, CursorUsageDailyPoint>()
  for (const row of filteredDaily) {
    const existing = byDay.get(row.day) ?? {
      day: row.day,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0
    }
    existing.inputTokens += row.inputTokens
    existing.cachedInputTokens += row.cachedInputTokens
    existing.outputTokens += row.outputTokens
    existing.reasoningOutputTokens += row.reasoningOutputTokens
    existing.totalTokens += row.totalTokens
    byDay.set(row.day, existing)
  }
  return [...byDay.values()].sort((left, right) => left.day.localeCompare(right.day))
}

export function buildCursorUsageBreakdownRows(
  kind: CursorUsageBreakdownKind,
  filteredDaily: CursorUsageDailyAggregate[],
  filteredSessions: CursorUsageSession[]
): CursorUsageBreakdownRow[] {
  const rows = new Map<string, CursorUsageBreakdownRow>()

  for (const daily of filteredDaily) {
    const key = kind === 'model' ? (daily.model ?? 'unknown') : daily.projectKey
    const label = kind === 'model' ? (daily.model ?? 'Unknown model') : daily.projectLabel
    const existing = rows.get(key) ?? {
      key,
      label,
      sessions: 0,
      events: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: null
    }
    existing.events += daily.eventCount
    existing.inputTokens += daily.inputTokens
    existing.cachedInputTokens += daily.cachedInputTokens
    existing.outputTokens += daily.outputTokens
    existing.reasoningOutputTokens += daily.reasoningOutputTokens
    existing.totalTokens += daily.totalTokens
    existing.estimatedCostUsd = addCost(existing.estimatedCostUsd, daily.estimatedCostUsd)
    rows.set(key, existing)
  }

  if (kind === 'model') {
    for (const session of filteredSessions) {
      for (const entry of session.modelBreakdown) {
        const row = rows.get(entry.modelKey)
        if (row) {
          row.sessions++
        }
      }
    }
  } else {
    for (const session of filteredSessions) {
      for (const entry of session.locationBreakdown) {
        const row = rows.get(entry.locationKey)
        if (row) {
          row.sessions++
        }
      }
    }
  }

  return [...rows.values()].sort((left, right) => right.totalTokens - left.totalTokens)
}

export function buildCursorUsageRecentSessions(
  filteredSessions: CursorUsageSession[],
  limit = 10
): CursorUsageSessionRow[] {
  return filteredSessions.slice(0, limit).map((session): CursorUsageSessionRow => ({
    sessionId: session.sessionId,
    lastActiveAt: session.lastTimestamp,
    durationMinutes: Math.max(
      0,
      Math.round(
        (new Date(session.lastTimestamp).getTime() - new Date(session.firstTimestamp).getTime()) /
          60_000
      )
    ),
    projectLabel: session.primaryProjectLabel,
    model: session.primaryModel,
    events: session.eventCount,
    inputTokens: session.totalInputTokens,
    cachedInputTokens: session.totalCachedInputTokens,
    outputTokens: session.totalOutputTokens,
    reasoningOutputTokens: session.totalReasoningOutputTokens,
    totalTokens: session.totalTokens
  }))
}
