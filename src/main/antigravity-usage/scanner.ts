import { parseAntigravitySessionFile } from '../ai-vault/session-scanner-antigravity-parser'
import {
  createAntigravityWorkspaceResolver,
  readLocalAntigravityHistory,
  type AntigravityWorkspaceResolver
} from '../ai-vault/session-scanner-antigravity-history'
import { attributeUsageEvent } from '../usage/usage-event-attribution'
import { createUsageEventAggregation } from '../usage/usage-event-aggregation'
import { readJsonlLinesFromOffset } from '../usage/jsonl-line-offsets'
import type { UsageScanWorktreeRef } from '../usage/usage-provider-contract'
import {
  createUsageWorktreeResolver,
  type UsageWorktreeResolver
} from '../usage/usage-worktree-resolver'
import {
  listAntigravityTranscripts,
  type AntigravityTranscriptRef
} from './antigravity-transcript-discovery'
import {
  parseAntigravityUsageLine,
  type AntigravityUsageParseContext
} from './antigravity-usage-record-parser'
import type {
  AntigravityUsageAttributedEvent,
  AntigravityUsageDailyAggregate,
  AntigravityUsageMetric,
  AntigravityUsagePersistedFile,
  AntigravityUsageSession
} from './types'

const YIELD_EVERY_FILES = 10

export const antigravityUsageAggregation = createUsageEventAggregation<
  AntigravityUsageAttributedEvent,
  AntigravityUsageMetric
>({
  metric: { empty: () => ({}), fromEvent: () => ({}), fold: () => {} },
  cloneSessionForMerge: (session) => ({
    ...session,
    locationBreakdown: session.locationBreakdown.map((entry) => ({ ...entry })),
    modelBreakdown: session.modelBreakdown.map((entry) => ({ ...entry })),
    locationModelBreakdown: session.locationModelBreakdown.map((entry) => ({
      ...entry
    }))
  })
})

async function yieldToEventLoop(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
}

async function resolveSessionCwd(
  ref: AntigravityTranscriptRef,
  workspaces: AntigravityWorkspaceResolver
): Promise<string | null> {
  const session = await parseAntigravitySessionFile({
    path: ref.path,
    mtimeMs: ref.mtimeMs,
    modifiedAt: new Date(ref.mtimeMs).toISOString()
  })
  if (!session) {
    return null
  }
  try {
    return (await workspaces.enrich(session, ref.historyPath)).cwd
  } catch {
    return null
  }
}

export async function parseAntigravityUsageFile(
  ref: AntigravityTranscriptRef,
  cwd: string | null,
  resolveWorktree: UsageWorktreeResolver
): Promise<AntigravityUsagePersistedFile> {
  const context: AntigravityUsageParseContext = {
    sessionId: ref.sessionId,
    cwd,
    currentModel: null
  }
  const events: AntigravityUsageAttributedEvent[] = []
  for await (const { line } of readJsonlLinesFromOffset(ref.path, 0)) {
    const parsed = parseAntigravityUsageLine(line, context)
    const attributed = parsed ? attributeUsageEvent(parsed, resolveWorktree) : null
    if (attributed) {
      events.push(attributed)
    }
  }
  return {
    path: ref.path,
    mtimeMs: ref.mtimeMs,
    size: ref.size,
    ...antigravityUsageAggregation.aggregate(events),
    sessionCwd: cwd
  }
}

export async function scanAntigravityUsageFiles(
  worktrees: UsageScanWorktreeRef[],
  previousProcessedFiles: AntigravityUsagePersistedFile[],
  onFilesScanned?: (count: number) => void,
  brainDirs?: string[]
): Promise<{
  processedFiles: AntigravityUsagePersistedFile[]
  sessions: AntigravityUsageSession[]
  dailyAggregates: AntigravityUsageDailyAggregate[]
}> {
  const refs = await listAntigravityTranscripts(brainDirs)
  const previousByPath = new Map(previousProcessedFiles.map((file) => [file.path, file]))
  const resolveWorktree = await createUsageWorktreeResolver(worktrees)
  const workspaces = createAntigravityWorkspaceResolver((path) => readLocalAntigravityHistory(path))

  const processedFiles: AntigravityUsagePersistedFile[] = []
  const sessionsById = new Map<string, AntigravityUsageSession>()
  const dailyByKey = new Map<string, AntigravityUsageDailyAggregate>()
  let parsedCount = 0
  for (const ref of refs) {
    const previous = previousByPath.get(ref.path)
    let processed: AntigravityUsagePersistedFile | undefined =
      previous && previous.mtimeMs === ref.mtimeMs && previous.size === ref.size
        ? previous
        : undefined
    if (!processed) {
      try {
        const cwd = await resolveSessionCwd(ref, workspaces)
        processed = await parseAntigravityUsageFile(ref, cwd, resolveWorktree)
      } catch {
        processed = undefined
      }
      onFilesScanned?.(1)
      parsedCount++
      if (parsedCount % YIELD_EVERY_FILES === 0) {
        await yieldToEventLoop()
      }
    }
    if (!processed) {
      continue
    }
    processedFiles.push(processed)
    antigravityUsageAggregation.mergeSessions(sessionsById, processed.sessions)
    antigravityUsageAggregation.mergeDailyAggregates(dailyByKey, processed.dailyAggregates)
  }

  return {
    processedFiles,
    sessions: antigravityUsageAggregation.finalizeSessions(sessionsById),
    dailyAggregates: antigravityUsageAggregation.sortDailyAggregates(dailyByKey)
  }
}
