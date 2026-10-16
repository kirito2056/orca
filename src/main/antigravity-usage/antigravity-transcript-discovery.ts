import { readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ANTIGRAVITY_HISTORY_ROOTS } from '../../shared/antigravity-session-origin'
import { antigravityHistoryPathForBrainDir } from '../ai-vault/session-scanner-antigravity-paths'

const TRANSCRIPT_CANDIDATES = ['transcript_full.jsonl', 'transcript.jsonl']

export type AntigravityTranscriptRef = {
  path: string
  sessionId: string
  historyPath: string
  mtimeMs: number
  size: number
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

async function listConversationDirs(brainDir: string): Promise<string[]> {
  try {
    const entries = await readdir(brainDir, { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  } catch (error) {
    if (isMissingPathError(error)) {
      return []
    }
    throw error
  }
}

async function statTranscript(
  logsDir: string
): Promise<{ path: string; mtimeMs: number; size: number } | null> {
  for (const name of TRANSCRIPT_CANDIDATES) {
    const path = join(logsDir, name)
    try {
      const fileStat = await stat(path)
      if (fileStat.isFile()) {
        return { path, mtimeMs: fileStat.mtimeMs, size: fileStat.size }
      }
    } catch {
      continue
    }
  }
  return null
}

export function defaultAntigravityBrainDirs(home = homedir()): string[] {
  return ANTIGRAVITY_HISTORY_ROOTS.map((origin) => join(home, '.gemini', origin, 'brain'))
}

export async function listAntigravityTranscripts(
  brainDirs = defaultAntigravityBrainDirs()
): Promise<AntigravityTranscriptRef[]> {
  const refs: AntigravityTranscriptRef[] = []
  for (const brainDir of brainDirs) {
    const historyPath = antigravityHistoryPathForBrainDir(brainDir)
    for (const sessionId of await listConversationDirs(brainDir)) {
      const transcript = await statTranscript(
        join(brainDir, sessionId, '.system_generated', 'logs')
      )
      if (transcript) {
        refs.push({ ...transcript, sessionId, historyPath })
      }
    }
  }
  return refs.sort((left, right) => left.path.localeCompare(right.path))
}
