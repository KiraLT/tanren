# @tanren/worker

The Cloudflare Worker: REST API (`@effect/platform` HttpApi), Better Auth
(magic link), the batched sync endpoint, static web hosting, and the MCP
server (stateless `createMcpHandler` from the Cloudflare Agents SDK, ADR-0010, not `McpAgent`). The
Worker's default export is `{ fetch, scheduled }`: `fetch` is the router in `oauth/provider.ts` over a stateless OAuth
authorization server written in Effect (ADR-0022: Tanren JWTs, no KV, no library) that guards `/mcp` and serves the OAuth
endpoints and authorize pages; `scheduled` is the cron (Strava export drain, then Garmin pull).

Domains: `api.tanren.me` (REST), `mcp.tanren.me` (MCP), `tanren.me` (web).

## Boundaries

- Depends on `@tanren/shared`, `@tanren/db`. Never imports from `apps/mobile`.
- Effect everywhere except two thin adapters that run an Effect program: the MCP adapter
  (`mcp/server.ts`: the `McpServer` instance + `createMcpHandler` call) and the Worker entry
  (`index.ts`, which calls the `oauth/provider.ts` router). Biome's `noClass` override excludes only
  `src/mcp/**` and `src/index.ts`, so `src/oauth/**` declares no class. `@cloudflare/workers-oauth-provider`
  and `OAUTH_KV` were removed by ADR-0022 (history: `docs/design/oauth.md`, superseded banner).
- `jose` (HS256 JWTs) is value-imported only by `auth/Tokens.ts`; everything else goes through the `Tokens` service.
- Bindings and secrets come from `wrangler` config / `.dev.vars`; agents do
  not read `.dev.vars`.

## Layout

```
src/
  index.ts            Worker entry: default export = `{ fetch, scheduled }`: `fetch` calls `makeRouter(env, config, { app, mcp, authorize }, persistence)`
                      (`oauth/provider.ts`: CORS preflight, discovery, `/oauth/{register,token}`, `/authorize*`, `/mcp`, then `app`); `scheduled` = `ctx.waitUntil(runScheduled(env))` (cron: Strava export drain, then Garmin pull);
                      `app` = makeApp(env, { BetterAuth.layer(env.DB), d1Persistence(env.DB) }), `mcp` = makeMcp(…, McpAuth.layerLive)
  app.ts              makeApp: HttpApi layer + auth mode + persistence → { handler }; memoryPersistence / d1Persistence
  Env.ts, Config.ts   `Env` interface + config/guard (incl. `STRAVA_MODE`, `STRAVA_CLIENT_ID`, `STRAVA_CONSOLE_FAIL` vars and the
                      `STRAVA_CLIENT_SECRET` / `INTEGRATION_TOKEN_KEY` secrets: `console` is allowed in every environment (it only logs;
                      production runs it until the owner has a Strava app, O2), `provider` needs the secret, the fake local key is
                      refused outside local)
  integrations/       Strava export (ADR-0018, docs/design/integrations.md): TokenSeal.ts (AES-256-GCM seal/open of provider tokens, wire
                      `v1.<iv>.<ct>`) · StravaApi.ts (port: exchangeCode/refresh/createActivity/revoke; `layerHttp`/`layerLive` real,
                      `layerConsole` logs `[strava:console] …`, `STRAVA_CONSOLE_FAIL=inactive` simulates a lapsed app; 403 or an
                      inactive-looking 4xx → `app_inactive`) · ExportQueue.ts (enqueueCompleted + drain: claim → token refresh → send →
                      settle; backoff +1 m/+5 m/+30 m/+2 h, 5th failure `dead`, `blocked` retried every 12 h) · activityText.ts (pure: session →
                      Strava activity name/start/elapsed/description) · scheduled.ts (`runScheduled`: export drain, 10 rows per run, then `GarminPull.drain`, 1 user per run; each drain has its own `catchCause`, so one failing never blocks the other) ·
                      Garmin import (ADR-0023, docs/design/garmin.md; `GARMIN_MODE` `console` default | `provider`, `GARMIN_BASE_URL`, `GARMIN_CONSOLE_FAIL=rejected` console only; no server-side Garmin secret, the user's key is sealed with `INTEGRATION_TOKEN_KEY`): GarminApi.ts (port: `exchange` key → 24 h JWT, profile, activities list, daily summary; `layerHttp`/`layerLive` real, `layerConsole` = 2 activities + 7 days, `layer` picks by `GARMIN_MODE`; `GarminApiError`) ·
                      GarminPull.ts (`GarminPull.drain({ max })`: per user ≤ 10 Garmin calls and ≤ 2 activity pages of 50, 7-day dailies, 30-day back-fill walked in 10-day windows (GM-F1: Workers Free 10 ms CPU per cron run), cursor in the integration row, daily 404 → no row; writes through `GarminImportRepo`; `layerDisabled`) ·
                      connect.ts (`startConnect`: allow-list `returnTo` ≤ 300 chars, signed 10-min `state`, authorize URL with
                      `approval_prompt=force`; console mode → our own callback with `code=console`; refused outside local) ·
                      callbackRoutes.ts (plain `HttpRouter` `GET /integrations/strava/callback`: verify state, exchange code, upsert, 303 or
                      HTML; limiter keyed by `cf-connecting-ip`; 400 "Strava is not connected yet" for console outside local) ·
                      returnTo.ts (`isAllowedIntegrationReturnTo`, `MAX_RETURN_TO`)
  cloudflareEnv.d.ts  the `Cloudflare.Env` declare-merge (typed `cloudflare:workers` env). Never name a .d.ts after a
                      sibling .ts basename: on case-insensitive macOS `env.d.ts` next to `Env.ts` is silently dropped by tsc
  api/                HttpApi from `effect/http-api` (NOT @effect/platform): Api, Authentication, Handlers · IntegrationsApi.ts (group:
                      `GET /integrations`, `POST /integrations/strava/connect`, `DELETE /integrations/strava`, exports list + retry) ·
                      IntegrationsHandlers.ts (connect limiter keyed `strava-connect:<userId>`)
  repos/              re-exports the @tanren/db ports + D1Layer + PersistenceError; MemoryStore + Repositories.layerMemory (Node tests) ·
                      MemoryIntegrations.ts (in-memory `IntegrationRepo`/`ActivityExportRepo` for Node tests) ·
                      MemoryGarminImport.ts (in-memory `GarminImportRepo` for Node tests; the D1 `GarminImportRepo` lives in `packages/db/src/repositories/GarminImport.ts`: upsert imported activities / daily health through `SyncStore`, skip unchanged live rows) ·
                      MemoryTokens.ts (in-memory `UserTokens` + `OAuthCodeUseRepo` for Node tests: every user exists at generation 0)
  auth/               Tokens.ts (ONE service for all 7 token kinds: app access/refresh, MCP access/refresh, auth code, consent handle,
                      DCR client id; HS256 JWTs via `jose`, keys = WebCrypto HKDF sub-keys of `BETTER_AUTH_SECRET` (no new secret), `kid`,
                      exact `aud`/`iss`, 60 s skew, clock = Effect `DateTime.now`) · tokenRoutes.ts (`POST /api/token/{refresh,revoke,
                      revoke-mcp}`: refresh body `RefreshRequest`, no cookie read; revokes bump `appTokenGen` / `mcpTokenGen`, answer 204;
                      every response `no-store`, every rejection 401 `TokenRejected`) ·
                      Sessions port, SessionsLive (JWT-first: a Bearer app JWT → `Tokens.verifyApp`, 0 D1 reads; else Better Auth
                      `getSession`, whose `cookieCache` is `jwt`, `maxAge` 900 s), BetterAuth (lazy `Effect.cached` instance),
                      Email (MagicLinkEmail, EmailSendFailed, EmailSenderShape), EmailSender (console locally,
                      Resend via `makeResendSender`), magicLinkEmail (pure `{ subject, text, html }`: table layout, inline
                      styles, escaped url, fixed light colours; `resendBody` calls it), authRoutes (store/build/request failure → 503
                      `SessionStoreUnavailable`, `EmailSendFailed` → 502 `EmailDeliveryFailed`, defect → 500 `InternalError`)
  sync/               Sync (push = db SyncStore.apply, then for a completed session `ExportQueue.enqueueCompleted` + `drain(1)` within 5 s,
                      never failing the push; pull + serverTime); SyncStoreMemory (Node fake, no LWW). Imports (`importedActivity`, `dailyHealth`)
                      are pull-only synced tables: `Sync.push` rejects them `forbidden` (`PULL_ONLY`, before `SyncStore.apply`), only the Worker's
                      own `GarminImportRepo` writes them, and MCP never reads them
  mcp/                tools.ts (6 read tools incl. `search_exercises` (`availableAt`: 1 D1 statement) and `get_profile`; with the 3 write tools 9 total; a read-only grant lists 6; pure Effect over the repo ports; `Tool`/`AnyTool`/`eraseTool`, each with a `kind`) ·
                      writeTools.ts (`write_plan_week`, `log_session`, `update_profile`) · McpAuth.ts (identity port → `McpPrincipal`) ·
                      server.ts (the only `McpServer`, one per request) · McpRoute.ts (`makeMcp`, lazy ManagedRuntime) · McpLanding.ts (GET/HEAD `/` on the MCP host: static help page naming the connector URL)
  oauth/              the stateless authorization server (ADR-0022, docs/design/auth-v2.md §5; no KV, no DO, no library).
                      provider.ts (`makeRouter`: the Worker's fetch router, CORS, `statelessOAuth` hook) · authorize.ts (`/authorize` pages:
                      Better Auth magic-link login → consent) · OAuthApi.ts (the six-method port; `layerStateless` over
                      `Tokens` + `ClientResolver`, `layerFake` for Node tests) · pages.ts (HTML pages in the Forge frame: `shell`
                      = wordmark + column + legal footer, `PAGE_CSP` sent by every `/authorize*` page; assets.ts holds the W1
                      wordmark as a 5 KB alpha-mask `data:` PNG, OAUTH-UI; fontRoute.ts serves `GET /oauth/assets/barlow-condensed-800.woff2`
                      (Latin-subset Barlow Condensed 800, OFL, a wrangler `rules` Data module typed by `fonts/fontModules.d.ts`; called
                      from `index.ts` before the router; the h1 face, `font-src 'self'`, OAUTH-FONT) · knownClients.ts (IDENT-1 trust:
                      host equality against `TRUSTED_CLIENT_HOSTS`) · clients.ts (`ClientResolver`: CIMD fetch for an https `client_id`
                      with a path — 5 s timeout, 5 KiB cap, no redirects, JSON, cached in a named Cache API cache ≤ 1 h; else a DCR client-id
                      JWT; canonical-URL checks; stateless `POST /oauth/register`) · consent.ts (consent handle JWT with a nonce, the
                      `__Host-tanren-consent` binding cookie, `parseAuthorization`, `ConsentDescription`) · token.ts
                      (`POST /oauth/token`: code exchange checks signature → client/redirect → PKCE S256 → generation, burns in
                      `oauth_code_use` LAST; `refresh_token` grant checks `mcpTokenGen`) · metadata.ts (RFC 8414 AS metadata + RFC 9728
                      protected-resource metadata)
  testing/            workerdSetup.ts (applies every migration in `packages/db/migrations`, read as a whole directory by `vitest.workerd.config.ts`, before each workerd test file), env.d.ts (TEST_MIGRATIONS,
                      test project only), fixtures.ts (shared `envVars` for Node + workerd tests), countingD1.ts (counts D1
                      executions, for statement-budget assertions)
  *.workerd.test.ts   tests that run inside workerd on a migrated D1 (project @tanren/worker-workerd); `index.workerd.test.ts`
                      boots the real default export of `src/index.ts`; `oauth/oauth.workerd.test.ts` is the OAuth flow test
scripts/seed.ts       local seed runner (tsx; typed by tsconfig.scripts.json with @types/node)
scripts/smoke.ts      `pnpm smoke:worker --port <n> --log <wrangler output file>` against a running dev server
vitest.config.ts      Node project `@tanren/worker` (excludes *.workerd.test.ts)
vitest.workerd.config.ts  workerd project `@tanren/worker-workerd` (@cloudflare/vitest-plugin, wrangler.test.jsonc)
wrangler.jsonc        top level = local: D1 `DB` (db `tanren`), migrations_dir ../../packages/db/migrations (no KV: removed by ADR-0022), fake
                      local vars incl. `MCP_RESOURCE_URL`; `env.production` = routes api./mcp.tanren.me + own vars/ids (docs/design/deploy.md §2)
wrangler.test.jsonc   test-only D1 binding, local vars (so a workerd test can boot src/index.ts) + TEST_MIGRATIONS
wrangler.web.jsonc    static-assets Worker `tanren-web` (`env.production` route tanren.me)
tsconfig.json         production + Node tests (workers-types only; excludes src/testing, *.workerd.test.ts)
tsconfig.test.json    workerd tests, src/testing, vitest configs (+ @cloudflare/vitest-plugin/types)
tsconfig.scripts.json scripts/ (@types/node); `typecheck` runs all three
```

- `makeApp` → `HttpRouter.toWebHandler` builds every layer eagerly, and `src/index.ts` calls it at module
  scope, where workerd forbids I/O (and the clock reads 1970). A layer must never start I/O while it is
  built: create clients lazily inside the request (hardening H3: `betterAuth()` starts a schema check on
  construction, which logged `[Better Auth] Could not validate the database schema` at every startup).

- Persistence and auth both run on `env.DB` (auth tables = migration 0001). `layerMemory` variants are for Node tests only.
- Sync rules (LWW, clamp, per-change rejection) belong to `@tanren/db`'s `SyncStore`; never re-implement them here.
- Two Vitest projects. Node (`makeApp(env, …).handler(new Request(…))`) proves logic fast; workerd
  (`*.workerd.test.ts`, real D1 via `d1Persistence(env.DB)`) proves the bundle runs: wrangler's esbuild
  and workerd resolve imports differently (step 3: `better-auth/adapters/memory` re-export was `undefined`
  under workerd while 45 Node tests passed). Put anything that touches bindings, imports from a new
  package, or `src/index.ts` / `src/app.ts` / `src/auth/**` behind a workerd test. Until the workerd
  project covers auth routes, those tasks also end with the smoke and paste it:
  `pnpm -F @tanren/worker exec wrangler dev --port <spare> &` → `curl -i localhost:<spare>/health`
  (expect 200) → one route behind `Authentication` (expect 401, never 500) → kill only that PID.
- Native sign-in (`auth/nativeAuthRoutes.ts`, docs/design/native-auth.md §2.3): `/api/native/begin`,
  `/auth/native/complete`, `/api/native/session` are rate-limited in isolate memory (10/min/route/IP,
  429 `NativeRateLimited`). That is weak (one counter per isolate); the production upgrade is the Workers
  rate-limiting binding (`ratelimits` in `wrangler.jsonc`, `env.<BINDING>.limit({ key })`) or a Cloudflare
  WAF rate-limiting rule (owner). `NATIVE_RETURN_PREFIXES` pins the URL prefixes (`exps://u.expo.dev/<projectId>/`, not a host:
  all EAS projects share `u.expo.dev`) a code may be sent to.
- Dev server: use a spare port when 8787 is busy (`wrangler dev --port`). Never kill processes you did not start.

## MCP (`/mcp`; contracts `docs/design/mcp.md`, `docs/design/oauth.md`)

- The MCP host serves the connector at `/mcp` only (`MCP_RESOURCE_URL`, the RFC 8707 resource); `/` is a
  static help page; `metadata.ts` serves the protected-resource document on the MCP host at both the `/mcp`
  path form and the root form `/.well-known/oauth-protected-resource` (MCP-ROOT, 2026-10-27). `makeRouter`
  (`oauth/provider.ts`) returns `{ fetch, dispose }`; the connector URL for the Claude app is `https://mcp.tanren.me/mcp`.
- Stateless `createMcpHandler` (`agents/mcp/server`) + `McpServer` (`@modelcontextprotocol/server` v2); not
  `McpAgent`, no Durable Object, no session state (ADR-0010). `McpAuth` validates the bearer (no library);
  `makeRouter` sends the exact path `/mcp` to `mcp.handle(request, env, ctx)` before `app.handler`; `/authorize`
  and below go to `authorize.handle`.
- Identity: `McpAuth.resolve(request, ctx) → Option<McpPrincipal>` (`{ userId, scopes }`). `layerJwt`
  verifies an MCP access JWT with `Tokens.verifyMcp` (signature, `aud` = `MCP_RESOURCE_URL`, `exp`; 0 D1 reads, so a
  revoked grant's access token lives out its 15 minutes); `layerDevToken` = `Authorization: Bearer <DEV_MCP_TOKEN>`
  (constant-time compare) with `ENVIRONMENT=local` → `DEV_PRINCIPAL` (seed user, all scopes); `layerLive`
  (the Worker) tries the JWT, then the dev token; `layerFixed` for tests. `None` → 401 with the
  `WWW-Authenticate: Bearer realm="OAuth", resource_metadata=…` challenge, empty body, before the SDK runs.
  Never cookies, never `Sessions`. `McpRoute.ts` sets `allowedHostnames` to the hostname of
  `MCP_RESOURCE_URL` (`mcp.tanren.me` in production; the SDK default allowlist is localhost/workers.dev only).
- Scopes: `createServer({ principal, run })` → `toolsFor(principal)` registers the read tools only with
  `tanren:read` and the write tools (`writeTools.ts`) only with `tanren:write`; otherwise they are an unknown
  tool. The 401 challenge and the metadata advertise both scopes (so clients ask for both via the 401 `scope`
  and `scopes_supported`) but do not enforce them; `toolsFor` is the enforcement. An empty requested
  scope is treated as both scopes on the consent page; the grant is ticked ∩ requested ∩ `MCP_SCOPES`.
- Tools: `Tool` (`kind: "read" | …`) erased with `eraseTool` to `AnyTool`; `call(userId, rawArgs)` decodes once (→ `ValidationError`), runs, encodes to JSON.
  `inputSchema = toStandardJSONSchemaV1(toStandardSchemaV1(toEncoded(input)))` so the SDK validates and
  advertises the wire shape and never hands decoded values to `call`. A non-object result (`get_current_plan`
  → null) goes out as text only, no `structuredContent`. Typed errors → `isError` text; `PersistenceError` and
  defects are logged and shown as `storage unavailable` / `internal error`.
- D1 budget (Free: 50 statements per invocation): `get_overview` ≤ 5, via `SessionRepo.listSetsInRange`;
  `testing/countingD1.ts` counts executions incl. batch members in workerd (`get_overview` = 5;
  `write_plan_week` 4 sessions × 6 sets: new week 37, replace 37 (planned-set ids stable by `order`);
  6×8: 63 / 63; `log_session` 20 sets: create 25, replace 46 — `mcp/writeTools.workerd.test.ts`). Workers
  Free allows 50 external subrequests but 1000 to Cloudflare services (D1) per invocation (Cloudflare
  changelog 2026-02-11); whether one `batch()` is one subrequest is not documented — keep tools well under 50.
- Clients send `accept: application/json, text/event-stream` (else -32000) and, in workerd tests, a `host`
  header; 2025-era protocol replies are SSE `data:` lines.
- Local attach without touching user config: `claude -p "…" --mcp-config <file> --strict-mcp-config
  --allowedTools mcp__tanren-local__get_overview` with `{"mcpServers":{"tanren-local":{"type":"http","url":
  "http://localhost:<port>/mcp","headers":{"Authorization":"Bearer local-dev-only-mcp-token"}}}}`.
  `claude` may not be on PATH in agent shells (VS Code ships a binary under the extension's
  `resources/native-binary/`).

## Commands

`pnpm -F @tanren/worker check` (package gate: biome → typecheck incl. scripts → both test projects) ·
`dev` · `test` · `typecheck` · `pnpm deploy:preflight [--skip-gate]` (root; owner-run read-only pre-deploy checklist, `scripts/deployPreflight*.ts`) · `pnpm db:migrate` · `pnpm db:seed` · `pnpm db:reset` (root; local D1 only)

## Status

Step 3 (2026-10-20): integrated with @tanren/db on local D1 (INT-1): REST, Better Auth magic link and sync push/pull pass `pnpm smoke:worker` after `pnpm db:reset`. Workerd project exists (TOOL-1: `/health` on migrated D1). Hardening-1 (2026-10-20): test types split out of prod (`tsconfig.test.json`), `Cloudflare.Env` merge in `cloudflareEnv.d.ts` (no `biome-ignore` left), silent `wrangler dev` startup (lazy Better Auth), 503 `SessionStoreUnavailable` when the session store fails, HTTP tests for nested set routes. HI-1 (2026-10-20): `SessionStoreUnavailable` lives in `@tanren/shared`; every `/api/auth/*` failure answers 503. QA edge tests (`src/api/Routes.edge.test.ts`): 21 routes 401 signed out, cursor/limit validation 400, nested set routes 404 for foreign ids. Known gap: `SyncStoreMemory` (Node fake) has no LWW, no parent checks and never reports conflicts, so push rules are proven only in the db workerd project. INT-B done in step 5 (`index.workerd.test.ts`).
Step 4 (2026-10-20, team mcp): `/mcp` serves `get_overview`, `get_exercise_history`, `list_sessions`, `get_current_plan` to the dev-token user; workerd test `mcp/McpRoute.workerd.test.ts` (initialize, tools/list, calls, 401); Claude Code headless called `get_overview` against `wrangler dev` on the seed (5 sessions / 65 sets in 7d). Next: step 5 write tools + OAuth.
Step 5 (2026-10-21, team mcp-oauth): the Worker's default export is one `OAuthProvider` (combined mode, KV `OAUTH_KV`, no DO; `oauth/provider.ts`), authorization server on the `BETTER_AUTH_URL` host, resource `MCP_RESOURCE_URL`; `/authorize` login (Better Auth magic link) + consent (provider v1 helpers); grants carry `OAuthProps { userId, scopes }`; write tools (`write_plan_week`, `log_session`, `update_profile`) only with `tanren:write`; the local dev token passes the provider via `resolveExternalToken` (local only). Proven: `oauth/oauth.workerd.test.ts` (register → authorize → token S256 → 7 tools; read-only grant → 4), `index.workerd.test.ts` boots the real default export (health, get-session, `/mcp` 401 challenge, exercises round trip, sync push → pull with LWW tie), and a curl run of the full flow on `wrangler dev` (local-dev.md §5). Not proven by an agent: Claude Code / Claude app browser login (owner, deploy.md §5). D1 budget closed: Workers Free allows 1000 subrequests to Cloudflare services; planned-set ids stay stable by `order`, so a replace costs ≈ a new write. Better Auth rate limiter keys on `cf-connecting-ip` (`advanced.ipAddress`); storage stays memory (per isolate) for v1 — `rateLimit.storage: "database"` is the production hardening option. Open: the limiter is enabled only when `NODE_ENV === "production"`, which the deployed Worker does not set (`auth/rateLimit.workerd.test.ts` stubs it) → needs `rateLimit: { enabled: true }` or a `NODE_ENV` var (escalated). Security tests of `/api/auth/*` belong in `*.workerd.test.ts`: Better Auth skips its origin check under `NODE_ENV=test` (Node vitest).
Stateless auth (2026-10-27, ADR-0022, plan Amendment 17; supersedes the Step 5 line's `OAuthProvider` / `OAUTH_KV` / `resolveExternalToken`): web login = Better Auth `cookieCache` jwt (900 s); native login and MCP = Tanren JWTs from `auth/Tokens.ts` (HKDF sub-keys of `BETTER_AUTH_SECRET`), revoked through `user.appTokenGen` / `mcpTokenGen` (migration 0006) checked at refresh; the OAuth server is `oauth/{clients,consent,token,metadata}.ts` with `oauth_code_use` as the only anti-replay table; `@cloudflare/workers-oauth-provider` and KV are gone (owner steps O1 reconnect clients, O2 delete the KV namespace: `docs/design/deploy.md` §3a). Walkthrough: `docs/design/local-dev.md` §5 (curl run by STLS-Q, not yet).
INT-A (2026-10-20): root `pnpm dev` runs this Worker on :8787 next to the web export on :8790; the owner recipe (`docs/design/local-dev.md` §Owner recipe) was proven end to end: web magic link → set logged → `/sync/pull` and MCP `list_sessions` (Claude Code headless) return it.
