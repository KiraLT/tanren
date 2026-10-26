# v4 — Strava export + Integrations page
Source: plan Amendment 9 (owner, 2026-10-26) · Status: planned · Updated: 2026-10-26 21:30 · Baseline commit: 5b2bbb2
Design: `docs/design/integrations.md` (normative; §1–§2 frozen on dispatch) · ADR-0018 (accepted, Lead delegation) · Spike: `docs/research/2026-10-26-strava-api.md`

## Decisions
- ADR-0018 Worker-owned tokens sealed in D1, outbox table + cron (no Queues), POST-then-browser connect with signed state — accepted (Lead delegation)
- D1 Apple Health is an app-side static row, not a `Provider` literal — accepted (Lead delegation)
- D2 Sessions finished before the connect are not back-filled; sent activities are never updated — accepted (Lead delegation)

## Owner-gated (not agent work; listed so nothing waits silently)
- O1 Strava subscription (API Policy 3.3) and an API app at strava.com/settings/api, callback domain `api.tanren.me`, Single Player Mode.
- O2 `wrangler secret put STRAVA_CLIENT_SECRET --env production`, `… INTEGRATION_TOKEN_KEY …` (`openssl rand -base64 32`); `STRAVA_CLIENT_ID` + `STRAVA_MODE=provider` as production vars (SV-3 writes the placeholders into `wrangler.jsonc`).
- O3 First real export on tanren.me (SV-Q2 measures it; needs O1+O2 and a deploy).

## Tasks
| id | title | role / model | depends on | files (exclusive) | time box | status |
| --- | --- | --- | --- | --- | --- | --- |
| SV-1 | Shared schemas + ids + `EntityName` literal | engineer / sonnet | — | `packages/shared/src/integrations.ts` (+test), `ids.ts` (`ActivityExportId`), `common.ts` (`EntityName` + `"activityExport"`), `index.ts` | 15 min | todo |
| SV-2 | DB: schema, migration 0004, repos | engineer / sonnet | SV-1 | `packages/db/src/schema/integration.ts`, `schema/index.ts` (or wherever tables are collected — read `packages/db/src/schema/*.ts` imports), `packages/db/migrations/0004_integrations.sql` + `meta/`, `packages/db/src/repositories/Integration.ts` (+test), `ActivityExport.ts` (+test), `repositories/index.ts`, `apps/worker/src/testing/workerdSetup.ts` (0004 in the list) | 20 min | todo |
| SV-3 | Worker config + TokenSeal + StravaApi (http + console) | engineer / sonnet | SV-1 | `apps/worker/src/{Config.ts,Config.test.ts,Env.ts,cloudflareEnv.d.ts}`, `apps/worker/src/integrations/{TokenSeal.ts,TokenSeal.test.ts,StravaApi.ts,StravaApi.test.ts}`, `apps/worker/wrangler.jsonc` (vars, triggers, production placeholders), `wrangler.test.jsonc` (vars), `apps/worker/src/testing/fixtures.ts` | 20 min | todo |
| SV-4 | Worker connect + callback + status/disconnect/exports/retry endpoints | engineer / opus | SV-2, SV-3 | `apps/worker/src/api/{IntegrationsApi.ts,IntegrationsHandlers.ts,Api.ts}` (Api.ts: add the group only), `apps/worker/src/integrations/{connect.ts,connect.test.ts,callbackRoutes.ts,callbackRoutes.test.ts,returnTo.ts,returnTo.test.ts}`, `apps/worker/src/auth/nativeCode.ts` (export `mac`/`macMatches` only), `apps/worker/src/auth/nativeAuthRoutes.ts` (export `makeLimiter` only), `apps/worker/src/app.ts` (mount the callback route + layers), `apps/worker/src/api/Routes.edge.test.ts` | 20 min | todo |
| SV-5 | Export pipeline: ExportQueue, activityText, Sync.push hook, scheduled handler | engineer / opus | SV-2, SV-3 | `apps/worker/src/integrations/{ExportQueue.ts,ExportQueue.test.ts,ExportQueue.workerd.test.ts,activityText.ts,activityText.test.ts,scheduled.ts}`, `apps/worker/src/sync/Sync.ts` (+test), `apps/worker/src/index.ts`, `apps/worker/src/index.workerd.test.ts` | 20 min | todo |
| SV-6 | App: Integrations service + hook + two routes + Settings row | engineer / opus | SV-1 (names); runs against SV-4 when it lands | `apps/mobile/src/services/{Integrations.ts,Integrations.test.ts}`, `apps/mobile/src/hooks/useIntegrations.ts`, `apps/mobile/src/components/settings/{IntegrationsSection.tsx,integrationsCopy.ts,integrationsCopy.test.ts}`, `apps/mobile/src/components/integrations/**` (new dir), `apps/mobile/app/settings/integrations/{index.tsx,[provider].tsx}`, `apps/mobile/app/settings.tsx` (one section line), `apps/mobile/src/ui/iconPaths.ts` (+ `link`, `heart` glyphs only, if chosen), `apps/mobile/CLAUDE.md` §settings line | 20 min | todo |
| SV-7 | Local-dev + deploy docs: `local-dev.md` §STRAVA_MODE, `deploy.md` §secrets O2, worker `CLAUDE.md` layout lines | engineer / sonnet | SV-3, SV-5 | `docs/design/local-dev.md`, `docs/design/deploy.md`, `apps/worker/CLAUDE.md` | 10 min | todo |
| SV-R | Cross-package review: §4 security checklist line by line, sealed tokens never logged, no MCP read of the new tables (`grep -rn "integration\|activity_export" apps/worker/src/mcp` = 0), Effect rules, workerd coverage | reviewer / opus | SV-4, SV-5, SV-6 | read-only | 25 min | todo |
| SV-Q1 | Local e2e per design §9 with the console provider (`ui-check` on web :8790 + curl of the scheduled route); screenshots 390 + 1280 of `settings/integrations` and `settings/integrations/strava` (states: disconnected, connected, Sent/Pending/Failed rows) to the review gallery | qa / sonnet | SV-R clean | `docs/tasks/v4-strava.md` Log only | 20 min | todo |
| SV-Q2 | Measured: first real export (owner-visible VERIFY items). Data state: production D1, owner signed in on tanren.me, one finished session. Scheme: `https`. Measures: `start_date_local` shown on strava.com equals the session's local start (±1 min); the activity is `Weight Training`, description ≤ 1 000 chars, "View on Strava" opens it; the connect control is ≥ 48 px and reads "Connect with Strava" (brand check against developers.strava.com/guidelines, recorded) | qa / sonnet | O1, O2, deploy | `docs/tasks/v4-strava.md` Log only | 15 min | todo |

Parallel groups: {SV-1} → {SV-2, SV-3, SV-6 (names only)} → {SV-4, SV-5} → {SV-7} → SV-R → SV-Q1 → (owner) SV-Q2.
Case-collision check run 2026-10-26 21:27 for every directory above with `integrations.ts`/`Integrations.ts` added: no duplicates. SV-6 must not create `apps/mobile/src/integrations/` (would shadow nothing today, but keep the service in `services/`).

## Frozen contracts
- §1 shared schemas: `Provider`, `ActivityExportId`, `IntegrationState`, `ExportStatus`, `ExportFailureReason`, `ProviderStatus`, `IntegrationsStatus`, `ActivityExport`, `ConnectRequest`/`ConnectResponse`, `RetryExportRequest`, `IntegrationNotConnected` (409), `ConnectRejected` (400).
- §2 SQL byte-for-byte except drizzle-kit whitespace; repo port names `IntegrationRepo`, `ActivityExportRepo` with the methods listed.
- §3 env names `STRAVA_MODE`, `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `INTEGRATION_TOKEN_KEY`; config fields `stravaMode`, `stravaClientId`, `stravaClientSecret`, `integrationTokenKey`; `TokenSeal.seal/open`; `StravaApi.{exchangeCode,refresh,createActivity,revoke}`, `layerHttp`/`layerConsole`.
- §5 endpoint table; §4 `returnTo` rule; §6 `ExportQueue.{enqueueCompleted,drain}`; `scheduled` export shape.

## Assumes (cited)
- `Authentication` accepts the bearer token on native as well as the cookie: `apps/worker/src/auth/SessionsLive.ts:7` ("the session cookie (or bearer) in `headers`") and `Account.ts:40` ("cookie on web, Bearer on native").
- A session is complete iff `finishedAt` is `Some` and `deletedAt` is `None`: `packages/shared/src/session.ts:33–41` (`finishedAt: OptionFromNullOr(Timestamp)`), Today's open-session query `TodayRepo.ts:192` (`"finishedAt" IS NULL` = in progress).
- `Sync.push` is a passthrough to `SyncStore.apply` and the handler owns no `ExecutionContext`: `apps/worker/src/sync/Sync.ts:31`, `app.ts:108` (`HttpRouter.toWebHandler`), so the drain runs inline with a timeout (ADR-0018 §4).
- Cron Triggers: 5 per account on Workers Free; `wrangler dev --test-scheduled` exposes `/cdn-cgi/local/scheduled?cron=…` (Cloudflare docs, read 2026-10-26 via the docs MCP).
- Strava facts (endpoints, scopes, rotation, no delete, limits, policy): spike §1–4.
- Existing HMAC helpers `mac`/`macMatches` are module-private in `apps/worker/src/auth/nativeCode.ts:72,82`; `makeLimiter` in `nativeAuthRoutes.ts` is module-private (export only, no behaviour change).
- Routes under `apps/mobile/app/settings/**` auto-register in the root Stack (`settings/location/[id].tsx` exists with no `_layout.tsx` entry: `grep -n settings apps/mobile/app/_layout.tsx` = none).

## Done-criteria
### SV-1
- [ ] Every §1 name exported from `@tanren/shared`; `EntityName` has `"activityExport"`; round-trip tests for `ProviderStatus` and `ActivityExport` with the two §1 wire examples; `pnpm check` green.
### SV-2
- [ ] `0004_integrations.sql` matches §2; `pnpm db:reset` applies it; repo tests (db workerd project) cover `enqueue` idempotency (same key twice → one row), `claimDue` claims a `pending` row once under two concurrent calls, stale `running` reclaimed after 10 min (TestClock or fixed timestamps), `remove` deletes the user's exports in the same batch, `counts` = 1 statement (countingD1).
### SV-3
- [ ] Config guard tests: console outside local refused; provider without secret refused; fake key outside local refused; key not 32 bytes refused. `TokenSeal` round trip / tamper / wrong key. `StravaApi.layerHttp` tests with a stubbed `HttpClient`: 401→`unauthorized`, 429→`rate_limited`, 422→`rejected`, 503→`provider_error`, network→`transport`; `layerConsole` logs and returns `console-<8>`; no token appears in any log line (test asserts).
### SV-4
- [ ] `connect` returns a URL whose `state` verifies and expires at +10 min; `returnTo` bypass list §4 all 400; callback: bad state 400 HTML with `Cache-Control: no-store`, `access_denied` → `?error=denied`, missing `activity:write` → `?error=scope`, happy path upserts and answers 303 for `https://localhost:8790/settings/integrations` and HTML with an escaped link for `exp://localhost:8081/--/settings/integrations`; `DELETE` revokes best effort and removes rows; `retry` on a `sent` row → 404 `NotFound{entity:"activityExport"}`; `Routes.edge.test.ts` 401 lines added; workerd test boots the route through `index.ts`.
### SV-5
- [ ] `Sync.push` with an accepted complete session and an active integration → one `activity_export` row; without an integration → 0 extra statements (countingD1); console drain marks `sent` within the push; a `transport` failure → `pending` with `next_attempt_at = +1 m`, 5th → `dead`; `session_missing` → `dead`; `describeSession` tests (uniform/non-uniform reps, bodyweight, truncation at 1 000, totals); `scheduled` drains across two users; `index.workerd.test.ts` still green with the new default export.
### SV-6
- [ ] Both routes render at 390 and 1280 per §8; states (loading, error, offline) stay single-column on `settings/integrations` and `settings/integrations/strava`; `?connected=strava` / `?error=*` banners; Retry calls the endpoint and refreshes; "View on Strava" opens `https://www.strava.com/activities/<id>`; Apple Health row disabled with "Needs app build"; Settings row subtitle reflects state; `Integrations.test.ts` covers offline vs server vs not-connected mapping; accessibility labels per §8.
### SV-7
- [ ] `local-dev.md` documents `STRAVA_MODE=console` and the scheduled curl; `deploy.md` lists O1–O2 verbatim; worker `CLAUDE.md` layout gains `integrations/` and the `{ fetch, scheduled }` entry line.
### SV-R / SV-Q1 / SV-Q2
- [ ] Review report answers each §4 checklist bullet with file:line; QA pastes the §9 steps with observed worker log lines and gallery URLs; SV-Q2 records the four measures.

## Briefs (ready to paste; every brief starts with: "Read `.claude/agents/engineer.md`, `docs/design/integrations.md`, ADR-0018. Write only in your file set. `pnpm check` green before reporting; paste its tail. Never run commands under permissions.ask; never read `.env*`/`.dev.vars*`.")

### SV-1 — shared schemas (sonnet, 15 min)
Files: table row SV-1. Implement §1 exactly (names, literals, error statuses); `ActivityExportId` in `ids.ts`; `"activityExport"` appended to `EntityName` (check `NotFound` tests that enumerate it). Tests: decode/encode the two wire examples in §1. Report: exported names, `pnpm check` tail. Time box 15 min.

### SV-2 — db schema, migration, repos (sonnet, 20 min)
Files: table row SV-2. Define both tables in `schema/integration.ts` per §2 (plain columns, no `rowColumns`), register them where the other tables are collected, run `pnpm -F @tanren/db generate` → `0004_integrations.sql` (diff against §2; fix drizzle naming until identical), implement `IntegrationRepo` and `ActivityExportRepo` per §2 with `effect/sql` like `repositories/Session.ts`; `claimDue` uses UPDATE-with-status-guard and keeps rows with `changes === 1` (VERIFY the D1 result field in `@effect/sql-d1` types). Add 0004 to `workerdSetup.ts`'s list. Tests per done-criteria. Time box 20 min.

### SV-3 — config, TokenSeal, StravaApi (sonnet, 20 min)
Files: table row SV-3. Extend `RawEnv`/`WorkerConfigShape`/`Env`/`cloudflareEnv.d.ts` per §3 with the guard rules; `TokenSeal` (AES-256-GCM, `v1.<iv>.<ct>` b64url); `StravaApi` port + `layerHttp` (effect/http `HttpClient`, form bodies, map statuses → `ExportFailureReason`) + `layerConsole`; `wrangler.jsonc`: local vars (`STRAVA_MODE: console`, `STRAVA_CLIENT_ID: local-strava-client`, fake `INTEGRATION_TOKEN_KEY`), `triggers.crons ["*/5 * * * *"]` top level and in `env.production`, production vars `STRAVA_MODE: provider`, `STRAVA_CLIENT_ID: "<owner: strava client id>"` with a comment naming O2; `wrangler.test.jsonc` + `fixtures.ts` get the local values. Never log a token: tests assert. Time box 20 min.

### SV-4 — connect, callback, endpoints (opus, 20 min)
Files: table row SV-4. Export `mac`/`macMatches` (nativeCode.ts) and `makeLimiter` (nativeAuthRoutes.ts) without other changes. `returnTo.ts`: the §4 rule + bypass tests. `connect.ts`: state sign/verify (10 min), authorize URL; in `console` mode the URL is `${betterAuthUrl}/integrations/strava/callback?state=…&code=console&scope=read,activity:write`. `callbackRoutes.ts`: plain `HttpRouter` route (HTML + 303, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `escapeHtml`), mounted in `app.ts` next to `auth.routes`. `IntegrationsApi.ts` + handlers per §5 (status aggregates via `counts`; `DELETE` revoke best effort; `retry` → `resetToPending` then `ExportQueue.drain` — import the port from SV-5's `ExportQueue.ts`; until it lands, type against §6 and list the red). `Routes.edge.test.ts`: 401 lines. Workerd test through `index.ts`. Time box 20 min.

### SV-5 — export pipeline (opus, 20 min)
Files: table row SV-5. `ExportQueue` (§6: `enqueueCompleted`, `drain`, `nextAttempt`, token freshness §7), `activityText.describeSession` (pure, §6 format), `scheduled.ts` (`runScheduled(env)` on a `ManagedRuntime` over `d1Persistence(env.DB)` + `StravaApi` layer chosen by `stravaMode`), `index.ts` default export `{ fetch, scheduled }` (VERIFY `provider.fetch` as a method; keep `index.workerd.test.ts` green and add a scheduled call), `Sync.push` hook with `Effect.timeout("5 seconds")` and a logged `Effect.catch`. Statement budget ≤ 8 per drained row (countingD1 assert). Time box 20 min.

### SV-6 — app Integrations page (opus, 20 min)
Files: table row SV-6. Build §8 exactly: service (pattern `Account.ts`), hook (refetch on focus), `IntegrationsSection` in `settings.tsx` main column under Account, list route, detail route, banners from `?connected`/`?error`, Retry, "View on Strava", Apple Health static row (disabled, "Needs app build"), desktop `Columns 5/7`; `returnTo` and opening per §8 (web `window.location`, native `expo-linking`). If you add `link`/`heart` glyphs, keep them 24-px paths in `iconPaths.ts` with its test. Until SV-4 lands, develop against `MockSyncServer`-style stubs in `Integrations.test.ts`. Report the width arithmetic you shipped and the Strava brand-guideline check (button label/height). Time box 20 min.

### SV-7 — docs (sonnet, 10 min) · SV-R (reviewer/opus, 25 min) · SV-Q1 (qa/sonnet, 20 min) · SV-Q2 (qa/sonnet, 15 min, owner-gated)
Per the table rows and done-criteria; SV-Q1 publishes screenshots to the review gallery (memory `tanren-review-gallery`), SV-Q2 carries `Data state:` and `Scheme:` as in the table.

## Log
- 2026-10-26 21:30 architect (STRAVA-0): ADR-0018, `docs/design/integrations.md`, this sheet. VERIFY items are in the design (§3 triggers inheritance, §4 state length and helper signatures, §6 `provider.fetch`, `start_date_local` format, PlannedSession lookup, §8 `router.setParams`, `Linking.createURL` file, Strava button asset rule).
- 21:50 · Ownership ruling (Lead): apps/worker/scripts/deployPreflight.checks.ts (+ test) is the strava team's (SV-7/SV-8: STRAVA_MODE, client id placeholder, secrets not in vars, cron in env.production).
