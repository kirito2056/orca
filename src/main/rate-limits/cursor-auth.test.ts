import { afterEach, describe, expect, it, vi } from 'vitest'

function jwt(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return `${header}.${payload}.sig`
}

describe('readCursorAuthSession', () => {
  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('node:fs')
  })

  it('reports missing when no auth file exists', async () => {
    vi.doMock('node:fs', () => ({
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn()
    }))
    const { readCursorAuthSession } = await import('./cursor-auth')

    expect(readCursorAuthSession()).toEqual({ status: 'missing' })
  })

  it('derives the user id and expiry from the access token', async () => {
    const accessToken = jwt({ sub: 'github|user_01ABC', exp: 4_102_444_800 })
    vi.doMock('node:fs', () => ({
      existsSync: vi.fn(() => true),
      readFileSync: vi.fn(() => JSON.stringify({ accessToken, refreshToken: 'r' }))
    }))
    const { readCursorAuthSession, buildCursorSessionCookie } = await import('./cursor-auth')

    const result = readCursorAuthSession()
    expect(result).toEqual({
      status: 'ok',
      session: { accessToken, userId: 'user_01ABC', expiresAtMs: 4_102_444_800_000 }
    })
    if (result.status !== 'ok') {
      throw new Error('expected ok')
    }
    expect(buildCursorSessionCookie(result.session)).toBe(
      `WorkosCursorSessionToken=user_01ABC%3A%3A${accessToken}`
    )
  })

  it('treats a token-less auth file as signed out', async () => {
    vi.doMock('node:fs', () => ({
      existsSync: vi.fn(() => true),
      readFileSync: vi.fn(() => JSON.stringify({ refreshToken: 'r' }))
    }))
    const { readCursorAuthSession } = await import('./cursor-auth')

    expect(readCursorAuthSession()).toEqual({ status: 'missing' })
  })

  it('redacts filesystem paths from read failures', async () => {
    vi.doMock('node:fs', () => ({
      existsSync: vi.fn(() => true),
      readFileSync: vi.fn(() => {
        throw new Error('EACCES: permission denied, open /Users/someone/.config/cursor/auth.json')
      })
    }))
    const { readCursorAuthSession } = await import('./cursor-auth')

    expect(readCursorAuthSession()).toEqual({
      status: 'error',
      error: 'Unable to read Cursor auth file'
    })
  })

  it('reports malformed auth JSON without parser details', async () => {
    vi.doMock('node:fs', () => ({
      existsSync: vi.fn(() => true),
      readFileSync: vi.fn(() => '{')
    }))
    const { readCursorAuthSession } = await import('./cursor-auth')

    expect(readCursorAuthSession()).toEqual({
      status: 'error',
      error: 'Cursor auth file is invalid'
    })
  })

  it('returns no cookie when the token carries no subject', async () => {
    vi.doMock('node:fs', () => ({
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn()
    }))
    const { sessionFromCursorAccessToken, buildCursorSessionCookie, isCursorAccessTokenFresh } =
      await import('./cursor-auth')

    const session = sessionFromCursorAccessToken('not-a-jwt')
    expect(session).toEqual({ accessToken: 'not-a-jwt', userId: null, expiresAtMs: null })
    expect(buildCursorSessionCookie(session)).toBeNull()
    expect(isCursorAccessTokenFresh(session)).toBe(true)
  })
})
