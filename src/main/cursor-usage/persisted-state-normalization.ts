import { CURSOR_USAGE_SCHEMA_VERSION } from './cursor-usage-provider'
import type { CursorUsagePersistedState } from './types'

export function getDefaultCursorUsageState(): CursorUsagePersistedState {
  return {
    schemaVersion: CURSOR_USAGE_SCHEMA_VERSION,
    worktreeFingerprint: null,
    processedEvents: [],
    sessions: [],
    dailyAggregates: [],
    scanState: {
      enabled: false,
      lastScanStartedAt: null,
      lastScanCompletedAt: null,
      lastScanError: null
    }
  }
}

export function normalizeCursorUsageState(
  state: CursorUsagePersistedState
): CursorUsagePersistedState {
  if (state.schemaVersion !== CURSOR_USAGE_SCHEMA_VERSION) {
    const defaults = getDefaultCursorUsageState()
    return {
      ...defaults,
      scanState: {
        ...defaults.scanState,
        enabled: state.scanState?.enabled ?? false
      }
    }
  }
  return {
    ...state,
    processedEvents: [],
    sessions: state.sessions ?? [],
    dailyAggregates: state.dailyAggregates ?? []
  }
}
