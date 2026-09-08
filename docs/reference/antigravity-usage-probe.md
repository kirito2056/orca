# Antigravity usage probe

Google closed Gemini CLI sign-in for individual Google accounts and points those
users at Antigravity. The old Antigravity row mirrored the Gemini quota read,
which no longer describes what `agy` actually consumes and stops working once
the last Gemini token expires. This probe reads Antigravity's own quota.

## Why a hidden PTY

`agy` has no usage subcommand and no JSON output. Its quota is only rendered by
the interactive `/usage` slash command, and its OAuth token lives in the OS
keyring under a service name Orca does not know. So Orca does what the Claude
and Codex fallbacks already do: spawn the CLI in a hidden PTY, type the slash
command, and parse the panel. See `src/main/rate-limits/antigravity-pty.ts`.

## Session script

1. Spawn `agy` with no arguments in the bounded hidden-PTY cwd. The first run
   in that directory shows "Do you trust the contents of this project?"; the
   probe answers Enter, which selects the default "Yes". The CLI remembers the
   answer per folder.
2. The CLI signs in from the keyring on its own. When "? for shortcuts" appears
   the prompt is ready; the probe types `/usage`, waits 400 ms for the command
   palette to filter, then sends Enter. A nudge sends the command anyway after
   6 s if the prompt marker was never seen.
3. The panel ends with a scroll hint line containing `esc Close`. Once that or
   the explanatory footer is seen the probe waits 600 ms for the paint to
   settle, parses, writes Escape and `/exit`, and kills the PTY.
4. Hard timeout is 25 s. On timeout or CLI exit whatever was captured is parsed
   anyway.

## Panel shape parsed

```
GEMINI MODELS
  Models within this group: Gemini Flash, Gemini Pro
  Weekly Limit Remaining
    [██████████] 100.00%
    Quota available
  Five Hour Limit Remaining
    [██████████] 100.00%
    Quota available
CLAUDE AND GPT MODELS
  ...
```

Every `<NAME> MODELS` header starts a group. Under it, "Weekly Limit Remaining"
and "Five Hour Limit Remaining" each take the first percentage within the next
four lines. The percentage is **remaining**, so used = 100 − remaining. A
"Resets in 2d 4h" style line, if the CLI ever prints one, becomes `resetsAt`.

Buckets are named `<Group> wk` and `<Group> 5h` (`Gemini wk`, `Claude/GPT 5h`).
`src/shared/antigravity-usage-buckets.ts` owns that naming, and the status bar
uses it to decide which named buckets to render inline.

## Fallback and gating

The probe runs inside the full fetch cycle on macOS and Linux when `agy`
resolves on PATH. When it fails or is skipped, the Antigravity row falls back to
the previous Gemini-mirror behaviour, so users are never worse off than before.
Windows is excluded like the other hidden-PTY fallbacks.

## Debugging a silent failure

Set `ORCA_ANTIGRAVITY_PTY_LOG=/path/to/file` before launching Orca and every
probe appends its raw PTY transcript plus the parsed status to that file. Send
that transcript when the row falls back to the Gemini mirror unexpectedly.
