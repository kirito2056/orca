import { app } from 'electron'
import { join } from 'node:path'
import type {
  CursorUsageBreakdownKind,
  CursorUsageBreakdownRow,
  CursorUsageDailyPoint,
  CursorUsageRange,
  CursorUsageScope,
  CursorUsageSessionRow,
  CursorUsageSnapshot,
  CursorUsageSummary
} from '../../shared/cursor-usage-types'
import type { Store } from '../persistence'
import { UsageProviderStoreLifecycle } from '../usage/usage-provider-store-lifecycle'
import { splitUsageCacheFileViaWorker } from '../usage/usage-scan-worker-spawn'
import { filterUsageDaily, filterUsageSessions } from '../usage/usage-scope-filters'
import { cursorUsageProvider } from './cursor-usage-provider'
import {
  getDefaultCursorUsageState,
  normalizeCursorUsageState
} from './persisted-state-normalization'
import {
  buildCursorUsageBreakdownRows,
  buildCursorUsageDailyPoints,
  buildCursorUsageRecentSessions,
  buildCursorUsageSummary
} from './snapshot-rollups'
import type {
  CursorUsageDailyAggregate,
  CursorUsagePersistedState,
  CursorUsageSession
} from './types'

let cursorUsageFile: string | null = null

export function initCursorUsagePath(): void {
  cursorUsageFile = join(app.getPath('userData'), 'orca-cursor-usage.json')
}

function getCursorUsageFile(): string {
  cursorUsageFile ??= join(app.getPath('userData'), 'orca-cursor-usage.json')
  return cursorUsageFile
}

export class CursorUsageStore extends UsageProviderStoreLifecycle<
  'processedEvents',
  CursorUsagePersistedState,
  'hasAnyCursorData'
> {
  constructor(store: Pick<Store, 'getRepos' | 'getAllWorktreeMeta'>) {
    super(store, {
      logTag: '[cursor-usage]',
      resolveCacheFile: getCursorUsageFile,
      createDefaultState: getDefaultCursorUsageState,
      normalizeState: normalizeCursorUsageState,
      sourceKey: 'processedEvents',
      dataPresenceKey: 'hasAnyCursorData',
      scan: cursorUsageProvider.scan,
      splitCacheFile: splitUsageCacheFileViaWorker
    })
  }

  getSnapshot(
    scope: CursorUsageScope,
    range: CursorUsageRange,
    recentSessionLimit = 10
  ): CursorUsageSnapshot {
    const daily = this.getFilteredDaily(scope, range)
    const sessions = this.getFilteredSessions(scope, range)
    return {
      scanState: this.getScanState(),
      summary: buildCursorUsageSummary(scope, range, daily, sessions),
      daily: buildCursorUsageDailyPoints(daily),
      modelBreakdown: buildCursorUsageBreakdownRows('model', daily, sessions),
      projectBreakdown: buildCursorUsageBreakdownRows('project', daily, sessions),
      recentSessions: buildCursorUsageRecentSessions(sessions, recentSessionLimit)
    }
  }

  async getSummary(scope: CursorUsageScope, range: CursorUsageRange): Promise<CursorUsageSummary> {
    await this.refresh(false)
    return this.buildSummary(scope, range)
  }

  async getDaily(
    scope: CursorUsageScope,
    range: CursorUsageRange
  ): Promise<CursorUsageDailyPoint[]> {
    await this.refresh(false)
    return buildCursorUsageDailyPoints(this.getFilteredDaily(scope, range))
  }

  async getBreakdown(
    scope: CursorUsageScope,
    range: CursorUsageRange,
    kind: CursorUsageBreakdownKind
  ): Promise<CursorUsageBreakdownRow[]> {
    await this.refresh(false)
    return this.buildBreakdown(scope, range, kind)
  }

  async getRecentSessions(
    scope: CursorUsageScope,
    range: CursorUsageRange,
    limit = 10
  ): Promise<CursorUsageSessionRow[]> {
    await this.refresh(false)
    return buildCursorUsageRecentSessions(this.getFilteredSessions(scope, range), limit)
  }

  private buildSummary(scope: CursorUsageScope, range: CursorUsageRange): CursorUsageSummary {
    return buildCursorUsageSummary(
      scope,
      range,
      this.getFilteredDaily(scope, range),
      this.getFilteredSessions(scope, range)
    )
  }

  private buildBreakdown(
    scope: CursorUsageScope,
    range: CursorUsageRange,
    kind: CursorUsageBreakdownKind
  ): CursorUsageBreakdownRow[] {
    return buildCursorUsageBreakdownRows(
      kind,
      this.getFilteredDaily(scope, range),
      this.getFilteredSessions(scope, range)
    )
  }

  private getFilteredDaily(
    scope: CursorUsageScope,
    range: CursorUsageRange
  ): CursorUsageDailyAggregate[] {
    return filterUsageDaily(this.state.dailyAggregates, scope, range)
  }

  private getFilteredSessions(
    scope: CursorUsageScope,
    range: CursorUsageRange
  ): CursorUsageSession[] {
    return filterUsageSessions(this.state.sessions, scope, range)
  }
}
