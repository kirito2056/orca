import type {
  CursorUsageRange,
  CursorUsageScope,
  CursorUsageSnapshot
} from '../../../../shared/cursor-usage-types'
import {
  createUsageProviderSlice,
  type ProviderUsageSlice,
  type UsageProviderTypes
} from './usage-provider-slices'

type CursorUsageTypes = UsageProviderTypes<CursorUsageScope, CursorUsageRange, CursorUsageSnapshot>

export type CursorUsageSlice = ProviderUsageSlice<'cursor', 'Cursor', CursorUsageTypes>

export const createCursorUsageSlice = createUsageProviderSlice<
  'cursor',
  'Cursor',
  CursorUsageTypes
>({
  prefix: 'cursor',
  name: 'Cursor',
  initialScope: 'all',
  initialRange: '30d',
  getApi: () => window.api.cursorUsage,
  hasCachedData: (state) => state.hasAnyCursorData
})
