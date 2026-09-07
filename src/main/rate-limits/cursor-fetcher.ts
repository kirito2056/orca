import { net } from 'electron'
import type {
  ProviderRateLimits,
  RateLimitBucket,
  RateLimitWindow,
  UsageRateLimitMetadata
} from '../../shared/rate-limit-types'
import {
  CURSOR_MODELS_BUCKET_NAME,
  CURSOR_OTHER_MODELS_BUCKET_NAME
} from '../../shared/cursor-usage-buckets'
import {
  buildCursorSessionCookie,
  isCursorAccessTokenFresh,
  readCursorAuthSession,
  type CursorAuthReadResult,
  type CursorAuthSession
} from './cursor-auth'

const CURSOR_USAGE_SUMMARY_URL = 'https://cursor.com/api/usage-summary'
const API_TIMEOUT_MS = 10_000
const MONTHLY_WINDOW_MINUTES = 43_200

type CursorPlanUsage = {
  enabled?: boolean
  used?: number
  limit?: number | null
  autoPercentUsed?: number
  apiPercentUsed?: number
  totalPercentUsed?: number
}

type CursorUsageSummary = {
  billingCycleStart?: string
  billingCycleEnd?: string
  membershipType?: string
  isUnlimited?: boolean
  individualUsage?: {
    plan?: CursorPlanUsage
  }
}

function result(
  status: ProviderRateLimits['status'],
  error: string | null,
  usageMetadata?: UsageRateLimitMetadata
): ProviderRateLimits {
  return {
    provider: 'cursor',
    session: null,
    weekly: null,
    updatedAt: Date.now(),
    error,
    status,
    ...(usageMetadata ? { usageMetadata } : {})
  }
}

function parseIsoMs(iso: string | undefined): number | null {
  if (!iso) {
    return null
  }
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : null
}

function parseResetDescription(resetsAt: number | null): string | null {
  if (resetsAt === null) {
    return null
  }
  const date = new Date(resetsAt)
  const isToday = date.toDateString() === new Date().toDateString()
  return isToday
    ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value))
}

function finitePercent(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? clampPercent(value) : null
}

type CursorBillingCycle = {
  windowMinutes: number
  resetsAt: number | null
  resetDescription: string | null
}

function resolveBillingCycle(summary: CursorUsageSummary): CursorBillingCycle {
  const start = parseIsoMs(summary.billingCycleStart)
  const end = parseIsoMs(summary.billingCycleEnd)
  const windowMinutes =
    start !== null && end !== null && end > start
      ? Math.round((end - start) / 60_000)
      : MONTHLY_WINDOW_MINUTES
  return { windowMinutes, resetsAt: end, resetDescription: parseResetDescription(end) }
}

function windowFor(usedPercent: number, cycle: CursorBillingCycle): RateLimitWindow {
  return { usedPercent, ...cycle }
}

function bucketFor(
  name: string,
  usedPercent: number | null,
  cycle: CursorBillingCycle
): RateLimitBucket | null {
  return usedPercent === null ? null : { name, ...windowFor(usedPercent, cycle) }
}

export function mapCursorUsageSummary(
  summary: CursorUsageSummary,
  session: CursorAuthSession
): ProviderRateLimits {
  if (summary.isUnlimited) {
    return result('unavailable', 'Cursor plan reports unlimited usage')
  }
  const plan = summary.individualUsage?.plan
  if (!plan || plan.enabled === false) {
    return result('unavailable', 'Cursor usage summary did not include plan usage')
  }
  const cycle = resolveBillingCycle(summary)
  const buckets = [
    bucketFor(CURSOR_MODELS_BUCKET_NAME, finitePercent(plan.autoPercentUsed), cycle),
    bucketFor(CURSOR_OTHER_MODELS_BUCKET_NAME, finitePercent(plan.apiPercentUsed), cycle)
  ].filter((bucket): bucket is RateLimitBucket => bucket !== null)
  let total = finitePercent(plan.totalPercentUsed)
  if (total === null && typeof plan.limit === 'number' && plan.limit > 0) {
    const used = typeof plan.used === 'number' && Number.isFinite(plan.used) ? plan.used : null
    total = used === null ? null : clampPercent((used / plan.limit) * 100)
  }
  if (buckets.length === 0 && total === null) {
    return result('unavailable', 'Cursor did not report a usage percentage for this account')
  }
  const tier = summary.membershipType?.trim()
  const authLabel = session.userId ?? 'Cursor account'
  return {
    provider: 'cursor',
    session: null,
    weekly: null,
    ...(total !== null ? { monthly: windowFor(total, cycle) } : {}),
    ...(buckets.length > 0 ? { buckets } : {}),
    updatedAt: Date.now(),
    error: null,
    status: 'ok',
    usageMetadata: {
      source: 'oauth',
      authProvenance: tier ? `${authLabel} (${tier})` : authLabel
    }
  }
}

export async function fetchCursorRateLimits(
  options: { signal?: AbortSignal; authReadResult?: CursorAuthReadResult } = {}
): Promise<ProviderRateLimits> {
  const readResult = options.authReadResult ?? readCursorAuthSession()
  if (readResult.status === 'missing') {
    return result('unavailable', 'Not signed in to Cursor — run cursor-agent login')
  }
  if (readResult.status === 'error') {
    return result('error', readResult.error)
  }
  const session = readResult.session
  if (!isCursorAccessTokenFresh(session)) {
    return result(
      'error',
      'Cursor sign-in expired — run cursor-agent on the computer running Orca; sign in if prompted.',
      { failureKind: 'delegated-refresh-required', source: 'oauth' }
    )
  }
  const cookie = buildCursorSessionCookie(session)
  if (!cookie) {
    return result('error', 'Cursor access token did not include a user id', {
      failureKind: 'parse',
      source: 'oauth'
    })
  }
  const requestSignal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(API_TIMEOUT_MS)])
    : AbortSignal.timeout(API_TIMEOUT_MS)
  try {
    const res = await net.fetch(CURSOR_USAGE_SUMMARY_URL, {
      headers: { Accept: 'application/json', Cookie: cookie },
      signal: requestSignal
    })
    if (res.status === 401 || res.status === 403) {
      return result('error', `Cursor usage request unauthorized (HTTP ${res.status})`)
    }
    if (!res.ok) {
      return result('error', `Cursor usage request failed (HTTP ${res.status})`)
    }
    const data: unknown = await res.json()
    const summary = typeof data === 'object' && data !== null ? (data as CursorUsageSummary) : {}
    return mapCursorUsageSummary(summary, session)
  } catch (err) {
    return result('error', err instanceof Error ? err.message : 'Cursor usage request failed')
  }
}
