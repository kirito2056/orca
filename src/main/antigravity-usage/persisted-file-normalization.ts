import type { AntigravityUsagePersistedFile } from './types'

export function normalizeAntigravityUsagePersistedFiles(
  files: AntigravityUsagePersistedFile[] | undefined
): AntigravityUsagePersistedFile[] {
  return (files ?? []).map((file) => ({
    ...file,
    sessions: file.sessions ?? [],
    dailyAggregates: file.dailyAggregates ?? [],
    sessionCwd: file.sessionCwd ?? null
  }))
}
