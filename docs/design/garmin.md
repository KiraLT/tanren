# Garmin import — design (ADR-0023; plan Amendment 19)

Normative for `docs/tasks/v5-garmin.md`. Pattern source: `docs/design/integrations.md` (Strava). Spike G1 =
`docs/research/2026-10-27-garmin-personal-api.md` (Observation table + Answer; the extracted OpenAPI spec is at
`$S/garmin/spec.json`, scratchpad only). Vocabulary: the owner pastes a **key**; the Worker exchanges it for a 24 h
**JWT**. The wire field stays `token` (owner's word), UI copy says "personal API token".

## 0. Garmin facts (G1) and the remaining `VERIFY:`s
| key | value | source / owner |
| --- | --- | --- |
| base URL | `https://personal.connectapi.garmin.com` (env `GARMIN_BASE_URL`, that default) | G1 Answer |
| key → JWT | `POST /personalapitoken-service/personal-api/personal-api-key/token`, `Authorization: ApiKey <key>` → 200 `text/plain` RS256 JWT, `exp − iat = 24 h`; bad key → 401 empty body | G1 Observation |
| data auth | `Authorization: Bearer <jwt>`; bad → 401 `www-authenticate: Bearer error="invalid_token"`; missing → 400 | G1 Observation |
| JWT exp | decode the payload's `exp` (base64url JSON, no signature check needed: we only schedule the re-exchange) → `expiresAt`; unparsable → `now + 23 h` | GM-3 |
| display name | `GET /userprofile-service/userprofile/settings` → `displayName` | G1 Observation |
| activities | `GET /activitylist-service/activities/search/activities?limit=200&start=N&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`; page until a page returns < 200 | G1 Observation |
| list item fields | `VERIFY:` in `$S/garmin/spec.json` (GM-3 reads it): `activityId`, `activityName`, `activityType.typeKey`, `startTimeGMT`, `duration` (s), `distance` (m), `calories`, `averageHR`, `maxHR`; strength items also `summarizedExerciseSets` (ignored v1) | GM-3 |
| daily health | `GET /usersummary-service/usersummary/daily?calendarDate=YYYY-MM-DD` → `activeKilocalories`, `bmrKilocalories`, `steps` (`VERIFY:` exact key: `totalSteps` or `steps`), `restingHeartRate`; `totalCalories = active + bmr` | G1 Observation; GM-3 |
| windows | activities: date filter, no max span observed (use 30 d back-fill in one filtered query, 200 per page); dailies ≤ 365 d | G1 Answer |
| rate limit | none advertised; 40 rapid calls fine; ceiling unknown → ≤ 10 subrequests per user per run, 4 users per run | G1 Answer |
| key lifetime | 30/90/180/365 d chosen at creation, not readable via API; Garmin emails a week before | G1 Answer |
| terms | own data, individual users, not multi-user commercial → owner-scoped copy (§8), §10 paragraph | G1 Answer |
| activity URL | `VERIFY:` `https://connect.garmin.com/modern/activity/<activityId>` opens in a browser (GM-6 tries once with the owner's account signed in); if not, no link in v1 | GM-6 |

## 1. Shared schemas (`packages/shared/src/garmin.ts`, new; `integrations.ts` additive; exported from `index.ts`)
`integrations.ts` (additive only; STLS does not own it):
```ts
export const Provider = Schema.Literals(["strava", "garmin"])            // was ["strava"]
export const ExportFailureReason = Schema.Literals([ …existing 7…, "token_rejected" ])
/** Garmin's paste-token connect body. The token is never echoed, logged or stored on the device. */
export const GarminConnectRequest = Schema.Struct({
  token: Schema.Trimmed.check(Schema.isMinLength(16), Schema.isMaxLength(512)),
})
/** Validation failed: Garmin answered 401/403 (`rejected`), or the Worker has no `GARMIN_MODE=provider` (`not-configured`). */
export class GarminTokenRejected extends Schema.TaggedError<GarminTokenRejected>()(
  "GarminTokenRejected", { reason: Schema.Literals(["rejected", "not-configured", "unreachable"]) }, { httpApiStatus: 400 }) {}
```
`ProviderStatus` is unchanged (the Garmin row reports `pendingExports/failedExports/blockedExports = 0`,
`lastExportAt = None`) plus one **optional** key so every existing Strava fixture still decodes equal:
```ts
imports: Schema.optionalKey(Schema.Struct({
  lastPullAt: Schema.OptionFromNullOr(Timestamp),      // last successful drain of this user
  lastError: Schema.OptionFromNullOr(ExportFailureReason),
  activities: Count,                                    // live imported_activity rows
  days: Count,                                          // live daily_health rows
}))
```
`ids.ts`: `ImportedActivityId = Uuid.pipe(Schema.brand("ImportedActivityId"))`, `DailyHealthId` likewise.
`common.ts`: `EntityName` + `"importedActivity"`, `"dailyHealth"`; `SyncTable` picks both.

`garmin.ts`:
```ts
export const ImportedSport = Schema.Literals(["running", "walking", "cycling", "swimming", "hiking", "strength", "cardio", "other"])
export class ImportedActivity extends Schema.Class<ImportedActivity>("ImportedActivity")({
  ...rowFields(ImportedActivityId),
  provider: Provider,
  /** Garmin's activityId as text; unique per (userId, provider). */
  externalId: Schema.Trimmed.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  sport: ImportedSport,
  /** Garmin's activityName, trimmed to Label; fallback = sport title-cased. */
  title: Label,
  startedAt: Timestamp,
  durationSeconds: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  distanceMeters: Schema.OptionFromNullOr(Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))),
  calories: Schema.OptionFromNullOr(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  avgHeartRate: Schema.OptionFromNullOr(Schema.Int.check(Schema.isBetween(20, 260))),
  maxHeartRate: Schema.OptionFromNullOr(Schema.Int.check(Schema.isBetween(20, 260))),
}) {}
export class DailyHealth extends Schema.Class<DailyHealth>("DailyHealth")({
  ...rowFields(DailyHealthId),
  provider: Provider,
  /** The device's local calendar day; unique per (userId, provider, date). */
  date: LocalDate,
  totalCalories: Schema.OptionFromNullOr(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  activeCalories: Schema.OptionFromNullOr(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  steps: Schema.OptionFromNullOr(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  restingHeartRate: Schema.OptionFromNullOr(Schema.Int.check(Schema.isBetween(20, 260))),
}) {}
/** Garmin activityType key → ImportedSport; unknown → "other". VERIFY: G1 field name + sample keys. */
export const sportOf = (garminType: string): ImportedSport
```
Insert/Patch variants follow `program.ts` (`mapFields(Struct.omit(ROW_COLUMNS))`). `row.ts`: `ImportedActivityRow`,
`DailyHealthRow` via `wireRecord`, `ROW_TABLE.importedActivity = "imported_activity"`, `ROW_TABLE.dailyHealth =
"daily_health"`, `ROW_KEYS` both. `sync.ts`: `SYNC_TABLES` + both, `SyncChange` + `member(...)` both.
Checked 13:05: `Label`, `LocalDate`, `Timestamp`, `rowFields`, `ROW_COLUMNS` in `common.ts`; `Uuid` in `ids.ts`.

## 2. DB (`packages/db/src/schema/garmin.ts`, migration `0007_garmin_import.sql`; after STLS's 0006 is committed)
Both tables: `...rowColumns()` (sync.ts:7) + the §1 columns in snake_case, `userSeqIndex`, and
`imported_activity_user_provider_external_unique (user_id, provider, external_id)`,
`daily_health_user_provider_date_unique (user_id, provider, date)`, plus `imported_activity_user_started_idx
(user_id, started_at)`. `schema/integration.ts`: comment on `scope` — "Strava: granted scope. Garmin: JSON cursor
`{"activitiesSince": Timestamp, "healthThrough": LocalDate}` (ADR-0023 §2)". `packages/db/src/sync/SyncStore.ts`:
`RowByTable`, the encode map, parent keys (none), the `wrap`-like maps + `programDayCompletion`-shaped entries for
both tables; `apps/worker/src/sync/SyncStore.ts` `wrap` + 2 lines; `apps/worker/src/testing/workerdSetup.ts`
comment "0000 to 0007". `IntegrationRepo` gains `setCursor(id, cursor: string)` (writes `scope`) and
`listActive(provider): Effect<ReadonlyArray<IntegrationRow>>`.
New repo `packages/db/src/repositories/GarminImport.ts` (`GarminImportRepo`):
```ts
upsertActivities: (userId, rows: ReadonlyArray<ImportedActivityInsert>) => Effect<number /*written*/, PersistenceError>  // INSERT … ON CONFLICT(user_id, provider, external_id) DO UPDATE every data column + updated_at + server_seq (via SyncStore.apply, not raw SQL: server_seq must come from sync_clock, db.md §3)
upsertDays:       (userId, rows: ReadonlyArray<DailyHealthInsert>) => Effect<number, PersistenceError>
softDeleteAll:    (userId, provider) => Effect<number, PersistenceError>   // deletedAt = now through SyncStore.apply, paged 500
counts:           (userId, provider) => Effect<{ activities: number; days: number }, PersistenceError>
```
Implementation rule: every write goes through `SyncStore.apply` as `SyncChange`s with the Worker as author
(`updatedAt = now`), so LWW, `server_seq` and the pull cursor are untouched. `Sync.push` (`apps/worker/src/sync/Sync.ts`)
rejects a change on either table with `RejectReason "forbidden"` before `SyncStore.apply`.

## 3. Worker (`apps/worker/src/integrations/GarminApi.ts`, `GarminPull.ts`, `Config.ts`, `wrangler.jsonc`)
Env/config (same shape as Strava, SV-3): `GARMIN_MODE` `console | provider` (local `console`, production
`provider`), `GARMIN_BASE_URL` (§0 default), optional `GARMIN_CONSOLE_FAIL: "rejected"` (console layer refuses every
key, for the revoked screenshots). `GarminApi` port:
```ts
exchange:   (key: Redacted<string>) => Effect<{ jwt: Redacted<string>; expiresAt: Timestamp }, GarminApiError>  // §0 key → JWT; 401 → "token_rejected"
profile:    (jwt: Redacted<string>) => Effect<{ displayName: Option<Label> }, GarminApiError>
activities: (jwt, window: { startDate: LocalDate; endDate: LocalDate }, start: number) => Effect<{ items: ReadonlyArray<ImportedActivityInsert>; more: boolean }, GarminApiError>  // one page of 200
daily:      (jwt, date: LocalDate) => Effect<Option<DailyHealthInsert>, GarminApiError>
class GarminApiError extends Data.TaggedError("GarminApiError")<{ reason: ExportFailureReason; status: Option<number> }>  // 401 → "token_rejected", 429 → "rate_limited", 5xx → "provider_error", fetch failure → "transport"
```
`layerHttp` (fetch, 10 s timeout, logs only method + path + status, never a header, body or query) and
`layerConsole` (deterministic fixture: 2 activities — one `running` with distance, one `strength` without — and 7
days ending today, so local QA sees cards and the strip without a key).
GM-F1 (Workers Free 10 ms CPU per cron run): `GARMIN_PAGE_SIZE = 50`, `GARMIN_MAX_USERS_PER_RUN = 1`, ≤ 2 pages per run, and the activity query spans `GARMIN_WINDOW_DAYS = 10` days from `activitiesSince` (a read window moves the cursor to the day after it, capped at yesterday), so a 30-day back-fill walks forward over 3–4 runs; this overrides the 200 / 4 / "to today" figures below.
`GarminPull` (`drain({ max: GARMIN_MAX_USERS_PER_RUN = 4 })`, `drainUser(userId)`): for each `listActive("garmin")`
row (oldest `updatedAt` first): open key + JWT (`TokenSeal.open`); if `expiresAt − now < REFRESH_MARGIN` →
`exchange` and `setTokens` (401 → `markRevoked`, stop). Read the cursor from `scope` (empty → `startDate = today −
30 d`, `healthThrough = today − 7 d`); `activities` from `activitiesSince`'s date to today, paging while `more`
(≤ 2 pages per run — a longer back-fill continues next run from the same cursor), `upsertActivities`; `daily` for
each of `healthThrough + 1 … today` (≤ 7), `upsertDays`; `setCursor({ activitiesSince: today − 1 d (re-read
yesterday: late uploads), healthThrough: today − 1 d (today is re-read every run) })`. Data-call 401 → one
`exchange` retry, then `markRevoked`. `rate_limited`/`provider_error`/`transport` → stop that user, keep the
cursor, `imports.lastError`. `scheduled.ts`: after the export drain, `yield* (yield* GarminPull).drain({ max:
GARMIN_MAX_USERS_PER_RUN })`; one `catchCause` each so a Garmin failure never blocks Strava exports.
`lastPullAt`/`lastError` live in a JSON `scope` cursor field too: `{ activitiesSince, healthThrough, lastPullAt,
lastError }` (`GarminCursor` schema in `garmin.ts`, decoded with `Schema.fromJsonString`-style codec — VERIFY the
Effect 4 name via `effect-conventions`).
Connect handler (`IntegrationsHandlers.ts`): `limit("garmin-connect:" + userId)` (same `makeLimiter`);
`exchange` → on error `GarminTokenRejected({ reason: "rejected" | "unreachable" })` (`console` mode without
`provider` config is never "not-configured": console accepts; "not-configured" = `GARMIN_MODE=provider` without a
base URL); `profile` (failure → displayName "Garmin account"); seal both; upsert `IntegrationRow { provider:
"garmin", externalId: "personal", displayName, accessToken: seal(jwt), refreshToken: seal(key), expiresAt, scope:
"", status: "active" }` (re-connect replaces the row and keeps imported rows); then `drainUser(userId)` with a 5 s
timeout (ADR-0018 §4's inline drain); respond `ProviderStatus`.

## 4. HttpApi (`api/IntegrationsApi.ts`, additive)
| route | auth | body → response | errors |
| --- | --- | --- | --- |
| `POST /integrations/garmin/connect` | Authentication | `GarminConnectRequest` → `ProviderStatus` | `GarminTokenRejected` 400, `NativeRateLimited`, Internal |
| `DELETE /integrations/garmin` | Authentication | — → 204 | `IntegrationNotConnected`, Internal |
| `GET /integrations` | Authentication | → `IntegrationsStatus` with 2 providers (`Provider.literals` loop already does this: `IntegrationsHandlers.ts` `Effect.forEach(Provider.literals`) | — |
No callback, no `returnTo`: there is no redirect in this flow.

## 5. Security checklist (architect.md; the token endpoint mints nothing but receives a long-lived secret)
- **Cookie-bearing GET that mints a secret**: none. The only secret-bearing request is a `POST` with a JSON body
  under `Authentication`; browsers cannot cross-site-POST JSON with a Lax cookie (CORS preflight, `app.ts` CORS
  allow-list — VERIFY: the engineer names the allow-list symbol in `apps/worker/src/app.ts`).
- **Redirect target / canonicalisation**: not applicable, no redirect; the Garmin URL the UI links is a constant.
- **Token exposure**: the token appears in the request body only; handler logs `userId` and the reason literal,
  never the body (`grep -n "token" apps/worker/src/api/IntegrationsHandlers.ts` shows no interpolation); the
  response is `ProviderStatus`, `Cache-Control: no-store` (as every `Authentication` route — VERIFY: where Strava
  status sets it, reuse). The app keeps the token in component state only, clears it on success/failure, passes
  `secureTextEntry`, `autoCorrect={false}`, `autoCapitalize="none"`, `textContentType="password"`.
- **Binding before consume**: validated with one Garmin read before sealing; a rejected token is never stored.
- **At rest**: `TokenSeal.seal` (AES-256-GCM, `INTEGRATION_TOKEN_KEY`), same as Strava; opened only inside
  `GarminPull`/connect, held as `Redacted`.
- **Rate limit**: `garmin-connect:<userId>` with the Strava limiter's parameters.
- **Revocation**: `DELETE` removes the row (token gone) and soft-deletes imports; Garmin 401/403 during a pull →
  `markRevoked` → Settings "Token rejected".
- **Test token hygiene**: QA reads it from `$S/secrets/garmin.token` (scratchpad, mode 600) into the paste field or
  a `curl` body; never into a file under the repo, a test fixture or a log; the owner regenerates it afterwards.

## 6. Feed card (`src/components/feed/ImportedCard.tsx`; Forge; `Card onPress`, inner 326 at 390)
Feed source: `FeedRepo.read` returns `ReadonlyArray<FeedItem>` where
`FeedItem = { _tag: "session"; activity: Activity } | { _tag: "imported"; activity: ImportedActivity }` sorted by
`startedAt` desc; `feedGroups.ts` `FeedSection.items: ReadonlyArray<FeedItem>`, `FeedRow` gains
`{ _tag: "Imported"; key; activity: ImportedActivity }`; the week summary counts sessions only (unchanged copy).
Tests pinned on `items`/`FeedRow` that change: `feedGroups.test.ts` (`toEqual` on `_tag: "Card"` rows — wrap
each fixture activity as `{ _tag: "session", activity }`), `FeedRepo.test.ts` (`toEqual` on the returned array),
`feedSelection.test.ts` (`effectiveActivity` takes `ReadonlyArray<Activity>` — pass `items.flatMap(sessionOnly)`).
```
┌ Card ──────────────────────────────────────────────────┐
│ (run)  Morning Run                      Sat 25 Oct·07:12│  head
│ 48 min      6.2 km      412 kcal      148 bpm           │  stats
│ from Garmin                                             │  source
└─────────────────────────────────────────────────────────┘
```
| row | slots | arithmetic at 326 | height |
| --- | --- | --- | --- |
| head | `Icon name=<sport glyph> size=24` in a 40 disc (`surfaceRaised`) · text column `headline` title 1 line + `caption` muted "Sat 25 Oct · 07:12" | 326 − 40 − 12 = 274 text ✓ | 22 + 18 = 40 |
| stats | `StatRow variant="tile" dense items=[{value:"48 min",label:"Duration"},{value:"6.2 km",label:"Distance"},{value:"412 kcal",label:"Calories"},{value:"148 bpm",label:"Avg HR"}]` | (326 − 3·8)/4 = 75.5 ≥ 72 ("412 kcal" at 17 px ≈ 64) ✓ — `valueVariant="headline"`, not `title2` | VERIFY: StatRow dense tile height; design assumes 56 |
| source | `caption` muted "from Garmin" | 326 | 18 |
Rows `space.md` 12 apart; card height 16 + 40 + 12 + 56 + 12 + 18 + 16 = 170. Missing values show "—" with the
label kept (`distanceMeters` None for strength/cardio). Sport glyphs: `iconPaths.ts` + `run`, `bike`, `swim`,
`walk`, `dumbbell` (VERIFY: existing names — `grep -n "^  [a-z]*:" apps/mobile/src/ui/iconPaths.ts`; reuse `zap`
for cardio, `more` for other). Press → `router.navigate({ pathname: "/activity/imported/[id]", params: { id } })`.
Detail `app/activity/imported/[id].tsx`: `Page` + `AppBar title={title}`; one `Card` with the same 4 stats as a
column `StatRow direction="column" variant="plain"` + max HR + "Imported from Garmin on <createdAt>"; `Loading`,
`NotFound` (`EmptyState icon="warning" title="Activity not found"`) states; desktop: same single column
`ColumnsView` the session detail uses (`docs/design/feed.md` §5).

## 7. Today strip (`src/components/today/HealthStrip.tsx`; `Empty` and `Ready` states of `(tabs)/today.tsx`)
`useDailyHealth(localDate)` → `Option<DailyHealth>` (query `daily_health WHERE date = ? AND deletedAt IS NULL`
order by `updatedAt` desc limit 1). Rendered directly under the AppBar inside `Page` (Empty: above `EmptyState`;
Ready: `TodayReady` (`apps/mobile/src/components/TodayReady.tsx`, `TodayReadyProps { title, accessory, exercises,
footer }`) gets a new optional `banner?: ReactNode` prop rendered above the pager).
Hidden when None. Content at 358: `Icon name="flame" size=16` · `label` "Today" · `caption` muted
"1 840 kcal · 8 420 steps · 52 bpm resting" — 16 + 8 + 38 + 8 + ≤ 288 ✓; height 36 (18 line + 2·8 + 2 border);
`surfaceRaised`, `radius.md`; `accessibilityLabel` = the same text. Missing values are dropped from the line, never
"—"; with every value None the strip is hidden. Loading/Failed states of Today never show it.

## 8. Settings (`ProviderList`, `GarminCard.tsx`, `[provider].tsx`, `integrationsCopy.ts`)
`ProviderListProps` + `garmin: ProviderStatus`; second `ListRow` (`title="Garmin"`, `subtitle` and `trailing
StatusPill` from `providerRow`, `chevron`, `onPress → /settings/integrations/garmin`), before the Apple Health row.
`PROVIDER_NAMES.garmin = "Garmin"`. Copy (`integrationsCopy.ts`, Garmin-specific keyed by provider):
| state | pill (tone) | subtitle |
| --- | --- | --- |
| disconnected | "Not connected" (neutral) | "Imports your own runs, rides and daily calories" |
| connected | "Connected" (accent) | "Last import <when>" / "First import within 5 minutes" when `imports.lastPullAt` None |
| revoked | "Token rejected" (danger) | "Garmin stopped accepting the token. Paste a new one" |
Connected card body adds two `caption` lines: "Token added <connectedAt as 'Mon 27 Oct'>" and "Garmin tokens
expire 30–365 days after creation; renew at connect.garmin.com" (the expiry is not readable, §0).
`GarminCard` (route `[provider].tsx` branch `provider === "garmin"`; props `garmin: ProviderStatus`, `zone`,
`action: ActionState`, `onConnect(token)`, `onDisconnect`):
```
┌ Card ───────────────────────────────────────┐
│ Garmin                        [Not connected]│
│ Paste your personal API token. Tanren checks │
│ it once, stores it encrypted and imports     │
│ your activities and daily calories.          │
│ ┌──────────────────────────────────────────┐ │
│ │ ••••••••••••••••••••••••••••••••••••••••  │ │   secure field, 48 high
│ └──────────────────────────────────────────┘ │
│ Get a token at connect.garmin.com → Settings │   caption, link opens the URL (Linking)
│ [            Connect Garmin                ] │   Button primary 56, disabled until ≥ 16 chars
└──────────────────────────────────────────────┘
```
Field: `TextInput` styled like `sign-in.tsx`'s `styles.input` (VERIFY: height/radius there; design 48,
`radius.md`, 1 px `border`), `secureTextEntry`, `placeholder="Personal API token"`. Connected: body "Connected as
<displayName> · <imports.activities> activities · <imports.days> days" + `Button variant="secondary" tone="danger"`
"Disconnect Garmin" (VERIFY: `Button` has `tone="danger"`; else `variant="danger"` per `grep -n "variant" Button.tsx`).
Revoked: the disconnected layout with the danger pill and a `Banner tone="danger" title="Token rejected" body=
"Garmin stopped accepting the token. Paste a new one"`. Errors from `onConnect` (`GarminTokenRejected.reason`):
`rejected` → Banner "Garmin did not accept this token"; `not-configured` → "Garmin connection goes live after the
owner enables it"; `unreachable` → "Garmin did not answer. Try again"; offline → existing offline copy. The field is
cleared after every attempt. Widths at 390: content 358, Card inner 326, field 326, button 326.
`Integrations.ts` service: `connectGarmin: (token: string) => Effect<ProviderStatus, IntegrationsRequestFailed |
GarminTokenRejected>`, `disconnectGarmin: Effect<void, …>`; `useIntegrations` `IntegrationsOverview` + `garmin`.
Adjacency: `IntegrationsSection.tsx`/`integrationsCopy.ts` sit next to STLS-5's `AccountSection.tsx`/`settingsCopy.ts`;
different files, no shared symbol — the sheet dispatches GM-6 after STLS commits anyway.

## 9. Sync (app side) — pull-only
`apps/mobile/src/store/migrations.ts` v4: `table("imported_activity", …)`, `table("daily_health", …)` with the §1
columns (JSON-less, all scalar), indexes `imported_activity_started ("startedAt")`, `daily_health_date ("date")`,
`dirtyIndex` both (the generic push scan needs it, even though the app never writes). `LocalStore.ts` members for
both (`recordMember`). The app never marks these rows dirty: no repo writes them (`grep -rn "imported_activity\|
daily_health" apps/mobile/src/services` = reads only). `DataExport.ts` includes both tables in the owner's export.

## 10. Data description for legal (ADR-0024 Assume; one paragraph, verbatim)
"If you connect Garmin, you paste a personal API token issued by Garmin to you. Tanren checks it once, stores it
encrypted on our server and uses it every five minutes to import your own Garmin activities (type, name, start
time, duration, distance, calories, heart rate) and daily summaries (calories, steps, resting heart rate). This
data is shown to you in the app and is never shared with third parties or used by the AI planning tools.
Disconnecting deletes the token and removes the imported data from your account."

## 11. Local end-to-end (QA script, GM-Q1)
`GARMIN_MODE=console`: `pnpm dev` worker + web :8790; sign in; Settings → Integrations → Garmin → paste any 16+
chars → "Connected"; `curl "http://localhost:8787/cdn-cgi/local/scheduled?cron=*/5+*+*+*+*"`; app sync → Feed shows
2 imported cards interleaved; Today strip shows the console fixture's today row; disconnect → cards gone after the
next sync. Screenshots 390 + 1280: integrations list (2 providers), garmin (disconnected, connected, revoked via
`wrangler dev --var GARMIN_CONSOLE_FAIL:rejected`), feed with an imported card, imported detail, Today with strip.
Provider mode with the owner's token (GM-Q2): `GARMIN_MODE=provider` locally, paste from the scratchpad file, one
cron curl, measured: ≥ 1 real activity row, its `startedAt` equals Garmin's start (±1 min), today's calories equal
Garmin Connect's number. Never paste the token into a repo file or a committed log; the owner regenerates it after.
After GM-F1 one cron curl imports only the first 10-day window of the 30-day back-fill (≤ 100 activities); repeat the curl 3–4 times to reach today, and check production CPU with deploy.md §Garmin "CPU check".

## 12. Not in this step
.FIT download, HR series, Women's Health, Garmin "View on" link (§0), merging a Garmin strength activity with a Tanren
session logged at the same time (duplicate card accepted in v1; noted for a later amendment), MCP exposure.
