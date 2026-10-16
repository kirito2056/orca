import { getMainHttpClient } from '../network/http-client'
import { readCursorAuthSession, type CursorAuthSession } from '../rate-limits/cursor-auth'
import {
  cursorSessionCookie,
  isCursorSessionTokenExpired
} from '../rate-limits/cursor-session-token'
import { record } from '../../shared/codex-rollout-jsonl-cursor'
import { ensureNumber } from '../usage/usage-record-coercion'
import { parseCursorUsageEvent } from './cursor-usage-event-parsing'
import type { CursorUsageEvent } from './types'

const DASHBOARD_ORIGIN = 'https://cursor.com'
const USAGE_EVENTS_URL = `${DASHBOARD_ORIGIN}/api/dashboard/get-filtered-usage-events`
const PAGE_SIZE = 1000
const MAX_PAGES = 200
const API_TIMEOUT_MS = 20_000

export type CursorUsagePage = {
  total: number
  events: unknown[]
}

export type CursorUsagePageFetcher = (
  startMs: number,
  endMs: number,
  page: number
) => Promise<CursorUsagePage>

export async function resolveCursorUsageSession(): Promise<CursorAuthSession> {
  const auth = await readCursorAuthSession()
  if (auth.status === 'missing') {
    throw new Error(
      'No Cursor sign-in on this computer — sign in with Cursor IDE or `cursor-agent login`'
    )
  }
  if (auth.status === 'error') {
    throw new Error(auth.error)
  }
  if (isCursorSessionTokenExpired(auth.session.token)) {
    throw new Error('Cursor sign-in expired — run `cursor-agent login` again')
  }
  return auth.session
}

export function createCursorUsagePageFetcher(session: CursorAuthSession): CursorUsagePageFetcher {
  return async (startMs, endMs, page) => {
    const res = await getMainHttpClient().fetch(USAGE_EVENTS_URL, {
      method: 'POST',
      redirect: 'manual',
      credentials: 'omit',
      headers: {
        Cookie: cursorSessionCookie(session.token),
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Origin: DASHBOARD_ORIGIN,
        Referer: `${DASHBOARD_ORIGIN}/dashboard`
      },
      body: JSON.stringify({
        teamId: 0,
        startDate: String(startMs),
        endDate: String(endMs),
        page,
        pageSize: PAGE_SIZE
      }),
      signal: AbortSignal.timeout(API_TIMEOUT_MS)
    })
    if (res.status === 401 || res.status === 403) {
      throw new Error('Cursor sign-in expired — run `cursor-agent login` again')
    }
    if (!res.ok) {
      throw new Error(`Cursor usage events request failed (HTTP ${res.status})`)
    }
    const body = record(await res.json())
    return {
      total: ensureNumber(body?.totalUsageEventsCount),
      events: Array.isArray(body?.usageEventsDisplay) ? body.usageEventsDisplay : []
    }
  }
}

export async function fetchCursorUsageEvents(
  fetchPage: CursorUsagePageFetcher,
  startMs: number,
  endMs: number
): Promise<CursorUsageEvent[]> {
  const events: CursorUsageEvent[] = []
  let seen = 0
  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await fetchPage(startMs, endMs, page)
    for (const raw of result.events) {
      const event = parseCursorUsageEvent(raw)
      if (event) {
        events.push(event)
      }
    }
    seen += result.events.length
    if (result.events.length < PAGE_SIZE || seen >= result.total) {
      break
    }
  }
  return events
}
