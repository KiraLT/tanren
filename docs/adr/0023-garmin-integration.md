# ADR-0023 — Garmin: personal API token pasted in Settings, Worker-owned pull on the export cron, synced import tables

Status: accepted (Lead decision under plan Amendment 3, 2026-10-27; owner reviews asynchronously)
Inputs: plan Amendment 19 (owner: "enter your personal API token"), ADR-0018 (Strava pattern), spike G1
`docs/research/2026-10-27-garmin-personal-api.md` (observed 2026-10-27; cited "G1 Answer" / "G1 Observation").

## Context
Garmin's free Personal tier (G1 Answer): the user creates a **key** at connect.garmin.com (lifetime 30/90/180/365
days, chosen at creation, shown once, not readable afterwards; deleting it kills its tokens). The key is exchanged
(`POST /personalapitoken-service/personal-api/personal-api-key/token`, `Authorization: ApiKey <key>`) for a 24 h
RS256 JWT used as `Bearer` on 27 read-only GETs at `https://personal.connectapi.garmin.com`; no refresh token, no
OAuth, no webhooks, no rate-limit headers (ceiling unknown). Activities paginate by `start`/`limit ≤ 200` with a
`startDate`/`endDate` filter; dailies `≤ 365 d`; full history readable. Terms: "individual Garmin users … their own
data", "not intended for commercial applications serving multiple end users" — Tanren is a single-owner personal
tracker, which fits; this feature is **owner-scoped** and promises nothing multi-user. There is no redirect flow to
bind: the user pastes a secret. Strava (ADR-0018) already gives us the sealed `integration` row, `TokenSeal`, the
`*/5` cron (`integrations/scheduled.ts`) and the Settings → Integrations page. Feed (ADR-0017) and Today read only
local synced tables; Garmin data must show offline. KV is being retired (ADR-0022), so the 24 h JWT needs a home.

## Decision
1. **Key path.** `POST /integrations/garmin/connect { token }` (session-authenticated, rate-limited like
   `strava-connect`). The Worker exchanges the key for a JWT (that *is* the validation: 401 → rejected), reads
   `/userprofile-service/userprofile/settings` for `displayName`, and stores one `integration` row (`provider:
   "garmin"`) in Strava's exact shape: `refreshToken` = sealed **key** (the long-lived credential), `accessToken` =
   sealed **JWT**, `expiresAt` = the JWT's `exp`. The cron re-exchanges the key when `expiresAt − now <
   REFRESH_MARGIN` (1 h, `ExportQueue.ts`), i.e. once a day, not 288×. The key's own expiry is not readable:
   Settings shows "Key added <connectedAt>" and "Garmin keys expire 30–365 days after creation; renew at
   connect.garmin.com". The app sends the key once over TLS and never stores it. `DELETE /integrations/garmin`
   deletes the row **and soft-deletes every `imported_activity` / `daily_health` row** of the user (`deletedAt`
   set, so the app's copy is removed by the next pull — Garmin data is not ours to keep after disconnect).
2. **Pull model.** Same cron, second drain: `GarminPull.drain({ max })` runs after `ExportQueue.drain` in
   `runScheduled`. Per active Garmin integration: activities since the stored cursor (`integration.scope`
   column reused as a JSON cursor `{ activitiesSince, healthThrough }`; no new column): the activity **list**
   endpoint only (`startDate`/`endDate`, `limit=200`, paged by `start`; no per-activity detail call, no FIT), then
   `usersummary/daily?calendarDate=` for each missing day up to 7. Budget ≤ 10 subrequests per user per run
   (1 exchange + ≤ 2 pages + 7 dailies); `GARMIN_MAX_USERS_PER_RUN = 4` keeps a run under the 50-subrequest limit.
   Upserts are idempotent on `(user_id, provider, external_id)` / `(user_id, provider, date)`. 401 on the key
   exchange → `markRevoked` (Settings: "Key rejected — paste a new one"); 401 on a data call → re-exchange once,
   then revoked; 429/5xx → skip the user this run; other errors are logged with the reason literal only. First
   connect back-fills 30 days inline, bounded by the request's 5 s budget, the rest on the cron. Strength
   activities (`summarizedExerciseSets`) are imported as plain activities in v1; mapping them to Tanren sessions
   is a later amendment.
3. **Data model.** Two **synced** tables, pull-only from the app's view: `imported_activity` and `daily_health`
   (migration `0007_garmin_import.sql`, `rowColumns()` + `server_seq`, `SyncTable` members `importedActivity`,
   `dailyHealth`). The Worker writes them through `SyncStore` so `server_seq` and the pull cursor behave exactly as
   for app rows; `Sync.push` rejects any client change on them with `forbidden`. Garmin ids are stored as
   `externalId` text; the row id is a UUID minted by the Worker (deterministic v5 is not needed: the unique index
   keeps upserts idempotent).
4. **UI.** Feed shows `imported_activity` as an `ImportedCard` interleaved by `startedAt` with sessions; the
   detail is a minimal `app/activity/imported/[id].tsx`. Today shows a one-line "Today · 1 840 kcal · 8 420 steps"
   strip under the AppBar in `Empty` and `Ready` states when a `daily_health` row exists for the local date.
   Settings → Integrations gets the Garmin row and `GarminCard` (paste field, states, disconnect).
5. **Privacy.** Only the owner's own data; nothing from Garmin is read by any MCP tool (same rule as ADR-0018 §6,
   `grep -rn "imported_activity\|daily_health" apps/worker/src/mcp` = 0). Legal (ADR-0024) gets the one-paragraph
   data description (design §10).

## Consequences
- Reuses `integration`, `TokenSeal`, `scheduled.ts`, the Integrations page: no new binding, cron or table for tokens.
- Two new synced tables touch every sync registry (`SyncTable`, `SyncChange`, `ROW_TABLE/ROW_KEYS`, db
  `SyncStore`, worker `wrap`, mobile `migrations.ts` v4, `LocalStore` members): one foundation task, then parallel.
- The rate ceiling is unknown (G1): the pull is conservative (7-day health, 4 users per cron, list endpoint only).
- Owner-scoped by Garmin's terms; `ProviderList` copy says "your own Garmin data", never "connect your users".
- Owner steps: regenerate the test key after QA (the spike printed a partial token once); paste the real key in
  Settings; renew the key before its chosen expiry (Garmin emails a week before).
- The `scope` column doubles as the Garmin cursor: documented in the schema comment; a dedicated column is the
  obvious v2 if a third pull provider arrives.

## Alternatives considered
- Not synced, read through `GET /integrations/garmin/activities`: feed and Today would be online-only; rejected.
- A separate token table: `integration` already seals two tokens per row and has the unique key; rejected.
- Deterministic (v5) UUIDs from the Garmin id: a dependency for no gain over the unique index; rejected.
- Expo SecureStore on-device token with the app pulling Garmin directly: CORS on web is unknown and the token
  would leave the Worker's control; rejected.
- Delete imported rows on disconnect (hard): breaks sync (the app keeps a ghost); soft delete instead.

Not decided: .FIT download (laps, HR series), Women's Health, a per-activity "View on Garmin" link (G1: is there a
stable URL), and widening the feed card to a map — all deferred to a later amendment.
