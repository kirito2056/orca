import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  antigravityUsageResult,
  describeAntigravityUsageFailure,
  isAntigravityPromptReady,
  isAntigravityTrustPrompt,
  isAntigravityUsagePanelComplete,
  parseAntigravityPtyUsage,
  stripTerminalControlSequences
} from './antigravity-pty-usage-parser'

const PANEL = readFileSync(
  path.join(import.meta.dirname, '__fixtures__', 'antigravity-usage-panel.txt'),
  'utf8'
)
const ESC = String.fromCharCode(27)

describe('parseAntigravityPtyUsage', () => {
  it('maps both model groups into weekly and five-hour buckets', () => {
    const buckets = parseAntigravityPtyUsage(PANEL)
    expect(
      buckets.map((bucket) => [bucket.name, bucket.usedPercent, bucket.windowMinutes])
    ).toEqual([
      ['Gemini wk', 0, 10_080],
      ['Gemini 5h', 0, 300],
      ['Claude/GPT wk', 0, 10_080],
      ['Claude/GPT 5h', 0, 300]
    ])
    expect(buckets.every((bucket) => bucket.resetsAt === null)).toBe(true)
  })

  it('converts remaining percentages into used percentages', () => {
    const output = [
      'GEMINI MODELS',
      '  Weekly Limit Remaining',
      '    [████████] 37.50%',
      '    Resets in 2d 4h',
      '  Five Hour Limit Remaining',
      '    [████████] 0.00%',
      '    Quota exhausted · Resets in 45m'
    ].join('\n')
    const now = 1_000_000
    expect(parseAntigravityPtyUsage(output, now)).toEqual([
      {
        name: 'Gemini wk',
        usedPercent: 62.5,
        windowMinutes: 10_080,
        resetsAt: now + (2 * 24 + 4) * 60 * 60_000,
        resetDescription: null
      },
      {
        name: 'Gemini 5h',
        usedPercent: 100,
        windowMinutes: 300,
        resetsAt: now + 45 * 60_000,
        resetDescription: null
      }
    ])
  })

  it('ignores windows that appear before any group header', () => {
    expect(parseAntigravityPtyUsage('Weekly Limit Remaining\n 50%')).toEqual([])
  })

  it('strips ANSI sequences before matching', () => {
    const raw = `${ESC}[1mGEMINI MODELS${ESC}[m\r\n  ${ESC}[1mWeekly Limit Remaining${ESC}[m\r\n    [${ESC}[32m███${ESC}[m]${ESC}[2m 80.00%${ESC}[m\r\n`
    expect(parseAntigravityPtyUsage(stripTerminalControlSequences(raw))).toMatchObject([
      { name: 'Gemini wk', usedPercent: 20 }
    ])
  })
})

describe('Antigravity PTY signals', () => {
  it('recognizes the trust prompt, the ready prompt and the finished panel', () => {
    expect(isAntigravityTrustPrompt('Do you trust the contents of this project?')).toBe(true)
    expect(isAntigravityPromptReady('? for shortcuts')).toBe(true)
    expect(isAntigravityUsagePanelComplete(PANEL)).toBe(true)
    expect(isAntigravityUsagePanelComplete('GEMINI MODELS')).toBe(false)
  })

  it('describes a signed-out CLI distinctly from a missing panel', () => {
    expect(describeAntigravityUsageFailure('You are currently not signed in.')).toMatch(
      /not signed in/i
    )
    expect(describeAntigravityUsageFailure('nothing')).toMatch(/did not render/i)
  })

  it('builds an ok result only when buckets exist', () => {
    expect(antigravityUsageResult([], 'boom')).toMatchObject({
      provider: 'antigravity',
      status: 'error',
      error: 'boom'
    })
    const buckets = parseAntigravityPtyUsage(PANEL)
    expect(antigravityUsageResult(buckets, 'unused')).toMatchObject({
      status: 'ok',
      error: null,
      buckets,
      usageMetadata: { source: 'cli' }
    })
  })
})
