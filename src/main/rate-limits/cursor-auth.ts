import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function getCursorAuthPath(): string {
  const configHome = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), '.config')
  return join(configHome, 'cursor', 'auth.json')
}

export type CursorAuthSession = {
  accessToken: string
  userId: string | null
  expiresAtMs: number | null
}

export type CursorAuthReadResult =
  | { status: 'missing' }
  | { status: 'error'; error: string }
  | { status: 'ok'; session: CursorAuthSession }

type CursorJwtClaims = {
  sub?: string
  exp?: number
}

function getCursorAuthReadError(err: unknown): string {
  if (err instanceof SyntaxError) {
    return 'Cursor auth file is invalid'
  }
  return 'Unable to read Cursor auth file'
}

function decodeJwtClaims(token: string): CursorJwtClaims | null {
  const parts = token.split('.')
  if (parts.length < 2) {
    return null
  }
  try {
    const payload = Buffer.from(parts[1], 'base64url').toString('utf8')
    const parsed: unknown = JSON.parse(payload)
    return typeof parsed === 'object' && parsed !== null ? (parsed as CursorJwtClaims) : null
  } catch {
    return null
  }
}

function userIdFromSubject(sub: string | undefined): string | null {
  if (typeof sub !== 'string') {
    return null
  }
  const segments = sub.split('|').filter((segment) => segment.length > 0)
  return segments.at(-1) ?? null
}

export function sessionFromCursorAccessToken(accessToken: string): CursorAuthSession {
  const claims = decodeJwtClaims(accessToken)
  const exp = claims?.exp
  return {
    accessToken,
    userId: userIdFromSubject(claims?.sub),
    expiresAtMs: typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : null
  }
}

export function readCursorAuthSession(): CursorAuthReadResult {
  const path = getCursorAuthPath()
  if (!existsSync(path)) {
    return { status: 'missing' }
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'))
    if (typeof parsed !== 'object' || parsed === null) {
      return { status: 'error', error: 'Cursor auth file is invalid' }
    }
    const accessToken = (parsed as { accessToken?: unknown }).accessToken
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      return { status: 'missing' }
    }
    return { status: 'ok', session: sessionFromCursorAccessToken(accessToken) }
  } catch (err) {
    return { status: 'error', error: getCursorAuthReadError(err) }
  }
}

const TOKEN_SKEW_MS = 5 * 60 * 1000

export function isCursorAccessTokenFresh(session: CursorAuthSession): boolean {
  if (session.expiresAtMs === null) {
    return true
  }
  return session.expiresAtMs - Date.now() > TOKEN_SKEW_MS
}

export function buildCursorSessionCookie(session: CursorAuthSession): string | null {
  if (!session.userId) {
    return null
  }
  return `WorkosCursorSessionToken=${session.userId}%3A%3A${session.accessToken}`
}
