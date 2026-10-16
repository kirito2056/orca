import type { UsageProvider } from '../usage/usage-provider-contract'
import { scanCursorUsage } from './scanner'
import type { CursorUsageDailyAggregate, CursorUsageSession } from './types'

export const CURSOR_USAGE_SCHEMA_VERSION = 1

export const cursorUsageProvider = {
  id: 'cursor',
  label: 'Cursor',
  schemaVersion: CURSOR_USAGE_SCHEMA_VERSION,
  scan: (worktrees, sourceCache) => scanCursorUsage(worktrees, sourceCache)
} satisfies UsageProvider<CursorUsageSession, CursorUsageDailyAggregate>
