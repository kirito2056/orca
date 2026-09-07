# Cursor usage provider

The status bar shows Cursor plan usage as two pools, matching the Spending tab on
cursor.com: **Cursor models** (Composer, Cursor Grok, Auto routed to those) and
**Other models** (third-party API models). The combined figure is shown as the
monthly window.

## Credential source

Orca never signs in to Cursor itself. It reads an access token from one of two
places, in this order:

1. The Cursor CLI file `$XDG_CONFIG_HOME/cursor/auth.json` (default
   `~/.config/cursor/auth.json`). On Linux `cursor-agent login` writes this file.
   On macOS the CLI stores its token in the Keychain instead, so this file
   usually does not exist there.
2. The Cursor desktop app's `state.vscdb` (`ItemTable` key
   `cursorAuth/accessToken`), read through the `node:sqlite` wrapper in
   `src/main/sqlite/sync-database.ts`. Paths: macOS
   `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`,
   Linux `$XDG_CONFIG_HOME/Cursor/User/globalStorage/state.vscdb`, Windows
   `%APPDATA%\Cursor\User\globalStorage\state.vscdb`.

The desktop database is opened read-only with a short busy timeout; any open or
query failure counts as "no desktop token" rather than an error, so a locked or
missing database never paints an alert in the status bar.

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
