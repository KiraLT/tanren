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

## Review A — auth, OAuth, MCP (fable reviewer, HEAD + working tree, 9 min)
Verdict: **Big gaps: none** — 0 Critical, 0 High, 3 Medium (hardening), 6 Low. Clean: HS256 pinned + typ/kid/aud/iss/exp, HKDF info separation, cross-type token use pinned by tests, generation checks on refresh + every write, native return-to regex + prefix list, PKCE S256 only, code burned atomically, CIMD caps + host pinning, consent CSP + X-Frame-Options + __Host- cookie, MCP aud + per-scope tools, no secrets in logs, `global_fetch_strictly_public`.
| # | sev | where | finding | decision |
| --- | --- | --- | --- | --- |
| A1 | Medium | `Config.ts:38` | `BETTER_AUTH_SECRET` has no min-length guard and the local literal is not refused outside `local` (the secret roots every HKDF sub-key, the native-code HMAC and the cookie cache) | SEC-1 (Config.ts is the Garmin team's until their commit): `isMinLength(32)` outside `local` + refuse the local literal, like `FAKE_INTEGRATION_TOKEN_KEY`. Production secret was generated with `openssl rand -base64 32` (deploy runbook) — hardening, not an open hole |
| A2 | Medium | `auth/BetterAuth.ts:82` | magic-link tokens stored in cleartext in D1 `verification` (plugin default `storeToken: "plain"`) | **SEC-A2 now**: `storeToken: "hashed"` + workerd test (stored value ≠ mailed token; sign-in still works) |
| A3 | Medium | `auth/tokenRoutes.ts:80-85`, `oauth/token.ts:126-153` | no refresh rotation / reuse detection: a stolen refresh JWT works 30 d until a generation bump | STLS-F5 follow-up (opus, 20 min, after the Garmin commit): rotate on refresh, burn the old `jti` in a ledger table, bump the user's gen on reuse of a burned jti; ADR-0022 amendment |
| A4 | Low | `oauth/clients.ts:213`, `provider.ts:163-190` | `/authorize`, `/oauth/token`, `/oauth/register` unlimited; CIMD fetch is an amplifier (5 KiB / 5 s, public hosts only) | SEC-A2 now: `makeLimiter` keyed by `cf-connecting-ip` on the three paths |
| A5 | Low | `auth/BetterAuth.ts:90` | `bearer()` without `requireSignature: true` accepts a raw `session.token` | SEC-A2 now: `requireSignature: true` (native is JWT-first; check nativeAuth tests) |
| A6 | Low | `BetterAuth.ts:56` | cookie-cache `session_data` replays ≤ 900 s after sign-out (not bound to `sid`) | accepted by design (auth-v2 §4, ADR-0022); SEC-1 adds the sentence to the ADR |
| A7 | Low | `app.ts:115` | `HttpRouter.cors` with empty `allowedOrigins` would emit `*` + credentials; production sets one origin | SEC-1: Config guard `ALLOWED_ORIGINS` non-empty |
| A8 | Low | `oauth/OAuthApi.ts:193-201` | consent handle reusable 10 min with the same `__Host-` nonce (cleared on approve/deny) | accepted; STLS-F2 if wanted |
| A9 | Low | `BetterAuth.ts:82` | `disableSignUp` unset: any email can create an account | product decision → owner asked (default: open, IP limiter stays) |


## SEC-1 brief (engineer, opus, 20 min) — paste-ready, dispatch after the Garmin team commit
In: `apps/worker/src/integrations/{TokenSeal.ts,TokenSeal.test.ts,connect.ts,connect.test.ts,callbackRoutes.ts,callbackRoutes.test.ts}`, `apps/worker/src/api/{AccountHandlers.ts,AccountHandlers.test.ts,Handlers.ts}` (limiter lines only), the Garmin connect endpoint's seal call sites as landed by GM-4 (AAD args), one `## Amendments` line in ADR-0018.
Items: B1 (double-submit cookie), B2 (AAD), B3 (HKDF sub-keys), B4 (revoke before erase), B5 (per-user limiter). Tests per item incl. "sealed under user A does not open for user B" and "callback without the cookie → 400 page, no upsert". Gate: worker check green; no token bytes in logs/report.

## Log
- 2026-10-27 14:14 · review B done: 0 Critical / 0 High / 1 Medium / 5 Low; SEC-1 queued before DEPLOY-10
- 2026-10-27 14:17 · review A done: 0 Critical / 0 High / 3 Medium / 6 Low; SEC-A2 dispatched now (A2, A4, A5); A1/A6/A7 → SEC-1; A3 → STLS-F5; A9 → owner
