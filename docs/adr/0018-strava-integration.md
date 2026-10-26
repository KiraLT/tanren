# ADR-0018 — Integrations: Strava one-way export, Worker-owned tokens, outbox table + cron

Status: accepted (Lead decision under plan Amendment 3, 2026-10-26; owner reviews asynchronously)
Inputs: plan Amendment 9 (owner: "setting should have integrations page, later on we may add more
integrations"), spike `docs/research/2026-10-26-strava-api.md` (facts cited as "spike §n").

## Context
The owner wants completed gym sessions on Strava, through an Integrations page in Settings that can
grow (Apple Health later, native build only, ADR-0012). Strava's API (spike §1–4): OAuth code grant,
6-hour access tokens, refresh token **rotates** on every refresh, `POST /api/v3/activities`
(`name, sport_type, start_date_local, elapsed_time`; `WeightTraining`, `trainer=1`), no delete, no
idempotency key, 200 req/15 min. API Policy §5.3 (2026-06-01) forbids Strava Data in any AI
application, including a context window; registering an app needs a paid Strava subscription.
The app is offline-first; the Worker already owns secrets, Better Auth sessions (cookie on web,
bearer on native) and the MCP server. Workers Free: 5 Cron Triggers per account, 50 subrequests per
request (Cloudflare docs, read 2026-10-26); Queues' plan availability is unverified.

## Decision
1. **Worker owns everything.** Tokens never reach the app. New Worker module `src/integrations/`;
   the app only calls `/integrations/*` endpoints and opens one URL in the browser.
2. **D1 tables, sealed tokens.** `integration` (one row per `(user_id, provider)`; Strava athlete id,
   display name, sealed access/refresh tokens, `expires_at`, granted scope, `status`
   active|revoked) and `activity_export` (the outbox: one row per `(user_id, provider, session_id)`,
   `status` pending|running|sent|failed|dead, attempts, `next_attempt_at`, `external_activity_id`).
   Migration `0004_integrations.sql`. Tokens are AES-256-GCM sealed with the secret
   `INTEGRATION_TOKEN_KEY` (32 bytes base64) before they hit D1: refresh tokens are long-lived
   third-party credentials, unlike Better Auth's own session rows. Not KV: the rows join with
   `user_id`, are deleted transactionally on disconnect, and KV is the OAuth provider's domain.
3. **Connect = POST then browser.** The app `POST`s `/integrations/strava/connect { returnTo }` with
   its session and gets the Strava authorize URL whose `state` is an HMAC-signed `{ userId,
   returnTo, expiresAt }` (10 min). `GET /integrations/strava/callback` binds the user from the
   signed state, never from a cookie (no login-CSRF, works for the bearer-only native app),
   exchanges the code, upserts `integration`, and hands the browser back to an allow-listed
   `returnTo` (`<allowed origin>/settings/integrations`, or a `NATIVE_RETURN_PREFIXES` URL ending in
   `/--/settings/integrations`) with `?connected=strava` or `?error=<reason>`. Re-connect replaces
   the row (new athlete id allowed; old exports keep their activity ids).
4. **Export trigger and queue.** A session is complete when `finishedAt` is `Some` and
   `deletedAt` is `None` (shared `Session`). `/sync/push` enqueues an `activity_export` row (`INSERT
   OR IGNORE` on the unique key) for every accepted `session` change that is complete, only when
   the user has an active Strava integration, then drains at most one of this user's due rows
   within a 5 s timeout before answering. A Cron Trigger `*/5 * * * *` drains up to 10 due rows
   across users (retries, stale `running` > 10 min, the push's timeouts). No Cloudflare Queue: a
   D1 table is testable locally (`wrangler dev --test-scheduled` →
   `/cdn-cgi/local/scheduled`), needs no new binding or plan, and the volume is one row per workout.
   Backoff 1 m, 5 m, 30 m, 2 h, 12 h; after 5 attempts → `dead`. One create per session, ever:
   the returned activity id is stored and never re-created (spike: no dedupe, no delete). Sessions
   finished before the connect are not back-filled; edits after a `sent` export are not pushed (v1).
5. **Payload** (`docs/design/integrations.md` §6): `name` = planned session name or "Strength
   training", `sport_type=WeightTraining`, `trainer=1`, `start_date_local` from `startedAt` in the
   profile's `timezone`, `elapsed_time` = `finishedAt − startedAt`, `description` = per-exercise
   lines + totals + "Logged with Tanren", ≤ 1 000 chars. Local dev: `STRAVA_MODE=console` logs the
   would-be activity and returns a fake id, exactly like `EMAIL_MODE=console`.
6. **Strava Data stays out of Claude.** The Worker stores only the athlete id + display name (shown
   to that user in Settings) and the opaque activity id; no MCP tool reads `integration` or
   `activity_export`; nothing else is read back from Strava (API Policy §5.3, §2.5).
7. **Disconnect** = `POST /oauth/revoke` (best effort, logged) then delete the `integration` row and
   the user's `activity_export` rows (spike §4: drop Strava Data on revoke).
8. **Non-goals (v1):** import, two-way sync, webhooks (the later path for the 48-h
   deletion-mirroring rule, spike §6), updating a sent activity, Apple Health (needs the native
   build; the Integrations page lists it as "Needs the Tanren app build"), per-session Strava badge
   in the feed (FEED-0 owns the feed row; deferred until `docs/design/feed.md` has a trailing slot).

## Consequences
- New secrets `STRAVA_CLIENT_SECRET`, `INTEGRATION_TOKEN_KEY`; var `STRAVA_CLIENT_ID`, `STRAVA_MODE`.
  Startup guard: `console` only when `ENVIRONMENT=local`; `provider` needs both Strava values; the
  fake local key is refused outside `local`. Owner steps: Strava subscription, app at
  strava.com/settings/api with callback domain `api.tanren.me`, three `wrangler secret put`.
- The Worker entry exports `{ fetch, scheduled }` instead of the bare `OAuthProvider` instance.
- Two drains can race on one user's token refresh (push + cron); the rotated token invalidates the
  other. Accepted for a single user; the `unauthorized` path re-reads the row once before marking
  the integration `revoked` (design §7).
- D1 statements per push grow by ≤ 2 + accepted complete sessions; a drain costs ≤ 8.

## Alternatives considered
- **Open `/integrations/strava/connect` as a cookie GET** (brief's sketch): no session on native
  (bearer only, ADR-0015) and a Lax cookie rides any cross-site GET; rejected.
- **Cloudflare Queues**: plan availability unverified, a new binding, harder local proof; rejected.
- **Plaintext tokens in D1**: simplest, but a refresh token is a durable third-party credential; rejected.
- **Export from the app**: tokens on device, no offline story, no cron; rejected by the brief.
- **Sync the export status as a synced entity**: the rows are server-owned and small; a plain
  authenticated GET is simpler than a new `SyncTable` member; rejected.

Not decided: Apple Health (ADR-0012 build), webhooks, a Garmin/other provider list (the `Provider`
literal union grows per ADR).

## Implemented as (2026-10-26)
- An inactive Strava app (403, or another 4xx whose body matches `/inactive/i`) is `app_inactive`: the export becomes `blocked`, is retried every 12 h by the cron, never `dead`; `ProviderStatus.blockedExports` counts it and the app offers "Strava app inactive — resubscribe on strava.com" + Retry.
- `claimDue` claims with `UPDATE … WHERE status AND updated_at … RETURNING *` (status alone let two callers reclaim one stale `running` row; `@effect/sql-d1` drops D1 `changes` meta, so RETURNING decides).
- The activity name is always "Strength training" (`PlanRepo` has no planned-session read-by-id); using `PlannedSession.name` is a follow-up. Details: `docs/design/integrations.md` §6.
- Push budget: a push waits at most 2 s to queue completed sessions, then at most 5 s to drain one row, plus the one attempt already in flight (uninterruptible); each Strava call is capped at 10 s, so the worst case is about 2 + 5 + 40 s (the 401 path: refresh, create, refresh, create). The cron drain picks up the rest.
- Residual risk, accepted: the OAuth `state` binds the Tanren user who started the flow, not the browser that finishes it, and has no single-use nonce (a state reused within 10 min can pair with another code). Mitigations: `approval_prompt=force`, Single Player Mode, write-only scope, revocable at strava.com. Remaining token race: drain B can revoke between A's refresh response and A's `setTokens`; follow-up is a `refreshing_until` lease column.
- Console mode is refused outside `ENVIRONMENT=local` at connect (`ConnectRejected{not-configured}`) and at the callback (400), so a production deploy still in console mode writes nothing; flip `STRAVA_MODE` to `provider` after owner steps O1/O2.

## Decision 2026-10-26 23:05 (Lead)
Sessions logged on Today never got `finishedAt` (SV-Q1: only program-player days and MCP-logged
sessions exported). Today sessions are finished by an explicit "Finish workout" action
(`TodayRepo.finishSession`: `finishedAt` = now, `updatedAt` bumped, pushed as an LWW update of the
existing row); the next set opens a new session. The export predicate is unchanged (`finishedAt`
Some on an accepted session change, §4). Auto-finish of stale sessions is a follow-up.
