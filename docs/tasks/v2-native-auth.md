# v2 — team native-auth: sign in on the iPhone (Expo Go)
Source: Lead brief 2026-10-21 (NATIVE-1 follow-up, `docs/tasks/step-2.md` Log 23:57/00:00; `apps/mobile/CLAUDE.md` sign-in paragraph) · Status: planning · Updated: 2026-10-21
Design: `docs/design/native-auth.md` (normative: facts §0, flow §1, worker §2, mobile §3, security §4, local dev §5). ADR: proposed ADR-0015 (Lead writes it).

## Team charter: native-auth
Mission: the owner signs in on his iPhone in Expo Go with the magic link, logs a set, and sees it sync. The link verifies in Safari, a worker page hands Expo Go a one-time code bound to a PKCE verifier, the app exchanges it for the Better Auth session token, keeps it in `expo-secure-store`, and sends `Authorization: Bearer` on every API and sync call. Web sign-in is unchanged.
Owned paths (exclusive): `packages/shared/src/nativeAuth.ts` + `nativeAuth.test.ts` + one append-only barrel line in `packages/shared/src/index.ts`; `apps/worker/src/auth/**` (AUTH-1 done; free); `apps/mobile/src/services/{NativeSession,magicLink,CurrentUser,SyncTransport}.ts` + their `*.test.ts`; `apps/mobile/src/hooks/{useSendMagicLink,useSignedIn,useNativeCallback}.ts`; `docs/design/native-auth.md` corrections (one Log line each); `docs/design/local-dev.md` new §6a "Phone sign-in" only; `apps/mobile/CLAUDE.md` the "Sign-in" paragraph only; `.claude/skills/expo-mobile/SKILL.md` one "Native sign-in" paragraph; `.claude/skills/cloudflare-workers/SKILL.md` one "Native auth" paragraph.
Adjacent with owners (read-only; needs are numbered requests via the team-lead to the Lead):
- mcp-oauth: `apps/worker/src/{mcp,oauth}/**`, `src/index.ts`, `wrangler*.jsonc`, `Config*.ts`, `Env.ts`, `apps/worker/package.json` (R3). No edit needed: native routes ride in the `authRoutes` layer (design §2.3).
- design: `apps/mobile/src/ui/**`, `app/**` (R2: new `app/auth/callback.tsx`), `src/components/**`; `app/sign-in.tsx`, `app/(tabs)/today.tsx` need **no edit** (they gate on `SIGN_IN_SUPPORTED`, design §3.2). Phase 2 X4 `Account` sign-out (R4).
- Dependency owner for `apps/mobile/package.json`, `pnpm-workspace.yaml` catalog, `pnpm-lock.yaml` (R1).
- X2 (live): `src/services/HistoryRepo.ts`, `src/services/runtime.ts`. Native-auth needs **no** `runtime.ts` edit (layers self-provide `NativeSession`, design §3.1).
- Root `package.json` scripts: one new `dev:phone` line (R5).
- Unowned, read-only: `apps/worker/src/app.ts`, `src/api/**`, `src/sync/**`, `src/services/{SyncEngine,StoreEvents,LocalStore}.ts`, `src/store/**`.
Requests (Lead routes before dispatch):
- R1 add `expo-secure-store: 58.0.2` to the catalog + `apps/mobile` deps (`pnpm install`); preferred: grant NA-2 these 2 lines, serialized with other dependency edits.
- R2 grant native-auth the NEW file `apps/mobile/app/auth/callback.tsx` (no existing file changes; ~25 lines, spec design §3.2); fallback: team design writes it from the spec.
- R3 add `uqr: 0.1.3` to `apps/worker/package.json` deps for the terminal QR (NA-4); fallback: skip the QR, the Universal Clipboard paste in design §5 is enough.
- R4 team design X4: native sign-out = `/api/auth/sign-out` through `withSession`, then `NativeSession.clear`, then forget owner; show Sign out on native (design §3.2).
- R5 grant NA-4 one root script line `"dev:phone": "sh -c 'pnpm -F @tanren/worker exec wrangler dev --ip 0.0.0.0 --show-interactive-dev-session=false --var BETTER_AUTH_URL:http://$(ipconfig getifaddr en0):8787'"`.
Contracts (frozen when NA-1 step 1 compiles, ≈ 8 min in): design §2.4 shared names exactly; §2.3 routes, status codes and `NativeCodeRejected.reason` literals; §3.1 `NativeSession` shape, keys and `withSession`.
Provides: `POST /api/native/session`, `GET /auth/native/complete`, Bearer auth on every authenticated route (Better Auth `bearer`), `NativeSession` + `withSession` for any mobile caller (X4 sign-out, future API calls).
Assumes (cross-team):
- `SessionsLive` resolves Bearer tokens unchanged because `bearer()`'s hook also matches `auth.api.getSession({ headers })` (design §0 F1, installed `bearer/index.mjs`).
- The OAuth provider forwards `/auth/native/*` and `/api/native/*` to `app.handler` (skill cloudflare-workers "Routing in serveWith": only `/mcp`, `/authorize*`, token/register/well-known are intercepted); VERIFY in NA-1's workerd test.
- `CurrentUser.signedIn` stays `Effect<Option<UserId>>`, so `SyncEngine`/`ownerId` need no edit (`CurrentUser.ts:12`, `ownerId` at the end of the file).
- Expo Go opens `exp://<host>/--/auth/callback?...` into Expo Router's `/auth/callback` (design §0 F5); production Expo Go URL shape over EAS Update is VERIFY (allowlist accepts any `exp(s)://…/--/auth/callback`).
- Uncited, needs the Lead: R1–R5 answered before NA-2/NA-4 dispatch.
Runtime proof (agents, before the team report): NA-3 curl flow on an isolated worker (`wrangler dev --port 8796 --persist-to $SCRATCH/na-d1 --var BETTER_AUTH_URL:http://localhost:8796 --var MCP_RESOURCE_URL:http://localhost:8796/mcp`, after `db:migrate` for that persist dir, VERIFY flags as in MOBILE-2's isolated stack): sign-in POST without `Origin` → link from the log → GET with a cookie jar → complete page HTML contains `exp://127.0.0.1:8081/--/auth/callback?code=` → exchange with the verifier → 200 → `GET /api/auth/get-session` with Bearer → user → `POST /sync/pull` with Bearer → 200 → replay the code → 400 `invalid` → wrong verifier → 400 `mismatch` → `POST /api/auth/one-time-token/verify` → 404. Plus `pnpm -F @tanren/mobile exec expo export --platform ios --output-dir $SCRATCH/na-ios` bundles (secure-store resolves). Owner proof on the phone (morning) = design §5 steps 1–3; the team report quotes them.
Docs: NA-4 (local-dev §6a, mobile CLAUDE.md sign-in paragraph, two skill paragraphs).
Budget: ≤ 2 engineers in parallel · 1 reviewer · ≤ 2 review rounds · models: opus for NA-1 (foundation, security) and NA-REV; sonnet for NA-2, NA-3, NA-4 · Time box = chain-sum + 15 = (NA-1 25 + NA-3 8 + NA-4 10 + NA-REV 12) + 15 = **70 min** (NA-2 25 runs beside NA-1 from minute 8).
Forbidden: never run a command under permissions.ask: `git push|reset|checkout`, `rm -r*`, `wrangler deploy|login|secret|d1 execute`, `eas *`, Cloudflare MCP `execute`; `pnpm db:reset` is fine. Also: no edits to adjacent paths (requests only), no `trustedOrigins` change, no `index.ts`/`app.ts`/`runtime.ts` edit, never use the shared :8787/:8790/local D1 (owner may be running `pnpm dev`), no commits.
Report: team report format from `.claude/agents/team-lead.md`.

## Decisions (all accepted (Lead delegation), 2026-10-21)
- N1 Deep link + one-time code exchange (design §1). Rejected: `openAuthSessionAsync` (the emailed link opens from Mail in Safari, never inside the auth session, so the session never sees the redirect; it would need polling); WebView (same: the link does not open in it, and its cookie jar is separate).
- N2 One-time code = Better Auth `oneTimeToken` plugin (single use, 5 min, hashed, in the D1 `verification` table) instead of a custom D1/KV table; KV is eventually consistent and cannot consume atomically.
- N3 Binding = PKCE-style: challenge in the callbackURL, HMAC of (OTT, challenge) in the code, verifier at exchange. No server state beyond the OTT.
- N4 Token = raw Better Auth `session.token`, sent as `Authorization: Bearer` (`bearer()` signs it, F1); stored in `expo-secure-store`; web keeps cookies.
- N5 Routes in `auth/nativeAuthRoutes.ts`, merged into `authRoutes` (no `index.ts`/`app.ts` edit); raw `HttpRouter` routes like `/api/auth/*` (they need `BetterAuth`, which HttpApi handlers do not get).
- N6 Complete page = 200 HTML with an "Open Tanren" button + meta refresh (a tap is the reliable way into a custom scheme, F5), not a 302.
- N7 Local phone sign-in = `pnpm dev:phone` (LAN `BETTER_AUTH_URL`) + terminal QR of the link; web sign-in uses `pnpm dev`.
- N8 `CurrentUser` becomes refreshable (`SubscriptionRef` + `refresh` + `changes`) instead of reloading the JS bundle.

## Tasks
| id | title | role / model | depends on | files | spec | status |
| --- | --- | --- | --- | --- | --- | --- |
| NA-1 | Shared schemas; Better Auth `bearer` + `oneTimeToken` + `disabledPaths`; `nativeCode.ts`; `nativeAuthRoutes.ts` in `authRoutes`; Node + workerd tests | engineer / opus | — | `packages/shared/src/nativeAuth{,.test}.ts`, `index.ts` (1 line); `apps/worker/src/auth/{BetterAuth,authRoutes,nativeCode,nativeAuthRoutes}.ts` + tests, `auth/nativeAuth.workerd.test.ts` | §0, §2 | todo |
| NA-2 | Mobile: `NativeSession` + `withSession`; `magicLink`, `CurrentUser`, `SyncTransport`; hooks `useSendMagicLink`, `useSignedIn`, `useNativeCallback`; `app/auth/callback.tsx` if R2 granted | engineer / sonnet | NA-1 step 1 (shared names), R1, R2 | `apps/mobile/src/services/{NativeSession,magicLink,CurrentUser,SyncTransport}{,.test}.ts`, `src/hooks/{useSendMagicLink,useSignedIn,useNativeCallback}.ts`, `app/auth/callback.tsx` | §3 | todo |
| NA-3 | Runtime proof: curl flow on an isolated worker + iOS export bundle | engineer / sonnet | NA-1, NA-2 | none (scratch only); findings in the Log | charter "Runtime proof" | todo |
| NA-4 | `dev:phone` script (R5), terminal QR in `EmailSender.layerConsole` (R3), docs | engineer / sonnet | NA-1 | `apps/worker/src/auth/EmailSender{,.test}.ts`, root `package.json` (1 line), `docs/design/local-dev.md` §6a, `apps/mobile/CLAUDE.md` (sign-in paragraph), two skill paragraphs | §5 | todo |
| NA-REV | Review `git diff <baseline> -- <owned paths>` against design §2–§4; `pnpm check` | reviewer / opus | NA-2, NA-3, NA-4 | owned paths | §4 security first | todo |

Parallel groups (≤ 2 engineers): A = {NA-1, NA-2 from NA-1 step 1} · B = {NA-3, NA-4} · C = {NA-REV, fixes}.

## Done-criteria
### NA-1 (time box 25 min)
- [ ] Step 1 (≤ 8 min, then report "shared frozen" to the team-lead): `nativeAuth.ts` exactly as design §2.4; tests: patterns accept/reject (42/44-char verifier, code without `.`), `NativeCodeRejected` round-trips; barrel line.
- [ ] `BetterAuth.ts` per §2.1; `nativeCode.ts` per §2.2 incl. the RFC 7636 vector, mac mismatch, `RETURN_TO` accepts `exp://192.168.1.5:8081/--/auth/callback`, `exps://u.expo.dev/x/--/auth/callback`, `tanren://auth/callback`, rejects `https://evil.example/--/auth/callback`, `exp://h/--/auth/callback/x`, `javascript:`.
- [ ] Node tests on a real memory Better Auth instance (style of `auth.test.ts`): full flow sign-in (no `Origin`) → verify link → complete HTML → exchange → `Sessions.current` with only `Authorization: Bearer` → `Some(userId)`; replay → 400 `invalid`; wrong verifier → 400 `mismatch` and the right verifier still works after; malformed body → 400 `malformed`; bad `returnTo` → 400 HTML, no `Location`; `?error=` → button to `returnTo?error=link_invalid`; `/api/auth/one-time-token/{generate,verify}` → 404; each §0 VERIFY row answered in a test or a Log line.
- [ ] `auth/nativeAuth.workerd.test.ts` boots the real default export (`src/index.ts`) and gets 400 `NativeCodeRejected{malformed}` JSON from `POST /api/native/session` `{}` and 400 HTML from `GET /auth/native/complete` without params (proves the provider forwards both paths and the bundle loads the plugins).
- [ ] `pnpm -F @tanren/shared check` and `pnpm -F @tanren/worker check` green, output pasted. Never run a command under permissions.ask: `git push|reset|checkout`, `rm -r*`, `wrangler deploy|login|secret|d1 execute`, `eas *`, Cloudflare MCP `execute`; `pnpm db:reset` is fine.
### NA-2 (time box 25 min)
- [ ] `NativeSession` per §3.1 with `layer` (lazy `import("expo-secure-store")`, native only), `layerNone`, `layerMemory`; PKCE via `expo-crypto` (F7) with b64url conversion; test: `begin` stores pending and returns `/auth/native/complete?challenge=…&returnTo=…` (decoded params), `challenge` equals the worker's `challengeOf` vector; `complete` without pending → `no-pending`; 400 → `rejected`; network → `unreachable`; success stores the response and deletes pending; expired `expiresAt` → `token` None; `clear` deletes both keys.
- [ ] `withSession` adds the header only when a token exists; `SyncTransport` and `CurrentUser` tests assert `authorization: Bearer <t>` on the wire with `layerMemory` (existing cookie tests stay green).
- [ ] `CurrentUser.refresh` + `changes` per §3.2; `useSignedIn` follows `changes`; `useNativeCallback` maps `error=` to `link-invalid` copy; `signInSupported("ios") === true`.
- [ ] `pnpm -F @tanren/mobile check` green, output pasted; `app/auth/callback.tsx` written only if R2 granted (else Log "R2 pending"). Never run a command under permissions.ask: `git push|reset|checkout`, `rm -r*`, `wrangler deploy|login|secret|d1 execute`, `eas *`, Cloudflare MCP `execute`; `pnpm db:reset` is fine.
### NA-3 (time box 8 min)
- [ ] Every step of the charter "Runtime proof" run on port 8796 with its own persist dir; each response status pasted (tokens and codes redacted to 6 chars); iOS export exits 0; kill only PIDs you started. Never run a command under permissions.ask: `git push|reset|checkout`, `rm -r*`, `wrangler deploy|login|secret|d1 execute`, `eas *`, Cloudflare MCP `execute`; `pnpm db:reset` is fine.
### NA-4 (time box 10 min)
- [ ] `dev:phone` (R5) prints the LAN URL in the link; `layerConsole` also logs a compact QR of the URL when R3 is granted (test: the log contains the URL; QR rendering is not asserted beyond non-empty); local-dev §6a = design §5 recipe; mobile CLAUDE.md sign-in paragraph no longer says web-only; skill paragraphs ≤ 6 lines each.
- [ ] `pnpm check` green, output pasted. Never run a command under permissions.ask: `git push|reset|checkout`, `rm -r*`, `wrangler deploy|login|secret|d1 execute`, `eas *`, Cloudflare MCP `execute`; `pnpm db:reset` is fine.
### NA-REV (time box 12 min)
- [ ] Security checklist design §4 line by line (OTT not redeemable over HTTP, binding checked before consume, no code/token in logs, `returnTo` allowlist, HTML escaping, `no-store`); hard rules (no `throw`/`any`/`as`/`let`); verdict with blocking findings routed. Never run a command under permissions.ask: `git push|reset|checkout`, `rm -r*`, `wrangler deploy|login|secret|d1 execute`, `eas *`, Cloudflare MCP `execute`; `pnpm db:reset` is fine.

## Frozen contracts
- (filled by the team-lead at freeze time)

## Log
- 2026-10-21 · architect · sheet + design written; R1–R5 open for the Lead
