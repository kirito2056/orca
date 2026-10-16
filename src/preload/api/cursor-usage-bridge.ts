import { ipcRenderer } from 'electron'
import { createUsageProviderApi } from '../usage-provider-api'
import type { PreloadApi } from '../api-types'

export const cursorUsageApi = createUsageProviderApi(
  ipcRenderer,
  'cursorUsage'
) satisfies PreloadApi['cursorUsage']
