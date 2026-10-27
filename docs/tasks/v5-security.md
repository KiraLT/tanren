# Security review (owner ask 2026-10-27 14:07: "launch security reviewer to verify if there are any big security gaps")
Status: review B done 14:13 · review A running · fixes queued as SEC-1 (dispatch right after the Garmin team commit, before DEPLOY-10, because items 2–3 change the token-seal format and must land before the first real sealed Garmin token exists in production)

## Review B — REST, repositories, sync, integrations, deletion, mobile (fable reviewer, HEAD 4248fa4, 4 min)
Verdict: **Big gaps: none** — 0 Critical, 0 High, 1 Medium, 5 Low. Clean: IDOR (every query userId-scoped), sync push (foreign ids → forbidden, future `updatedAt` clamped, limits 500/4000), no `sql.unsafe`, mass assignment blocked, Strava state HMAC + returnTo exact-match, email escaping, SecureStore on native / cookie-only on web, errors without detail.
| # | sev | where | finding | decision |
| --- | --- | --- | --- | --- |
| B1 | Medium | `integrations/callbackRoutes.ts:114-147`, `connect.ts:95-110` | forced Strava connect (login-CSRF): the callback trusts the signed `state` alone, so a victim finishing an attacker's authorize URL binds their Strava to the attacker's account | SEC-1: `__Host-` double-submit cookie set at connect, required at callback (web); native keeps the state-only path but the callback page shows the Tanren account email before exchange |
| B2 | Low | `integrations/TokenSeal.ts:50-55` | AES-GCM seal has no AAD; a sealed token moved between rows decrypts for another user/provider | SEC-1: AAD = `${userId}:${provider}:${access|refresh}` on seal + open (format change → before the Garmin deploy) |
| B3 | Low | `connect.ts:43` vs `TokenSeal.ts:39` | one key for AES-GCM and the state HMAC, separated only by a prefix | SEC-1: HKDF sub-keys (info `seal` / `state`) from `INTEGRATION_TOKEN_KEY` |
| B4 | Low | `api/AccountHandlers.ts:45`, `AccountErasure.ts:62` | deletion drops the integration row but never revokes at Strava | SEC-1: best-effort `seal.open → strava.revoke` (and Garmin: nothing to revoke, the key is the owner's) before `deleteUser` |
| B5 | Low | `Handlers.ts:293` | no per-user rate limit on `/sync/push` and REST writes | SEC-1: `makeLimiter` keyed by userId, push 60/min, writes 120/min |
| B6 | Low | `ActivityExport.ts:129-134` | cron `claimDue` is global LIMIT 10; one user's backlog can starve others | deferred (single-owner app); revisit when a second user exists |

## Review A — auth, OAuth, MCP (fable reviewer, running since 14:08)
(appended on report)

## SEC-1 brief (engineer, opus, 20 min) — paste-ready, dispatch after the Garmin team commit
In: `apps/worker/src/integrations/{TokenSeal.ts,TokenSeal.test.ts,connect.ts,connect.test.ts,callbackRoutes.ts,callbackRoutes.test.ts}`, `apps/worker/src/api/{AccountHandlers.ts,AccountHandlers.test.ts,Handlers.ts}` (limiter lines only), the Garmin connect endpoint's seal call sites as landed by GM-4 (AAD args), one `## Amendments` line in ADR-0018.
Items: B1 (double-submit cookie), B2 (AAD), B3 (HKDF sub-keys), B4 (revoke before erase), B5 (per-user limiter). Tests per item incl. "sealed under user A does not open for user B" and "callback without the cookie → 400 page, no upsert". Gate: worker check green; no token bytes in logs/report.

## Log
- 2026-10-27 14:14 · review B done: 0 Critical / 0 High / 1 Medium / 5 Low; SEC-1 queued before DEPLOY-10
