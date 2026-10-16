import type {
  AntigravityUsageRange,
  AntigravityUsageScope,
  AntigravityUsageSnapshot
} from '../../../../shared/antigravity-usage-types'
import {
  createUsageProviderSlice,
  type ProviderUsageSlice,
  type UsageProviderTypes
} from './usage-provider-slices'

type AntigravityUsageTypes = UsageProviderTypes<
  AntigravityUsageScope,
  AntigravityUsageRange,
  AntigravityUsageSnapshot
>

export type AntigravityUsageSlice = ProviderUsageSlice<
  'antigravity',
  'Antigravity',
  AntigravityUsageTypes
>

export const createAntigravityUsageSlice = createUsageProviderSlice<
  'antigravity',
  'Antigravity',
  AntigravityUsageTypes
>({
  prefix: 'antigravity',
  name: 'Antigravity',
  initialScope: 'orca',
  initialRange: '30d',
  getApi: () => window.api.antigravityUsage,
  hasCachedData: (state) => state.hasAnyAntigravityData
})
