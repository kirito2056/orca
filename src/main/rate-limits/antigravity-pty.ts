import { appendFileSync } from 'node:fs'
import type { ProviderRateLimits } from '../../shared/rate-limit-types'
import { resolveCliCommand, withCliRuntimeOnPath } from '../../shared/node-cli-command-resolution'
import { cleanupHiddenRateLimitPty, registerHiddenRateLimitPty } from './hidden-pty-cleanup'
import { resolveHiddenRateLimitPtyCwd } from './hidden-rate-limit-pty-cwd'
import {
  ANTIGRAVITY_USAGE_STOP_SUBSTRINGS,
  abortedAntigravityUsageResult,
  antigravityUsageResult,
  describeAntigravityUsageFailure,
  isAntigravityPromptReady,
  isAntigravityTrustPrompt,
  isAntigravityUsagePanelComplete,
  parseAntigravityPtyUsage,
  stripTerminalControlSequences
} from './antigravity-pty-usage-parser'

const ANTIGRAVITY_CLI_COMMAND = 'agy'
const PTY_TIMEOUT_MS = 25_000
const PROMPT_NUDGE_MS = 6_000
const USAGE_ENTER_DELAY_MS = 400
const USAGE_ENTER_RETRY_MS = 3_000
const SETTLE_AFTER_STOP_MS = 600
const MAX_OUTPUT_LENGTH = 100_000
const ESCAPE = String.fromCharCode(27)
const DEBUG_LOG_ENV = 'ORCA_ANTIGRAVITY_PTY_LOG'

function writeDebugLog(output: string, result: ProviderRateLimits): void {
  const target = process.env[DEBUG_LOG_ENV]?.trim()
  if (!target) {
    return
  }
  try {
    appendFileSync(
      target,
      `----- ${new Date().toISOString()} status=${result.status} error=${result.error ?? ''}\n${output}\n`
    )
  } catch {
    /* diagnostics only */
  }
}

export type AntigravityPtyCommand = {
  command: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
}

export function isAntigravityCliResolvable(): boolean {
  return resolveCliCommand(ANTIGRAVITY_CLI_COMMAND) !== ANTIGRAVITY_CLI_COMMAND
}

export function resolveAntigravityPtyCommand(): AntigravityPtyCommand {
  const command = resolveCliCommand(ANTIGRAVITY_CLI_COMMAND)
  return {
    command,
    args: [],
    cwd: resolveHiddenRateLimitPtyCwd(),
    env: withCliRuntimeOnPath(command, { ...process.env, TERM: 'xterm-256color' })
  }
}

export async function fetchAntigravityUsageViaPty(
  resolveCommand: () => AntigravityPtyCommand = resolveAntigravityPtyCommand,
  options?: { signal?: AbortSignal }
): Promise<ProviderRateLimits> {
  if (options?.signal?.aborted) {
    return abortedAntigravityUsageResult()
  }
  const pty = await import('node-pty')
  if (options?.signal?.aborted) {
    return abortedAntigravityUsageResult()
  }
  const command = resolveCommand()

  return new Promise<ProviderRateLimits>((resolve) => {
    let output = ''
    let resolved = false
    let sentUsage = false
    let stopDetected = false
    let timeout: ReturnType<typeof setTimeout> | null = null
    let promptNudge: ReturnType<typeof setTimeout> | null = null
    let usageEnter: ReturnType<typeof setTimeout> | null = null
    let settleTimer: ReturnType<typeof setTimeout> | null = null

    const term = pty.spawn(command.command, command.args, {
      name: 'xterm-256color',
      cols: 120,
      rows: 50,
      cwd: command.cwd,
      env: command.env
    })
    const termDisposables: { dispose: () => void }[] = [registerHiddenRateLimitPty(term)]

    function clearTimers(): void {
      for (const timer of [timeout, promptNudge, usageEnter, settleTimer]) {
        if (timer) {
          clearTimeout(timer)
        }
      }
      timeout = null
      promptNudge = null
      usageEnter = null
      settleTimer = null
    }

    function finish(result: ProviderRateLimits, kill: boolean): void {
      if (resolved) {
        return
      }
      resolved = true
      clearTimers()
      if (kill) {
        try {
          term.write(`${ESCAPE}/exit\r`)
        } catch {
          /* already gone */
        }
      }
      cleanupHiddenRateLimitPty(term, termDisposables, { kill })
      writeDebugLog(output, result)
      resolve(result)
    }

    function finalizeFromOutput(kill: boolean): void {
      const clean = stripTerminalControlSequences(output)
      const buckets = parseAntigravityPtyUsage(clean)
      finish(antigravityUsageResult(buckets, describeAntigravityUsageFailure(clean)), kill)
    }

    function sendUsageCommand(): void {
      if (sentUsage || resolved) {
        return
      }
      sentUsage = true
      if (promptNudge) {
        clearTimeout(promptNudge)
        promptNudge = null
      }
      term.write('/usage')
      usageEnter = setTimeout(() => {
        usageEnter = null
        term.write('\r')
        usageEnter = setTimeout(() => {
          usageEnter = null
          if (!resolved && !stopDetected) {
            term.write('\r')
          }
        }, USAGE_ENTER_RETRY_MS)
      }, USAGE_ENTER_DELAY_MS)
    }

    if (options?.signal) {
      const onAbort = (): void => finish(abortedAntigravityUsageResult(), true)
      options.signal.addEventListener('abort', onAbort, { once: true })
      termDisposables.push({
        dispose: () => options.signal?.removeEventListener('abort', onAbort)
      })
    }

    timeout = setTimeout(() => finalizeFromOutput(true), PTY_TIMEOUT_MS)
    promptNudge = setTimeout(sendUsageCommand, PROMPT_NUDGE_MS)

    const onDataDisposable = term.onData((data) => {
      output += data
      if (output.length > MAX_OUTPUT_LENGTH) {
        output = output.slice(-MAX_OUTPUT_LENGTH)
      }
      const cleanChunk = stripTerminalControlSequences(data)
      if (isAntigravityTrustPrompt(cleanChunk)) {
        term.write('\r')
        return
      }
      const clean = stripTerminalControlSequences(output)
      if (!sentUsage && isAntigravityPromptReady(clean)) {
        sendUsageCommand()
        return
      }
      if (sentUsage && !stopDetected) {
        const complete =
          isAntigravityUsagePanelComplete(clean) ||
          ANTIGRAVITY_USAGE_STOP_SUBSTRINGS.some((marker) => clean.includes(marker))
        if (complete) {
          stopDetected = true
          settleTimer = setTimeout(() => finalizeFromOutput(true), SETTLE_AFTER_STOP_MS)
        }
      }
    })
    if (onDataDisposable) {
      termDisposables.push(onDataDisposable)
    }

    const onExitDisposable = term.onExit(() => finalizeFromOutput(false))
    if (onExitDisposable) {
      termDisposables.push(onExitDisposable)
    }
  })
}
