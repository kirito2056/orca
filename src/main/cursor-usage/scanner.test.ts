import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => tmpdir()) } }))

import { cursorChatsWorkspaceHash } from './cursor-conversation-workspaces'
import { parseCursorUsageEvent } from './cursor-usage-event-parsing'
import { fetchCursorUsageEvents, type CursorUsagePageFetcher } from './cursor-usage-events-fetch'
import {
  aggregateCursorUsageEvents,
  cursorUsageFetchStartMs,
  mergeCursorUsageEvents,
  scanCursorUsage
} from './scanner'

function rawEvent(
  timestampMs: number,
  conversationId: string,
  usage: Partial<
    Record<
      'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens' | 'totalCents',
      number
    >
  >,
  model = 'gpt-5.6-sol-high'
): Record<string, unknown> {
  return {
    timestamp: String(timestampMs),
    model,
    kind: 'USAGE_EVENT_KIND_INCLUDED_IN_PRO',
    isTokenBasedCall: true,
    tokenUsage: usage,
    chargedCents: usage.totalCents ?? 0,
    conversationId
  }
}

const T0 = Date.parse('2026-10-15T10:00:00Z')

describe('parseCursorUsageEvent', () => {
  it('folds cache reads and writes into input and converts cents to dollars', () => {
    expect(
      parseCursorUsageEvent(
        rawEvent(T0, 'conv-1', {
          inputTokens: 30,
          outputTokens: 5_000,
          cacheReadTokens: 2_000,
          cacheWriteTokens: 300,
          totalCents: 250
        })
      )
    ).toMatchObject({
      conversationId: 'conv-1',
      timestamp: '2026-10-15T10:00:00.000Z',
      model: 'gpt-5.6-sol-high',
      inputTokens: 2_330,
      cachedInputTokens: 2_300,
      cacheWriteInputTokens: 300,
      outputTokens: 5_000,
      totalTokens: 7_330,
      estimatedCostUsd: 2.5
    })
  })

  it('drops events without token usage', () => {
    const { tokenUsage: _usage, ...withoutUsage } = rawEvent(T0, 'conv-1', {})
    expect(parseCursorUsageEvent(withoutUsage)).toBeNull()
    expect(parseCursorUsageEvent(rawEvent(T0, 'conv-1', { inputTokens: 0 }))).toBeNull()
    expect(parseCursorUsageEvent('nope')).toBeNull()
  })
})

describe('fetchCursorUsageEvents', () => {
  it('pages until the reported total is reached', async () => {
    const pages = [
      Array.from({ length: 1000 }, (_, index) =>
        rawEvent(T0 + index, `conv-${index}`, {
          inputTokens: 1,
          outputTokens: 1
        })
      ),
      [rawEvent(T0 + 5_000, 'conv-last', { inputTokens: 1, outputTokens: 1 })]
    ]
    const fetchPage = vi.fn<CursorUsagePageFetcher>(async (_start, _end, page) => ({
      total: 1001,
      events: pages[page - 1] ?? []
    }))
    const events = await fetchCursorUsageEvents(fetchPage, 0, T0)
    expect(events).toHaveLength(1001)
    expect(fetchPage).toHaveBeenCalledTimes(2)
  })
})

describe('event cache merging', () => {
  it('dedupes refetched events and resumes a day before the newest one', () => {
    const first = parseCursorUsageEvent(rawEvent(T0, 'a', { inputTokens: 1, outputTokens: 1 }))
    const second = parseCursorUsageEvent(
      rawEvent(T0 + 60_000, 'b', { inputTokens: 2, outputTokens: 2 })
    )
    if (!first || !second) {
      throw new Error('fixture events must parse')
    }
    const merged = mergeCursorUsageEvents([first], [second, first])
    expect(merged.map((event) => event.conversationId)).toEqual(['a', 'b'])
    expect(cursorUsageFetchStartMs(merged)).toBe(T0 + 60_000 - 24 * 60 * 60_000)
    expect(cursorUsageFetchStartMs([])).toBe(Date.UTC(2023, 0, 1))
  })
})

describe('Cursor usage aggregation', () => {
  let root: string
  let workspace: string
  let chatsDir: string

  beforeEach(async () => {
    root = await realpath(mkdtempSync(join(tmpdir(), 'orca-cursor-usage-')))
    workspace = join(root, 'workspace')
    chatsDir = join(root, 'chats')
    mkdirSync(workspace)
    mkdirSync(join(chatsDir, cursorChatsWorkspaceHash(workspace), 'conv-local'), {
      recursive: true
    })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('attributes cursor-agent conversations to their worktree and sums cost', async () => {
    const events = [
      rawEvent(T0, 'conv-local', {
        inputTokens: 10,
        outputTokens: 5,
        totalCents: 100
      }),
      rawEvent(T0 + 1_000, 'conv-local', {
        inputTokens: 10,
        outputTokens: 5,
        totalCents: 50
      }),
      rawEvent(T0 + 2_000, 'conv-elsewhere', {
        inputTokens: 1,
        outputTokens: 1
      })
    ].flatMap((raw) => parseCursorUsageEvent(raw) ?? [])
    const result = await aggregateCursorUsageEvents(
      events,
      [
        {
          repoId: 'repo-1',
          worktreeId: 'wt-1',
          path: workspace,
          displayName: 'workspace'
        }
      ],
      chatsDir
    )
    const local = result.sessions.find((session) => session.sessionId === 'conv-local')
    expect(local).toMatchObject({
      primaryWorktreeId: 'wt-1',
      totalTokens: 30,
      estimatedCostUsd: 1.5
    })
    const elsewhere = result.sessions.find((session) => session.sessionId === 'conv-elsewhere')
    expect(elsewhere).toMatchObject({
      primaryWorktreeId: null,
      estimatedCostUsd: null
    })
  })

  it('persists fetched events so the next scan only asks for new ones', async () => {
    const sourceCache = {
      path: join(root, 'orca-cursor-usage-sources.json'),
      schemaVersion: 1,
      worktreeFingerprint: 'fp-1',
      reuse: false
    }
    const fetchPage = vi.fn<CursorUsagePageFetcher>(async () => ({
      total: 1,
      events: [rawEvent(T0, 'conv-1', { inputTokens: 3, outputTokens: 4 })]
    }))
    await scanCursorUsage([], sourceCache, fetchPage)
    expect(fetchPage.mock.calls[0]?.[0]).toBe(Date.UTC(2023, 0, 1))
    expect(JSON.parse(readFileSync(sourceCache.path, 'utf-8')).sources).toHaveLength(1)

    const result = await scanCursorUsage(
      [],
      { ...sourceCache, worktreeFingerprint: 'fp-2' },
      fetchPage
    )
    expect(fetchPage.mock.calls[1]?.[0]).toBe(T0 - 24 * 60 * 60_000)
    expect(result.sessions).toHaveLength(1)
  })
})
