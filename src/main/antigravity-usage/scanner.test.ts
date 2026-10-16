import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => tmpdir()) } }))

import {
  parseAntigravityUsageLine,
  type AntigravityUsageParseContext
} from './antigravity-usage-record-parser'
import { scanAntigravityUsageFiles } from './scanner'

function userInput(createdAt: string, request: string, modelChange?: string): string {
  const settings = modelChange
    ? `\n<USER_SETTINGS_CHANGE>\nThe user changed setting \`Model Selection\` from None to ${modelChange}. No need to comment on this change if the user doesn't ask about it.\n</USER_SETTINGS_CHANGE>`
    : ''
  return JSON.stringify({
    step_index: 0,
    source: 'USER_EXPLICIT',
    type: 'USER_INPUT',
    status: 'DONE',
    created_at: createdAt,
    content: `<USER_REQUEST>\n${request}\n</USER_REQUEST>${settings}`
  })
}

function plannerResponse(
  createdAt: string,
  usage: { input: number; cacheRead: number; output: number }
): string {
  return JSON.stringify({
    step_index: 1,
    source: 'MODEL',
    type: 'PLANNER_RESPONSE',
    status: 'DONE',
    created_at: createdAt,
    input_tokens: usage.input,
    cache_read_tokens: usage.cacheRead,
    output_tokens: usage.output,
    content: 'done'
  })
}

function context(): AntigravityUsageParseContext {
  return { sessionId: 'conv-1', cwd: '/repo', currentModel: null }
}

describe('parseAntigravityUsageLine', () => {
  it('counts cache reads as part of input and tracks the selected model', () => {
    const ctx = context()
    expect(
      parseAntigravityUsageLine(userInput('2026-10-13T18:26:00Z', 'hi', 'Gemini 3.8 Flash'), ctx)
    ).toBeNull()
    const event = parseAntigravityUsageLine(
      plannerResponse('2026-10-13T18:26:01Z', {
        input: 100,
        cacheRead: 400,
        output: 20
      }),
      ctx
    )
    expect(event).toMatchObject({
      sessionId: 'conv-1',
      cwd: '/repo',
      model: 'Gemini 3.8 Flash',
      inputTokens: 500,
      cachedInputTokens: 400,
      outputTokens: 20,
      totalTokens: 520
    })
  })

  it('ignores user records, zero-usage responses, and malformed lines', () => {
    const ctx = context()
    expect(parseAntigravityUsageLine(userInput('2026-10-13T18:26:00Z', 'hi'), ctx)).toBeNull()
    expect(
      parseAntigravityUsageLine(
        plannerResponse('2026-10-13T18:26:01Z', {
          input: 0,
          cacheRead: 0,
          output: 0
        }),
        ctx
      )
    ).toBeNull()
    expect(parseAntigravityUsageLine('{"output_tokens": 3', ctx)).toBeNull()
  })
})

describe('scanAntigravityUsageFiles', () => {
  let root: string
  let workspace: string

  beforeEach(async () => {
    root = await realpath(mkdtempSync(join(tmpdir(), 'orca-antigravity-usage-')))
    workspace = join(root, 'workspace')
    mkdirSync(workspace)
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  function writeConversation(brainDir: string, id: string, lines: string[]): string {
    const logsDir = join(brainDir, id, '.system_generated', 'logs')
    mkdirSync(logsDir, { recursive: true })
    const path = join(logsDir, 'transcript_full.jsonl')
    writeFileSync(path, `${lines.join('\n')}\n`)
    return path
  }

  it('attributes conversations to the worktree recorded in history.jsonl', async () => {
    const brainDir = join(root, '.gemini', 'antigravity-cli', 'brain')
    writeConversation(brainDir, 'conv-a', [
      userInput('2026-10-13T18:26:00Z', 'fix the build', 'Gemini 3.8 Flash (High)'),
      plannerResponse('2026-10-13T18:26:01Z', {
        input: 100,
        cacheRead: 900,
        output: 50
      }),
      plannerResponse('2026-10-13T18:27:01Z', {
        input: 10,
        cacheRead: 0,
        output: 5
      })
    ])
    writeConversation(brainDir, 'conv-b', [
      userInput('2026-10-14T09:00:00Z', 'elsewhere'),
      plannerResponse('2026-10-14T09:00:02Z', {
        input: 7,
        cacheRead: 0,
        output: 3
      })
    ])
    writeFileSync(
      join(root, '.gemini', 'antigravity-cli', 'history.jsonl'),
      `${JSON.stringify({
        display: 'fix the build',
        timestamp: Date.parse('2026-10-13T18:26:00Z'),
        workspace,
        conversationId: 'conv-a'
      })}\n`
    )

    const result = await scanAntigravityUsageFiles(
      [
        {
          repoId: 'repo-1',
          worktreeId: 'wt-1',
          path: workspace,
          displayName: 'workspace'
        }
      ],
      [],
      undefined,
      [brainDir]
    )

    expect(result.processedFiles).toHaveLength(2)
    const sessionA = result.sessions.find((session) => session.sessionId === 'conv-a')
    expect(sessionA).toMatchObject({
      totalInputTokens: 1010,
      totalCachedInputTokens: 900,
      totalOutputTokens: 55,
      primaryModel: 'Gemini 3.8 Flash (High)',
      primaryWorktreeId: 'wt-1'
    })
    const sessionB = result.sessions.find((session) => session.sessionId === 'conv-b')
    expect(sessionB?.primaryWorktreeId ?? null).toBeNull()
  })

  it('reuses unchanged files from the previous scan', async () => {
    const brainDir = join(root, '.gemini', 'antigravity-cli', 'brain')
    writeConversation(brainDir, 'conv-a', [
      plannerResponse('2026-10-13T18:26:01Z', {
        input: 1,
        cacheRead: 0,
        output: 1
      })
    ])
    const first = await scanAntigravityUsageFiles([], [], undefined, [brainDir])
    const onFilesScanned = vi.fn()
    const second = await scanAntigravityUsageFiles([], first.processedFiles, onFilesScanned, [
      brainDir
    ])
    expect(onFilesScanned).not.toHaveBeenCalled()
    expect(second.processedFiles[0]).toBe(first.processedFiles[0])
  })

  it('returns nothing when the brain directory does not exist', async () => {
    const result = await scanAntigravityUsageFiles([], [], undefined, [join(root, 'missing')])
    expect(result).toEqual({
      processedFiles: [],
      sessions: [],
      dailyAggregates: []
    })
  })
})
