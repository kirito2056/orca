import type { ProviderRateLimits, RateLimitBucket } from '../../shared/rate-limit-types'
import {
  ANTIGRAVITY_FIVE_HOUR_LABEL,
  ANTIGRAVITY_WEEKLY_LABEL,
  antigravityBucketName
} from '../../shared/antigravity-usage-buckets'
import { stripTerminalControlSequences } from './claude-pty-usage-parser'

export { stripTerminalControlSequences }

const GROUP_HEADER_RE = /^\s*([A-Z][A-Z0-9 &/,+-]*?)\s+MODELS\s*$/
const WEEKLY_WINDOW_RE = /weekly\s+limit\s+remaining/i
const FIVE_HOUR_WINDOW_RE = /five[\s-]*hour\s+limit\s+remaining/i
const PERCENT_RE = /(\d{1,3}(?:\.\d+)?)\s*%/
const RESET_RE =
  /resets?\s+(?:in|after)\s+((?:\d+\s*(?:d|day|days|h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\s*)+)/i
const QUOTA_PANEL_RE = /models\s*&\s*quota/i
const PANEL_CLOSE_HINT = 'esc Close'
const PANEL_FOOTER_RE = /within each group,? models share/i
const TRUST_PROMPT_RE = /do you trust the contents/i
const PROMPT_READY_RE = /\?\s*for shortcuts/i
const NOT_SIGNED_IN_RE = /not signed in/i

const WEEKLY_WINDOW_MINUTES = 10_080
const FIVE_HOUR_WINDOW_MINUTES = 300
const PERCENT_SCAN_LINES = 4

export const ANTIGRAVITY_USAGE_STOP_SUBSTRINGS: readonly string[] = [PANEL_CLOSE_HINT]

function formatGroupLabel(rawGroup: string): string {
  const normalized = rawGroup.trim().replace(/\s+/g, ' ')
  const parts = normalized.split(/\s+(?:AND|&)\s+|\s*\/\s*/i).filter((part) => part.length > 0)
  return parts
    .map((part) =>
      part
        .split(' ')
        .map((word) => {
          if (/^[A-Z]{2,4}$/.test(word) && word !== 'GEMINI') {
            return word
          }
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        })
        .join(' ')
    )
    .join('/')
}

function durationToMs(text: string): number | null {
  let total = 0
  let matched = false
  const re = /(\d+)\s*(d|day|days|h|hr|hrs|hour|hours|m|min|mins|minute|minutes)/gi
  for (const match of text.matchAll(re)) {
    matched = true
    const value = Number.parseInt(match[1], 10)
    const unit = match[2].toLowerCase()
    if (unit.startsWith('d')) {
      total += value * 24 * 60 * 60_000
    } else if (unit.startsWith('h')) {
      total += value * 60 * 60_000
    } else {
      total += value * 60_000
    }
  }
  return matched ? total : null
}

function readWindow(
  lines: string[],
  labelIndex: number,
  now: number
): { usedPercent: number; resetsAt: number | null } | null {
  let usedPercent: number | null = null
  let resetsAt: number | null = null
  for (let offset = 1; offset <= PERCENT_SCAN_LINES; offset += 1) {
    const line = lines[labelIndex + offset]
    if (line === undefined) {
      break
    }
    if (
      GROUP_HEADER_RE.test(line) ||
      WEEKLY_WINDOW_RE.test(line) ||
      FIVE_HOUR_WINDOW_RE.test(line)
    ) {
      break
    }
    if (usedPercent === null) {
      const percent = PERCENT_RE.exec(line)
      if (percent) {
        const remaining = Number.parseFloat(percent[1])
        usedPercent = Math.min(100, Math.max(0, 100 - remaining))
      }
    }
    const reset = RESET_RE.exec(line)
    if (reset) {
      const ms = durationToMs(reset[1])
      if (ms !== null) {
        resetsAt = now + ms
      }
    }
  }
  return usedPercent === null ? null : { usedPercent, resetsAt }
}

export function parseAntigravityPtyUsage(
  output: string,
  now: number = Date.now()
): RateLimitBucket[] {
  const lines = output.split(/\r?\n/)
  const buckets: RateLimitBucket[] = []
  const seen = new Set<string>()
  let group: string | null = null
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const header = GROUP_HEADER_RE.exec(line)
    if (header) {
      group = formatGroupLabel(header[1])
      continue
    }
    if (!group) {
      continue
    }
    const isWeekly = WEEKLY_WINDOW_RE.test(line)
    const isFiveHour = !isWeekly && FIVE_HOUR_WINDOW_RE.test(line)
    if (!isWeekly && !isFiveHour) {
      continue
    }
    const window = readWindow(lines, index, now)
    if (!window) {
      continue
    }
    const name = antigravityBucketName(
      group,
      isWeekly ? ANTIGRAVITY_WEEKLY_LABEL : ANTIGRAVITY_FIVE_HOUR_LABEL
    )
    if (seen.has(name)) {
      continue
    }
    seen.add(name)
    buckets.push({
      name,
      usedPercent: window.usedPercent,
      windowMinutes: isWeekly ? WEEKLY_WINDOW_MINUTES : FIVE_HOUR_WINDOW_MINUTES,
      resetsAt: window.resetsAt,
      resetDescription: null
    })
  }
  return buckets
}

export function hasAntigravityUsagePanel(output: string): boolean {
  return QUOTA_PANEL_RE.test(output)
}

export function isAntigravityUsagePanelComplete(output: string): boolean {
  return output.includes(PANEL_CLOSE_HINT) || PANEL_FOOTER_RE.test(output)
}

export function isAntigravityTrustPrompt(chunk: string): boolean {
  return TRUST_PROMPT_RE.test(chunk)
}

export function isAntigravityPromptReady(output: string): boolean {
  return PROMPT_READY_RE.test(output)
}

export function describeAntigravityUsageFailure(output: string): string {
  if (NOT_SIGNED_IN_RE.test(output) && !isAntigravityPromptReady(output)) {
    return 'Not signed in to Antigravity — run agy on the computer running Orca and sign in.'
  }
  if (hasAntigravityUsagePanel(output)) {
    return 'Antigravity /usage panel rendered but no quota percentages were found.'
  }
  return 'Antigravity /usage panel did not render before the probe timed out.'
}

export function antigravityUsageResult(
  buckets: RateLimitBucket[],
  error: string | null
): ProviderRateLimits {
  return {
    provider: 'antigravity',
    session: null,
    weekly: null,
    ...(buckets.length > 0 ? { buckets } : {}),
    updatedAt: Date.now(),
    error: buckets.length > 0 ? null : error,
    status: buckets.length > 0 ? 'ok' : 'error',
    usageMetadata: { source: 'cli' }
  }
}

export function abortedAntigravityUsageResult(): ProviderRateLimits {
  return {
    provider: 'antigravity',
    session: null,
    weekly: null,
    updatedAt: Date.now(),
    error: 'Rate-limit fetch aborted',
    status: 'error'
  }
}
