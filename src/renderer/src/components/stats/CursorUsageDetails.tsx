import type {
  CursorUsageBreakdownRow,
  CursorUsageDailyPoint,
  CursorUsageSessionRow,
  CursorUsageSummary
} from '../../../../shared/cursor-usage-types'
import { CodexUsageDailyChart } from './CodexUsageDailyChart'
import { UsageBreakdownSection } from './UsageBreakdownSection'
import { UsageRecentSessionsTable } from './UsageRecentSessionsTable'
import { translate } from '@/i18n/i18n'

type CursorUsageDetailsProps = {
  daily: CursorUsageDailyPoint[]
  modelBreakdown: CursorUsageBreakdownRow[]
  projectBreakdown: CursorUsageBreakdownRow[]
  recentSessions: CursorUsageSessionRow[]
  summary: CursorUsageSummary | null | undefined
}

export function CursorUsageDetails({
  daily,
  modelBreakdown,
  projectBreakdown,
  recentSessions,
  summary
}: CursorUsageDetailsProps): React.JSX.Element {
  return (
    <>
      <CodexUsageDailyChart daily={daily} />

      <div className="grid gap-4 xl:grid-cols-2">
        <UsageBreakdownSection
          title={translate('auto.components.stats.CursorUsagePane.040c044d39', 'By model')}
          topLabel={translate('auto.components.stats.CursorUsagePane.a15206a63a', 'Top model:')}
          topValue={summary?.topModel}
          rows={modelBreakdown.map((row) => ({
            key: row.key,
            label: row.label,
            tokens: row.totalTokens,
            sessions: row.sessions,
            eventsOrTurns: row.events,
            estimatedCostUsd: row.estimatedCostUsd
          }))}
          eventsOrTurns="events"
        />
        <UsageBreakdownSection
          title={translate('auto.components.stats.CursorUsagePane.0f0a1684bb', 'By project')}
          topLabel={translate('auto.components.stats.CursorUsagePane.048ffe4d65', 'Top project:')}
          topValue={summary?.topProject}
          rows={projectBreakdown.map((row) => ({
            key: row.key,
            label: row.label,
            tokens: row.totalTokens,
            sessions: row.sessions,
            eventsOrTurns: row.events
          }))}
          eventsOrTurns="events"
        />
      </div>

      <UsageRecentSessionsTable
        title={translate('auto.components.stats.CursorUsagePane.4799177b1c', 'Recent sessions')}
        description={translate(
          'auto.components.stats.CursorUsagePane.81817a641a',
          'Most recent Cursor sessions in this scope.'
        )}
        headings={[
          translate('auto.components.stats.CursorUsagePane.d97bdf6e27', 'Last active'),
          translate('auto.components.stats.CursorUsagePane.a4738de041', 'Project'),
          translate('auto.components.stats.CursorUsagePane.08c78441b7', 'Model'),
          translate('auto.components.stats.CursorUsagePane.d416f5cf92', 'Events'),
          translate('auto.components.stats.CursorUsagePane.0f2f266c9d', 'Input'),
          translate('auto.components.stats.CursorUsagePane.dfc4513657', 'Output'),
          translate('auto.components.stats.CursorUsagePane.349f7c3f5c', 'Total')
        ]}
        unknownModel={translate('auto.components.stats.CursorUsagePane.362231082f', 'Unknown')}
        rows={recentSessions}
        getActivity={(row) => row.events}
        getTrailingTokens={(row) => row.totalTokens}
      />
    </>
  )
}
