import { attributeUsageEvent } from '../usage/usage-event-attribution'
import { createUsageEventAggregation } from '../usage/usage-event-aggregation'
import type { UsageScanWorktreeRef } from '../usage/usage-provider-contract'
import {
  readUsageSourceCache,
  writeUsageSourceCache,
  type UsageSourceCacheRef
} from '../usage/usage-source-cache-file'
import { createUsageWorktreeResolver } from '../usage/usage-worktree-resolver'
import { mapCursorConversationWorkspaces } from './cursor-conversation-workspaces'
import {
  createCursorUsagePageFetcher,
  fetchCursorUsageEvents,
  resolveCursorUsageSession,
  type CursorUsagePageFetcher
} from './cursor-usage-events-fetch'
import type {
  CursorUsageAttributedEvent,
  CursorUsageDailyAggregate,
  CursorUsageEvent,
  CursorUsageMetric,
  CursorUsageSession
} from './types'

const BACKFILL_START_MS = Date.UTC(2023, 0, 1)
const REFETCH_OVERLAP_MS = 24 * 60 * 60_000

function addCost(left: number | null, right: number | null): number | null {
  if (left === null && right === null) {
    return null
  }
  return (left ?? 0) + (right ?? 0)
}

export const cursorUsageAggregation = createUsageEventAggregation<
  CursorUsageAttributedEvent,
  CursorUsageMetric
>({
  metric: {
    empty: () => ({ estimatedCostUsd: null, cacheWriteInputTokens: 0 }),
    fromEvent: (event) => ({
      estimatedCostUsd: event.estimatedCostUsd,
      cacheWriteInputTokens: event.cacheWriteInputTokens
    }),
    fold: (target, source) => {
      target.estimatedCostUsd = addCost(target.estimatedCostUsd, source.estimatedCostUsd)
      target.cacheWriteInputTokens =
        (target.cacheWriteInputTokens ?? 0) + (source.cacheWriteInputTokens ?? 0)
    }
  },
  cloneSessionForMerge: (session) => structuredClone(session)
})

export function mergeCursorUsageEvents(
  previous: readonly CursorUsageEvent[],
  fetched: readonly CursorUsageEvent[]
): CursorUsageEvent[] {
  const byKey = new Map(previous.map((event) => [event.key, event]))
  for (const event of fetched) {
    byKey.set(event.key, event)
  }
  return [...byKey.values()].sort((left, right) => left.timestamp.localeCompare(right.timestamp))
}

export function cursorUsageFetchStartMs(events: readonly CursorUsageEvent[]): number {
  const latest = events.at(-1)
  return latest ? Date.parse(latest.timestamp) - REFETCH_OVERLAP_MS : BACKFILL_START_MS
}

export async function aggregateCursorUsageEvents(
  events: readonly CursorUsageEvent[],
  worktrees: UsageScanWorktreeRef[],
  chatsDir?: string
): Promise<{
  sessions: CursorUsageSession[]
  dailyAggregates: CursorUsageDailyAggregate[]
}> {
  const resolveWorktree = await createUsageWorktreeResolver(worktrees)
  const workspaces = await mapCursorConversationWorkspaces(worktrees, chatsDir)
  const attributed: CursorUsageAttributedEvent[] = []
  for (const event of events) {
    const result = attributeUsageEvent(
      {
        sessionId: event.conversationId,
        timestamp: event.timestamp,
        model: event.model,
        cwd: workspaces.get(event.conversationId) ?? null,
        estimatedCostUsd: event.estimatedCostUsd,
        inputTokens: event.inputTokens,
        cachedInputTokens: event.cachedInputTokens,
        cacheWriteInputTokens: event.cacheWriteInputTokens,
        outputTokens: event.outputTokens,
        reasoningOutputTokens: 0,
        totalTokens: event.totalTokens
      },
      resolveWorktree
    )
    if (result) {
      attributed.push(result)
    }
  }
  return cursorUsageAggregation.aggregate(attributed)
}

export async function scanCursorUsage(
  worktrees: UsageScanWorktreeRef[],
  sourceCache: UsageSourceCacheRef,
  fetchPage?: CursorUsagePageFetcher
): Promise<{
  sessions: CursorUsageSession[]
  dailyAggregates: CursorUsageDailyAggregate[]
}> {
  const eventCache: UsageSourceCacheRef = {
    ...sourceCache,
    worktreeFingerprint: null,
    reuse: true
  }
  const previous = await readUsageSourceCache<CursorUsageEvent>(eventCache)
  const pageFetcher = fetchPage ?? createCursorUsagePageFetcher(await resolveCursorUsageSession())
  const fetched = await fetchCursorUsageEvents(
    pageFetcher,
    cursorUsageFetchStartMs(previous),
    Date.now()
  )
  const events = mergeCursorUsageEvents(previous, fetched)
  try {
    await writeUsageSourceCache(eventCache, events)
  } catch (error) {
    console.warn('[cursor-usage] Could not persist the usage event cache:', error)
  }
  return aggregateCursorUsageEvents(events, worktrees)
}
