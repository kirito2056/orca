# Cursor usage provider

The status bar shows Cursor plan usage as two pools, matching the Spending tab on
cursor.com: **Cursor models** (Composer, Cursor Grok, Auto routed to those) and
**Other models** (third-party API models). The combined figure is shown as the
monthly window.

## Credential source

Orca never signs in to Cursor itself. It reads the access token the Cursor CLI
(`cursor-agent`) stores at `$XDG_CONFIG_HOME/cursor/auth.json` (default
`~/.config/cursor/auth.json`). The Cursor desktop app keeps its token in a
SQLite `state.vscdb`, which this repo has no driver for, so desktop-only users
must run `cursor-agent login` once.

The access token is a JWT. The user id is the last `|`-separated segment of its
`sub` claim, and the dashboard cookie is assembled as
`WorkosCursorSessionToken=<userId>%3A%3A<accessToken>`. When the token is
expired the provider reports `delegated-refresh-required`; running the CLI again
refreshes the file, the same contract Grok uses.

## Endpoint

`GET https://cursor.com/api/usage-summary` with the cookie above. This is the
dashboard's private endpoint, not a documented API, so the field mapping below
is best effort and may break when Cursor changes its dashboard.

| Response field                          | Orca field                       |
| --------------------------------------- | -------------------------------- |
| `individualUsage.plan.autoPercentUsed`  | bucket `Cursor models`           |
| `individualUsage.plan.apiPercentUsed`   | bucket `Other models`            |
| `individualUsage.plan.totalPercentUsed` | `monthly.usedPercent`            |
| `plan.used / plan.limit`                | `monthly` fallback when no total |
| `billingCycleStart` / `billingCycleEnd` | window length and `resetsAt`     |
| `membershipType`                        | `usageMetadata.authProvenance`   |

`isUnlimited: true` or `plan.enabled: false` yields `unavailable` so the bar
hides rather than painting a permanent 0%.

## Wiring

Cursor is polled inside the full fetch cycle alongside MiniMax; it has no
dedicated single-provider cycle. `cursorAuthConfigured` on `RateLimitState` is
the durable "keep the bar visible across reloads" signal, set from the auth file
on every cycle. The status-bar item is gated on PATH detection of the `cursor`
agent like the other CLI-backed bars.
