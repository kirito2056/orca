import { describe, expect, it, vi } from 'vitest'
import { fetchAntigravityUsageViaPty } from './antigravity-pty'

describe('Antigravity PTY usage probe cancellation', () => {
  it('does not resolve the command after cancellation', async () => {
    const controller = new AbortController()
    const resolveCommand = vi.fn(() => ({ command: 'agy', args: [], cwd: '.', env: {} }))
    controller.abort()

    await expect(
      fetchAntigravityUsageViaPty(resolveCommand, { signal: controller.signal })
    ).resolves.toMatchObject({
      provider: 'antigravity',
      status: 'error',
      error: 'Rate-limit fetch aborted'
    })
    expect(resolveCommand).not.toHaveBeenCalled()
  })
})
