export const ANTIGRAVITY_FIVE_HOUR_LABEL = '5h'
export const ANTIGRAVITY_WEEKLY_LABEL = 'wk'

export function antigravityBucketName(group: string, windowLabel: string): string {
  return `${group} ${windowLabel}`
}

export function isAntigravityBucketName(name: string): boolean {
  return (
    name.endsWith(` ${ANTIGRAVITY_FIVE_HOUR_LABEL}`) ||
    name.endsWith(` ${ANTIGRAVITY_WEEKLY_LABEL}`)
  )
}
