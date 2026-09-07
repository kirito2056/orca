import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import SyncDatabase from '../sqlite/sync-database'

export function getCursorAuthPath(): string {
  const configHome = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), '.config')
  return join(configHome, 'cursor', 'auth.json')
}

export function getCursorDesktopStatePath(platform: NodeJS.Platform = process.platform): string {
  if (platform === 'darwin') {
    return join(
      homedir(),
      'Library',
      'Application Support',
      'Cursor',
      'User',
      'globalStorage',
      'state.vscdb'
    )
  }
  if (platform === 'win32') {
    const appData = process.env.APPDATA?.trim() || join(homedir(), 'AppData', 'Roaming')
    return join(appData, 'Cursor', 'User', 'globalStorage', 'state.vscdb')
  }
  const configHome = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), '.config')
  return join(configHome, 'Cursor', 'User', 'globalStorage', 'state.vscdb')
}

const DESKTOP_ACCESS_TOKEN_KEY = 'cursorAuth/accessToken'
const DESKTOP_DB_BUSY_TIMEOUT_MS = 1_000

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

function readCursorDesktopAccessToken(): string | null {
  const dbPath = getCursorDesktopStatePath()
  if (!existsSync(dbPath)) {
    return null
  }
  let db: SyncDatabase | null = null
  try {
    db = new SyncDatabase(dbPath, {
      readonly: true,
      fileMustExist: true,
      timeout: DESKTOP_DB_BUSY_TIMEOUT_MS
    })
    const row = db
      .prepare('SELECT value FROM ItemTable WHERE key = ? LIMIT 1')
      .get(DESKTOP_ACCESS_TOKEN_KEY) as { value?: unknown } | undefined
    const value = row?.value
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
    if (value instanceof Uint8Array) {
      const decoded = Buffer.from(value).toString('utf8')
      return decoded.length > 0 ? decoded : null
    }
    return null
  } catch {
    return null
  } finally {
    db?.close()
  }
}

function readCursorCliAuthSession(): CursorAuthReadResult {
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

export function readCursorAuthSession(): CursorAuthReadResult {
  const cli = readCursorCliAuthSession()
  if (cli.status === 'ok') {
    return cli
  }
  const desktopToken = readCursorDesktopAccessToken()
  if (desktopToken) {
    return { status: 'ok', session: sessionFromCursorAccessToken(desktopToken) }
  }
  return cli
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
