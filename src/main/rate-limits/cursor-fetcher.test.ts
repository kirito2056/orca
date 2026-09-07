import { beforeEach, describe, expect, it, vi } from 'vitest'

const netFetchMock = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  net: { fetch: netFetchMock }
}))

import { fetchCursorRateLimits, mapCursorUsageSummary } from './cursor-fetcher'
import type { CursorAuthReadResult, CursorAuthSession } from './cursor-auth'

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response
}

const SESSION: CursorAuthSession = {
  accessToken: 'access-token',
  userId: 'user_01ABC',
  expiresAtMs: Date.now() + 60 * 60 * 1000
}

const OK_AUTH: CursorAuthReadResult = { status: 'ok', session: SESSION }

const USAGE_SUMMARY = {
  billingCycleStart: '2026-08-17T08:54:33.000Z',
  billingCycleEnd: '2026-09-17T08:54:33.000Z',
  membershipType: 'pro',
  limitType: 'user',
  isUnlimited: false,
  individualUsage: {
    plan: {
      enabled: true,
      used: 1618,
      limit: 2000,
      remaining: 382,
      autoPercentUsed: 3.5955,
      apiPercentUsed: 12.5,
      totalPercentUsed: 3.2686
    },
    onDemand: { enabled: false, used: 0, limit: null, remaining: null }
  },
  teamUsage: {}
}

describe('fetchCursorRateLimits', () => {
  beforeEach(() => {
    netFetchMock.mockReset()
  })

  it('returns unavailable when not signed in', async () => {
    const result = await fetchCursorRateLimits({ authReadResult: { status: 'missing' } })
    expect(result.provider).toBe('cursor')
    expect(result.status).toBe('unavailable')
    expect(netFetchMock).not.toHaveBeenCalled()
  })

  it('surfaces auth file read errors', async () => {
    const result = await fetchCursorRateLimits({
      authReadResult: { status: 'error', error: 'Cursor auth file is invalid' }
    })
    expect(result.status).toBe('error')
    expect(result.error).toBe('Cursor auth file is invalid')
  })

  it('asks the user to re-run the CLI when the token is expired', async () => {
    const result = await fetchCursorRateLimits({
      authReadResult: { status: 'ok', session: { ...SESSION, expiresAtMs: Date.now() - 1 } }
    })
    expect(result.status).toBe('error')
    expect(result.usageMetadata?.failureKind).toBe('delegated-refresh-required')
    expect(netFetchMock).not.toHaveBeenCalled()
  })

  it('maps Cursor models and other models pools to named buckets', async () => {
    netFetchMock.mockResolvedValueOnce(jsonResponse(USAGE_SUMMARY))

    const result = await fetchCursorRateLimits({ authReadResult: OK_AUTH })
    expect(result.status).toBe('ok')
    expect(result.buckets?.map((bucket) => [bucket.name, bucket.usedPercent])).toEqual([
      ['Cursor models', 3.5955],
      ['Other models', 12.5]
    ])
    expect(result.monthly?.usedPercent).toBe(3.2686)
    expect(result.monthly?.resetsAt).toBe(Date.parse('2026-09-17T08:54:33.000Z'))
    expect(result.monthly?.windowMinutes).toBe(31 * 24 * 60)
    expect(result.usageMetadata?.authProvenance).toBe('user_01ABC (pro)')

    expect(netFetchMock).toHaveBeenCalledWith(
      'https://cursor.com/api/usage-summary',
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: 'WorkosCursorSessionToken=user_01ABC%3A%3Aaccess-token'
        })
      })
    )
  })

  it('reports unauthorized responses as errors', async () => {
    netFetchMock.mockResolvedValueOnce(jsonResponse({}, 401))

    const result = await fetchCursorRateLimits({ authReadResult: OK_AUTH })
    expect(result.status).toBe('error')
    expect(result.error).toContain('HTTP 401')
  })

  it('reports network failures as errors', async () => {
    netFetchMock.mockRejectedValueOnce(new Error('fetch failed'))

    const result = await fetchCursorRateLimits({ authReadResult: OK_AUTH })
    expect(result.status).toBe('error')
    expect(result.error).toBe('fetch failed')
  })
})

describe('mapCursorUsageSummary', () => {
  it('hides the bar for unlimited plans', () => {
    expect(mapCursorUsageSummary({ isUnlimited: true }, SESSION).status).toBe('unavailable')
  })

  it('hides the bar when plan usage is disabled', () => {
    expect(
      mapCursorUsageSummary({ individualUsage: { plan: { enabled: false } } }, SESSION).status
    ).toBe('unavailable')
  })

  it('derives the total from used/limit when no percentage is reported', () => {
    const result = mapCursorUsageSummary(
      { individualUsage: { plan: { enabled: true, used: 500, limit: 2000 } } },
      SESSION
    )
    expect(result.status).toBe('ok')
    expect(result.buckets).toBeUndefined()
    expect(result.monthly?.usedPercent).toBe(25)
    expect(result.monthly?.windowMinutes).toBe(43_200)
  })

  it('clamps percentages into the 0-100 range', () => {
    const result = mapCursorUsageSummary(
      {
        individualUsage: {
          plan: { enabled: true, autoPercentUsed: 140, apiPercentUsed: -3, totalPercentUsed: 101 }
        }
      },
      SESSION
    )
    expect(result.buckets?.map((bucket) => bucket.usedPercent)).toEqual([100, 0])
    expect(result.monthly?.usedPercent).toBe(100)
  })
})
