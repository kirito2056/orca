import { useEffect } from 'react'
import { Activity, Coins, DatabaseZap, FolderKanban, Sigma, Sparkles } from 'lucide-react'
import type { CursorUsageRange, CursorUsageScope } from '../../../../shared/cursor-usage-types'
import { useAppStore } from '../../store'
import { ClaudeUsageLoadingState } from './ClaudeUsageLoadingState'
import { CursorUsageDetails } from './CursorUsageDetails'
import { StatCard } from './StatCard'
import { UsageFilterRadioGroup, UsageTrackingPaneShell } from './UsageTrackingPaneShell'
import { formatCost, formatTokens, formatUpdatedAt } from './usage-formatters'
import { translate } from '@/i18n/i18n'

const RANGE_OPTIONS: CursorUsageRange[] = ['7d', '30d', '90d', 'all']
const SCOPE_OPTIONS: { value: CursorUsageScope; label: string }[] = [
  {
    value: 'orca',
    get label() {
      return translate('auto.components.stats.OpenCodeUsagePane.e04c58327c', 'Orca worktrees only')
    }
  },
  {
    value: 'all',
    get label() {
      return translate('auto.components.stats.CursorUsagePane.scopeAll', 'All Cursor usage')
    }
  }
]
const RANGE_LABELS: Record<CursorUsageRange, string> = {
  get '7d'() {
    return translate('auto.components.stats.OpenCodeUsagePane.rangeLast7Days', 'Last 7 days')
  },
  get '30d'() {
    return translate('auto.components.stats.OpenCodeUsagePane.rangeLast30Days', 'Last 30 days')
  },
  get '90d'() {
    return translate('auto.components.stats.OpenCodeUsagePane.rangeLast90Days', 'Last 90 days')
  },
  get all() {
    return translate('auto.components.stats.OpenCodeUsagePane.rangeAllTime', 'All time')
  }
}

export function CursorUsagePane(): React.JSX.Element {
  const scanState = useAppStore((state) => state.cursorUsageScanState)
  const summary = useAppStore((state) => state.cursorUsageSummary)
  const daily = useAppStore((state) => state.cursorUsageDaily)
  const modelBreakdown = useAppStore((state) => state.cursorUsageModelBreakdown)
  const projectBreakdown = useAppStore((state) => state.cursorUsageProjectBreakdown)
  const recentSessions = useAppStore((state) => state.cursorUsageRecentSessions)
  const scope = useAppStore((state) => state.cursorUsageScope)
  const range = useAppStore((state) => state.cursorUsageRange)
  const fetchCursorUsage = useAppStore((state) => state.fetchCursorUsage)
  const setCursorUsageEnabled = useAppStore((state) => state.setCursorUsageEnabled)
  const refreshCursorUsage = useAppStore((state) => state.refreshCursorUsage)
  const setCursorUsageScope = useAppStore((state) => state.setCursorUsageScope)
  const setCursorUsageRange = useAppStore((state) => state.setCursorUsageRange)
  const recordFeatureInteraction = useAppStore((state) => state.recordFeatureInteraction)

  useEffect(() => {
    void fetchCursorUsage()
  }, [fetchCursorUsage])

  const handleSetEnabled = (enabled: boolean): void => {
    recordFeatureInteraction('usage-tracking')
    void setCursorUsageEnabled(enabled)
  }

  const title = translate('auto.components.stats.CursorUsagePane.title', 'Cursor Usage Tracking')
  const enableLabel = translate(
    'auto.components.stats.CursorUsagePane.enableLabel',
    'Enable Cursor usage analytics'
  )

  if (!scanState?.enabled) {
    return (
      <UsageTrackingPaneShell
        enabled={false}
        title={title}
        disabledDescription={translate(
          'auto.components.stats.CursorUsagePane.disabledDescription',
          'Reads usage events from the Cursor dashboard with your signed-in Cursor account to show token, model, cost, and session stats.'
        )}
        enableLabel={enableLabel}
        onEnabledChange={handleSetEnabled}
      />
    )
  }

  if (!summary && (scanState.isScanning || scanState.lastScanCompletedAt === null)) {
    return (
      <ClaudeUsageLoadingState
        title={title}
        summaryCardCount={6}
        summaryGridClassName="md:grid-cols-3"
      />
    )
  }

  const hasAnyData = summary?.hasAnyCursorData ?? scanState.hasAnyCursorData

  return (
    <UsageTrackingPaneShell
      enabled
      title={title}
      status={
        <>
          {formatUpdatedAt(scanState.lastScanCompletedAt)}
          {scanState.lastScanError
            ? translate(
                'auto.components.stats.OpenCodeUsagePane.6cc7782458',
                ' • Last scan error: {{value0}}',
                { value0: scanState.lastScanError }
              )
            : ''}
        </>
      }
      isRefreshing={scanState.isScanning}
      hasData={hasAnyData}
      enableLabel={enableLabel}
      optionsLabel={translate(
        'auto.components.stats.CursorUsagePane.optionsLabel',
        'Cursor usage options'
      )}
      filtersLabel={translate('auto.components.stats.OpenCodeUsagePane.01583b30aa', 'Filters')}
      refreshAriaLabel={translate(
        'auto.components.stats.CursorUsagePane.refreshAriaLabel',
        'Refresh Cursor usage'
      )}
      refreshLabel={translate('auto.components.stats.OpenCodeUsagePane.603cd138dc', 'Refresh')}
      filterSections={[
        <UsageFilterRadioGroup
          key="scope"
          label={translate('auto.components.stats.OpenCodeUsagePane.40d283c837', 'Scope')}
          value={scope}
          options={SCOPE_OPTIONS}
          onValueChange={(value) => void setCursorUsageScope(value)}
        />,
        <UsageFilterRadioGroup
          key="range"
          label={translate('auto.components.stats.OpenCodeUsagePane.b5ed5c9fd0', 'Range')}
          value={range}
          options={RANGE_OPTIONS.map((value) => ({
            value,
            label: RANGE_LABELS[value]
          }))}
          onValueChange={(value) => void setCursorUsageRange(value)}
        />
      ]}
      selectionSummary={
        <>
          {SCOPE_OPTIONS.find((option) => option.value === scope)?.label} • {RANGE_LABELS[range]}
        </>
      }
      emptyMessage={translate(
        'auto.components.stats.CursorUsagePane.emptyMessage',
        'No Cursor usage found yet for this scope.'
      )}
      onEnabledChange={handleSetEnabled}
      onRefresh={() => void refreshCursorUsage()}
    >
      <>
        <div className="grid gap-3 md:grid-cols-3">
          <StatCard
            label={translate('auto.components.stats.OpenCodeUsagePane.d637a892ed', 'Input tokens')}
            value={formatTokens(summary?.inputTokens ?? 0)}
            icon={<Sparkles className="size-4" />}
          />
          <StatCard
            label={translate('auto.components.stats.OpenCodeUsagePane.7aa4d8ce35', 'Output tokens')}
            value={formatTokens(summary?.outputTokens ?? 0)}
            icon={<Activity className="size-4" />}
          />
          <StatCard
            label={translate('auto.components.stats.OpenCodeUsagePane.603504ee3b', 'Cached input')}
            value={formatTokens(summary?.cachedInputTokens ?? 0)}
            icon={<DatabaseZap className="size-4" />}
          />
          <StatCard
            label={translate('auto.components.stats.OpenCodeUsagePane.15c34d4b08', 'Recorded cost')}
            value={formatCost(summary?.estimatedCostUsd ?? null)}
            icon={<Coins className="size-4" />}
          />
          <StatCard
            label={translate(
              'auto.components.stats.OpenCodeUsagePane.7e9433469a',
              'Sessions / Events'
            )}
            value={`${(summary?.sessions ?? 0).toLocaleString()} / ${(summary?.events ?? 0).toLocaleString()}`}
            icon={<FolderKanban className="size-4" />}
          />
          <StatCard
            label={translate('auto.components.stats.UsageOverviewPane.3887b94ce5', 'Total tokens')}
            value={formatTokens(summary?.totalTokens ?? 0)}
            icon={<Sigma className="size-4" />}
          />
        </div>
        <p className="px-1 text-xs text-muted-foreground">
          {translate(
            'auto.components.stats.CursorUsagePane.costNote',
            'Cost is the API-rate value Cursor records for each request, including usage covered by your plan.'
          )}
        </p>

        <CursorUsageDetails
          daily={daily}
          modelBreakdown={modelBreakdown}
          projectBreakdown={projectBreakdown}
          recentSessions={recentSessions}
          summary={summary}
        />
      </>
    </UsageTrackingPaneShell>
  )
}
