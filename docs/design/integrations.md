# Integrations — Strava export (ADR-0018)

Normative for v4-strava. Facts marked (spike) come from `docs/research/2026-10-26-strava-api.md`.
Every shared schema below lives in a new `packages/shared/src/integrations.ts` (exported from
`index.ts`). Reused names were checked with `grep -n "export const <Name>" packages/shared/src/*.ts`:
`Label` (free text ≤ 80), `Timestamp`, `SessionId`, `UserId`, `Uuid` from `common.ts` / `ids.ts`.

## 1. Shared schemas (`packages/shared/src/integrations.ts`)

```ts
export const Provider = Schema.Literals(["strava"])                       // grows per ADR
export const ActivityExportId = Uuid.pipe(Schema.brand("ActivityExportId"))   // add to ids.ts
export const IntegrationState = Schema.Literals(["connected", "revoked", "disconnected"])
export const ExportStatus = Schema.Literals(["pending", "running", "sent", "failed", "dead"])
/** Why the last attempt failed; never the provider's raw text. */
export const ExportFailureReason = Schema.Literals([
  "unauthorized", "rate_limited", "rejected", "provider_error", "transport", "session_missing",
])
export const ProviderAccount = Schema.Struct({ displayName: Label })      // athlete first + last name
export const ProviderStatus = Schema.Struct({
  provider: Provider,
  state: IntegrationState,            // "revoked" = tokens rejected, user must reconnect
  account: Schema.OptionFromNullOr(ProviderAccount),
  connectedAt: Schema.OptionFromNullOr(Timestamp),
  lastExportAt: Schema.OptionFromNullOr(Timestamp),   // newest `sent` row's updatedAt
  pendingExports: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  failedExports: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)), // failed + dead
})
export const IntegrationsStatus = Schema.Struct({ providers: Schema.Array(ProviderStatus) })
export const ActivityExport = Schema.Struct({
  id: ActivityExportId, provider: Provider, sessionId: SessionId, status: ExportStatus,
  attempts: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  externalActivityId: Schema.OptionFromNullOr(Schema.String),   // opaque; "View on Strava" link
  lastError: Schema.OptionFromNullOr(ExportFailureReason),
  createdAt: Timestamp, updatedAt: Timestamp,
})
/** `returnTo`: absolute URL, no query, no fragment; allow-list in §4. */
export const ConnectRequest = Schema.Struct({ returnTo: Schema.String.check(Schema.isMaxLength(512)) })
export const ConnectResponse = Schema.Struct({ url: Schema.String })
export const RetryExportRequest = Schema.Struct({ id: ActivityExportId })
export const ExportsQuery = { limit: PageLimit }                        // PageLimit from common.ts

export class IntegrationNotConnected extends Schema.TaggedError<IntegrationNotConnected>()(
  "IntegrationNotConnected", { provider: Provider }, { httpApiStatus: 409 }) {}
export class ConnectRejected extends Schema.TaggedError<ConnectRejected>()(
  "ConnectRejected", { reason: Schema.Literals(["return-to", "not-configured"]) }, { httpApiStatus: 400 }) {}
```
Wire example (`GET /integrations`):
`{"providers":[{"provider":"strava","state":"connected","account":{"displayName":"Lukas K."},
"connectedAt":"2026-10-26T19:00:00.000Z","lastExportAt":"2026-10-26T19:40:12.000Z","pendingExports":0,"failedExports":1}]}`
Signed out of Strava: `{"providers":[{"provider":"strava","state":"disconnected","account":null,
"connectedAt":null,"lastExportAt":null,"pendingExports":0,"failedExports":0}]}`. The server always
lists every `Provider` literal; Apple Health is an app-side static row (§8), not a `Provider`.

## 2. DB (`packages/db/src/schema/integration.ts`, migration `0004_integrations.sql`)

Not synced: no `rowColumns()`, no `server_seq`, never in `SyncTable`/`EntityName`. Plain columns:
```sql
CREATE TABLE `integration` (
  `id` text PRIMARY KEY NOT NULL, `user_id` text NOT NULL, `provider` text NOT NULL,
  `status` text NOT NULL,                       -- 'active' | 'revoked'
  `external_id` text NOT NULL,                  -- Strava athlete id, as text
  `display_name` text NOT NULL,                 -- shown only to this user (§Policy 5.3: never to MCP)
  `access_token` text NOT NULL, `refresh_token` text NOT NULL,   -- sealed (§3), never plaintext
  `expires_at` text NOT NULL, `scope` text NOT NULL,
  `created_at` text NOT NULL, `updated_at` text NOT NULL
);
CREATE UNIQUE INDEX `integration_user_provider_unique` ON `integration` (`user_id`,`provider`);
CREATE TABLE `activity_export` (
  `id` text PRIMARY KEY NOT NULL, `user_id` text NOT NULL, `provider` text NOT NULL,
  `session_id` text NOT NULL, `status` text NOT NULL, `attempts` integer DEFAULT 0 NOT NULL,
  `next_attempt_at` text NOT NULL, `external_activity_id` text, `last_error` text,
  `created_at` text NOT NULL, `updated_at` text NOT NULL
);
CREATE UNIQUE INDEX `activity_export_user_provider_session_unique` ON `activity_export` (`user_id`,`provider`,`session_id`);
CREATE INDEX `activity_export_due_idx` ON `activity_export` (`status`,`next_attempt_at`);
```
Generated with `pnpm -F @tanren/db generate` (drizzle-kit; snapshot `0004_snapshot.json` + journal).
Workerd test setup applies migrations by list (`apps/worker/src/testing/workerdSetup.ts`,
`TEST_MIGRATIONS`): add 0004 there. Repos (`packages/db/src/repositories/Integration.ts`):
```ts
interface IntegrationRepoShape {
  readonly get: (userId: UserId, provider: Provider) => Effect<Option<IntegrationRow>, PersistenceError>
  readonly upsert: (row: IntegrationRow) => Effect<void, PersistenceError>        // on (user_id, provider)
  readonly setTokens: (id: Uuid, t: { access, refresh: SealedToken; expiresAt: Timestamp; updatedAt }) => Effect<void, …>
  readonly markRevoked: (id: Uuid, updatedAt: Timestamp) => Effect<void, PersistenceError>
  readonly remove: (userId: UserId, provider: Provider) => Effect<void, PersistenceError>  // + its exports, one batch
}
interface ActivityExportRepoShape {
  readonly enqueue: (rows: ReadonlyArray<NewExport>) => Effect<void, PersistenceError>   // INSERT OR IGNORE, one batch
  readonly claimDue: (now: Timestamp, opts: { userId: Option<UserId>; max: number }) => Effect<ReadonlyArray<ExportRow>, …>
      // pending with next_attempt_at <= now, or running with updated_at < now − 10 min; each claimed by
      // `UPDATE … SET status='running' WHERE id=? AND status=<seen>` and kept only when `changes === 1`
  readonly settle: (id, outcome: Sent | Failed | Dead | Pending(nextAttemptAt)) => Effect<void, …>
  readonly list: (userId: UserId, provider: Provider, limit: number) => Effect<ReadonlyArray<ExportRow>, …> // created_at desc
  readonly resetToPending: (userId: UserId, id: ActivityExportId, now: Timestamp) => Effect<boolean, …>  // false = not found/not failed|dead
  readonly counts: (userId, provider) => Effect<{ pending: number; failed: number; lastSentAt: Option<Timestamp> }, …> // 1 statement
}
```
`IntegrationRow`/`ExportRow` are db-internal `Schema.Struct`s (decode with `transformResultNames`
camelCase like the other repos). The seed adds nothing (the console provider is for QA).

## 3. Worker config and sealing (`Config.ts`, `Env.ts`, `integrations/TokenSeal.ts`)

| name | kind | local (`wrangler.jsonc` vars) | production |
| --- | --- | --- | --- |
| `STRAVA_MODE` | var, `console` \| `provider` | `console` | `provider` |
| `STRAVA_CLIENT_ID` | var (public id) | `local-strava-client` | owner value |
| `STRAVA_CLIENT_SECRET` | secret | absent | `wrangler secret put STRAVA_CLIENT_SECRET --env production` |
| `INTEGRATION_TOKEN_KEY` | secret, 32 bytes base64 | `AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=` (fake) | `openssl rand -base64 32` |

Guard (same style as `EMAIL_MODE`): `STRAVA_MODE=console` only when `ENVIRONMENT=local`; `provider`
needs `STRAVA_CLIENT_SECRET`; the fake key is refused outside `local`; the key must decode to exactly
32 bytes. Config fields: `stravaMode`, `stravaClientId`, `stravaClientSecret: Option<Redacted>`,
`integrationTokenKey: Redacted`. Redirect URI is derived, not configured:
`${betterAuthUrl}/integrations/strava/callback` (must be under the registered callback domain
`api.tanren.me`; localhost is allowed by Strava — spike §1).
`TokenSeal` service: `seal(plain: Redacted<string>) → Effect<SealedToken>`, `open(sealed) →
Effect<Redacted<string>, TokenSealError>`; AES-256-GCM via `crypto.subtle` (`importKey("raw")`,
12-byte random IV from `crypto.getRandomValues`), wire `v1.<iv b64url>.<ciphertext b64url>`;
`TokenSealError` is `Data.TaggedError` (internal). Test: seal→open round trip, tampered tag fails,
wrong key fails. `wrangler.jsonc`: `"triggers": { "crons": ["*/5 * * * *"] }` at top level and in
`env.production` (VERIFY: whether an env inherits top-level `triggers`; duplicating is harmless).

## 4. Connect flow and security (checklist answers)

```
app  POST /integrations/strava/connect {returnTo}   (Authentication: cookie on web, bearer on native)
     ← {url: https://www.strava.com/oauth/authorize?client_id&redirect_uri&response_type=code
              &approval_prompt=auto&scope=activity:write&state=<state>}
app  opens url: web → window.location.assign(url); native → Linking.openURL(url)
Strava → GET /integrations/strava/callback?state&code&scope   (or ?error=access_denied&state)
worker verifies state → exchanges code → upserts integration → 303 to returnTo?connected=strava
       (http(s) returnTo) or 200 HTML "Connected to Strava — Open Tanren" link (exp/exps/tanren)
```
- **`state`** = `base64url(JSON {userId, returnTo, expiresAt})` + `"."` + HMAC-SHA256 over it keyed
  by `INTEGRATION_TOKEN_KEY` (reuse `mac`/`macMatches` from `auth/nativeCode.ts`: export them, do
  not duplicate; VERIFY their exact signatures at nativeCode.ts:72/82). `expiresAt` = now + 10 min.
  VERIFY: Strava's maximum `state` length (keep it under 600 chars; returnTo ≤ 512).
- **Cookie-bearing GET that mints a secret**: the callback is the minting GET. It binds the user to
  `state.userId` (signed by us from an authenticated POST) and ignores cookies and bearer entirely,
  so a cross-site GET cannot attach an attacker's Strava to a victim (login CSRF), nor a victim's
  code to an attacker (the state names the victim's own account only if the victim started it).
- **Redirect target**: `returnTo` allowed iff `new URL(raw).href === raw`, no `search`, no `hash`,
  no credentials, and either `raw === origin + "/settings/integrations"` for an `allowedOrigins`
  entry, or `raw.startsWith(prefix)` for a `nativeReturnPrefixes` entry AND `pathname` ends with
  `/--/settings/integrations`. Production prefixes: `https://tanren.me/settings/integrations`,
  `exps://u.expo.dev/<projectId>/--/settings/integrations`. Checked at `connect` (400
  `ConnectRejected{reason:"return-to"}`) and again at the callback (defensive; 400 HTML).
  Bypass tests: `https://tanren.me/settings/integrations/../x`, `%2e%2e`, `https://tanren.me.evil`,
  `https://evil/settings/integrations`, `exps://u.expo.dev/<other id>/--/settings/integrations`,
  `https://tanren.me:1x/…`, a `?x=` query, a `#` fragment.
- **Canonicalisation**: `new URL(raw).href === raw` plus the exact-string/prefix rule above.
- **Token exposure**: callback responses carry `Cache-Control: no-store`, `Referrer-Policy:
  no-referrer`; the code, tokens and `state` are never logged (log `userId` + outcome only);
  nothing secret is in the redirect URL. The HTML page escapes `returnTo` with `escapeHtml`
  (`oauth/pages.ts`).
- **Binding before consume**: signature and `expiresAt` are checked, then the user id is looked up
  (`IntegrationRepo` upsert will fail FK-less, so verify the user exists via `ProfileRepo.get` is
  NOT required — the state is signed by us; skip), then `scope` must contain `activity:write`
  (`?error=scope` otherwise, no exchange), then the code is exchanged once. A replayed state after a
  successful exchange fails at Strava (code single-use); no nonce store in v1.
- **Rate limiting**: `connect` and `callback` reuse the isolate limiter (`makeLimiter`,
  `nativeAuthRoutes.ts`, 10/min/IP) → 429 `NativeRateLimited` (VERIFY: export `makeLimiter` or
  move it to `auth/rateLimit.ts`; one-line change, owned by the connect task).
- Callback errors: bad/expired state → 400 HTML "This link has expired. Start again from Settings";
  `error=access_denied` → return with `?error=denied`; exchange failure → `?error=provider`; the
  app maps `denied|scope|provider` to copy (§8).

## 5. HttpApi (`api/IntegrationsApi.ts`, `api/IntegrationsHandlers.ts`; added to `Api` in `Api.ts`)

| method path | auth | payload → success | errors |
| --- | --- | --- | --- |
| `GET /integrations` | Authentication | — → `IntegrationsStatus` | Internal |
| `POST /integrations/strava/connect` | Authentication | `ConnectRequest` → `ConnectResponse` | `ConnectRejected`, `NativeRateLimited`, Internal |
| `GET /integrations/strava/callback` | none (signed state) | query `state, code?, scope?, error?` → 303 / HTML | plain `HttpRouter` route, not HttpApi (HTML + 303) |
| `DELETE /integrations/strava` | Authentication | — → 204 | `IntegrationNotConnected`, Internal |
| `GET /integrations/strava/exports?limit=` | Authentication | → `Array<ActivityExport>` | `ValidationError`, Internal |
| `POST /integrations/strava/exports/retry` | Authentication | `RetryExportRequest` → `ActivityExport` | `NotFound{entity:"activityExport"}` (add the literal to `EntityName`), `IntegrationNotConnected`, Internal |

`retry` = `resetToPending` then `ExportQueue.drain({ userId, max: 1 })`, answers the row after the
attempt. `DELETE` revokes best effort (`StravaApi.revoke`; failure → `logWarning`), then `remove`.
Add the two authenticated GETs and the DELETE to `Routes.edge.test.ts` (401 signed out).

## 6. Export pipeline (`integrations/ExportQueue.ts`, `integrations/StravaApi.ts`, `integrations/activityText.ts`)

- `Sync.push` (worker `sync/Sync.ts`) after `store.apply`: `ExportQueue.enqueueCompleted(userId,
  request.changes, result.accepted)` → `ExportQueue.drain({ userId: Some(userId), max: 1 })` within
  `Effect.timeout("5 seconds")`; both wrapped so a failure is logged (`Effect.catch` → `logWarning`)
  and never fails the push. `enqueueCompleted` returns early (0 statements) when
  `IntegrationRepo.get(userId, "strava")` is `None` or `revoked`; otherwise rows =
  `changes.filter(c => c.table === "session" && accepted has c.row.id && c.row.finishedAt !== null
  && c.row.deletedAt === null)` (the change row is the wire `Session`; completion =
  `finishedAt: Some`, `deletedAt: None`, ADR-0018 §4) → `enqueue` with `next_attempt_at = now`.
- `drain({ userId, max })`: `claimDue` → for each row: load session (`SessionRepo.getSession`), sets
  (`listSets`), exercises (`ExerciseRepo.list`), profile (`ProfileRepo.get`, for `timezone` and
  nothing else); `session_missing` (deleted or absent) → `dead` immediately; ensure a fresh token
  (§7); `StravaApi.createActivity`; `settle(Sent{externalActivityId})`. Statement budget ≤ 8/row.
- Backoff on `transport | provider_error | rate_limited`: attempts 1..5 → +1 m, +5 m, +30 m, +2 h,
  +12 h; attempt 5 failing → `dead`. `rejected` (4xx other than 401/429) → `failed` at once (the
  user can Retry). Pure `nextAttempt(attempts, now)` with a test.
- `scheduled` handler (`index.ts`): `export default { fetch: (r, e, c) => provider.fetch(r, e, c),
  scheduled: (_ctrl, env, ctx) => ctx.waitUntil(runScheduled(env)) }` where `runScheduled` runs
  `ExportQueue.drain({ userId: None, max: 10 })` on a `ManagedRuntime` built from `d1Persistence`.
  VERIFY: `OAuthProvider.fetch` callable as a method (`provider.ts` returns the instance; the test
  `index.workerd.test.ts` boots the default export — keep it green). Local:
  `wrangler dev --test-scheduled` + `curl "localhost:<port>/cdn-cgi/local/scheduled?cron=*/5+*+*+*+*"`
  (Cloudflare docs, 2026-10-26).
- `StravaApi` port: `exchangeCode(code) → TokenGrant`, `refresh(refreshToken) → TokenGrant`,
  `createActivity(accessToken, NewActivity) → { id: string }`, `revoke(accessToken) → void`;
  `TokenGrant = { accessToken, refreshToken: Redacted; expiresAt: Timestamp; scope: string;
  athlete: { id: string; displayName: Label } }`. Error `StravaRequestFailed { reason:
  ExportFailureReason; status: Option<number> }` (`Data.TaggedError`; 401 → `unauthorized`, 429 →
  `rate_limited`, other 4xx → `rejected`, 5xx → `provider_error`, no response → `transport`).
  `layerHttp` (effect/http `HttpClient`, `FetchHttpClient`, form-encoded bodies, `User-Agent:
  tanren/1`), `layerConsole` (logs `[strava:console] create activity <name> <start> <elapsed>s`,
  returns `{ id: "console-" + sessionId.slice(0, 8) }`, exchange returns athlete "Console
  Athlete"). Endpoints (spike §1–2): `POST https://www.strava.com/oauth/token`, `POST
  https://www.strava.com/api/v3/activities`, `POST https://www.strava.com/oauth/revoke` (Basic
  `client_id:client_secret`, body `token`). Never read anything else from Strava (Policy §5.3).
- `NewActivity` (spike §2): `name` = `PlannedSession.name` when `plannedSessionId` resolves
  (`PlanRepo`; VERIFY the lookup method name) else `"Strength training"`; `sport_type:
  "WeightTraining"`; `trainer: 1`; `start_date_local` = `startedAt` in the profile `timezone` as
  `YYYY-MM-DDTHH:mm:ss` without offset (`DateTime.makeZoned` + format; VERIFY on the first real
  run that Strava reads it as local — the console log shows the exact string; fallback: send
  `startedAt` ISO with `Z`); `elapsed_time` = `max(60, seconds(finishedAt − startedAt))`;
  `description` = `describeSession(...)` (pure, tested):
  ```
  Bench Press — 4 × 8 @ 60 kg
  Lat Pulldown — 3 sets · 10/10/8 reps @ 50 kg
  Plank — 3 × 45 s            (reps shown as-is when weightKg is 0: "3 × 45 @ bodyweight" → VERIFY copy)

  12 sets · 2 340 kg lifted · 48 min
  Logged with Tanren
  ```
  Exercise order = first `loggedAt`; name from `Exercise.name` (deleted exercise → "Exercise");
  uniform reps → `n × r`, else `n sets · r1/r2/… reps`; weight = max weightKg; total = Σ weightKg
  × reps; truncate exercise lines to keep ≤ 1 000 chars, ending the list with `…`.

## 7. Token lifecycle

`freshToken(integration)`: if `expiresAt − now < 1 h` → `StravaApi.refresh(open(refreshToken))` →
`setTokens` with BOTH rotated tokens sealed in one UPDATE (spike §1: the old refresh token dies at
once) → use the new access token. `createActivity` → `unauthorized`: re-read the row; if `updatedAt`
changed since we read it, retry once with its token; else `markRevoked` + settle `failed
{unauthorized}`; the status endpoint then reports `state: "revoked"` and the app shows Reconnect.
A re-connect upserts the row back to `active` and the user retries the failed rows.

## 8. App — Integrations page (Forge, `ui-direction-final.md`; desktop `ui-desktop.md`)

Routes: `apps/mobile/app/settings/integrations/index.tsx` (list) and
`apps/mobile/app/settings/integrations/[provider].tsx` (detail). Settings gets a row.
```
Settings (390)                                   content width 358 = 390 − 2×16
┌ SettingsSection "Integrations" ───────────────┐
│ [link] Integrations                 Strava ›  │   ListRow icon="swap" title subtitle="Strava · Not connected" chevron
└───────────────────────────────────────────────┘   (icon "link" does not exist: use `swap`; or add `link` to iconPaths — UI task decides, lists it)

Integrations (390): AppBar "Integrations" ‹ back · Page scroll wide
┌ ListGroup ─────────────────────────────────────┐
│ [swap] Strava                 Connected  ›     │   StatusPill tone success | "Not connected" neutral | "Reconnect" danger
│        Last export 26 Oct, 19:40               │   subtitle: "Last export <date>" | "Exports finished sessions" | "<n> failed"
│ [heart] Apple Health      Needs app build      │   ListRow disabled, trailing StatusPill neutral; no chevron, no onPress
└────────────────────────────────────────────────┘
Row arithmetic: 16 gutter + 358 content + 16; inside the row 16 pad + 24 icon + 12 gap + title
column (flex) + 8 gap + pill ≤ 120 + 8 gap + 16 chevron + 16 pad = 358 → title column ≥ 358−16−24−12−8−120−8−16−16 = 138.
Banner above the group after a return: `?connected=strava` → Banner success "Strava connected"
(dismiss); `?error=denied` → "Strava access was declined"; `?error=scope` → "Tanren needs permission
to create activities. Connect again and keep 'Upload your activities' ticked"; `?error=provider` →
"Strava did not answer. Try again". Read the params with `useLocalSearchParams`, then
`router.setParams({})` so the banner does not return on re-render (VERIFY API name).

Strava detail (390): AppBar "Strava" ‹ back
┌ Card ───────────────────────────────────────────┐
│ Connected as Lukas K.                 [success] │   disconnected: "Not connected" + body copy
│ Finished sessions are posted as                 │
│ 'Weight Training' activities. One way; Tanren   │
│ never reads your Strava data.                   │
│ [ Connect with Strava ]  48 px button           │   Button variant primary size lg, full width 326 = 358 − 2×16 card pad
│   / [ Disconnect ]  Button variant="secondary" tone? → ListRow tone="danger" "Disconnect Strava"
└─────────────────────────────────────────────────┘
Section "Recent exports" (ListGroup, newest first, ≤ 20):
│ [check] 26 Oct · Push day         Sent  ›     │   onPress opens https://www.strava.com/activities/<externalActivityId> ("View on Strava", Linking)
│ [clock] 25 Oct · Legs             Pending      │   subtitle "Exports within 5 minutes"
│ [warning] 24 Oct · Pull           Failed  [Retry] │  trailing Button size sm "Retry" → POST retry; tone danger pill
Row title = session date + planned name from the local store (`HistoryRepo` by `sessionId`; fallback "Session").
Empty: EmptyState "No exports yet — finish a session and it shows up here".
Branding (spike §4): the connect control must read "Connect with Strava" and be ≥ 48 px high; the
activity link text is "View on Strava"; the app name stays "Tanren". VERIFY: Strava's button image
asset is required or text is acceptable (guidelines page); default to the Forge primary Button with
label "Connect with Strava" and record the guideline check in the UI task's report.
```
Desktop (≥ 900): both routes `Page wide` + `Columns 5/7`: main = provider card (detail) / provider
group (list), side = Recent exports (detail) / explanatory Card "About integrations" (list). States
(loading Skeleton, error Banner with Retry, offline "Signed in (offline)" copy from Account) stay
single-column on `settings/integrations` and `settings/integrations/strava` at every width.
Accessibility: each row `accessibilityLabel` = "<provider>, <state>"; the Retry button
"Retry export of <title>"; banners `role="status"`.
Service `apps/mobile/src/services/Integrations.ts` (pattern `Account.ts`: `HttpClient` +
`withSession`, `REQUEST_TIMEOUT` 5 s): `status`, `connect(returnTo) → url`, `disconnect`,
`exports(limit)`, `retry(id)`; errors `IntegrationsRequestFailed { reason: "offline" | "server" |
"not-connected" }` (`Data.TaggedError`). `returnTo` = web: `window.location.origin +
"/settings/integrations"`; native: `Linking.createURL("/settings/integrations")` (expo-linking,
the same helper the native sign-in uses for `/auth/callback` — VERIFY the file). Opening: web
`window.location.assign(url)`; native `Linking.openURL(url)`. Hook `useIntegrations` refetches on
focus (`useFocusEffect`) so the status is fresh after the browser round trip.

## 9. Local end-to-end (QA script)
1. `pnpm db:reset` (applies 0004) → `pnpm dev` (worker :8787 with `STRAVA_MODE=console`, web :8790).
2. Sign in on web; Settings → Integrations → Strava → Connect with Strava: the console provider
   short-circuits `connect`: the returned `url` is the local callback itself with a fake `code`
   (`console` mode only), so the browser lands on `/settings/integrations?connected=strava`.
3. Log a set, finish the session (Today "Finish"), wait for the push → worker log shows
   `[strava:console] create activity …`; `GET /integrations` shows `lastExportAt`; detail lists `Sent`.
4. `curl "localhost:8787/cdn-cgi/local/scheduled?cron=*/5+*+*+*+*"` with a `pending` row → `sent`.
5. Disconnect → status `disconnected`, exports list empty.
