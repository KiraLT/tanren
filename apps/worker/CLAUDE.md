# @tanren/worker

The Cloudflare Worker: REST API (HttpApi), Better Auth (magic link), batched sync, static web hosting, the
stateless MCP server (`createMcpHandler`, ADR-0010, not `McpAgent`) and a stateless OAuth authorization server
in Effect (ADR-0022: Tanren JWTs, no KV, no library). Default export = `{ fetch, scheduled }`: `fetch` is
`makeRouter` (`oauth/provider.ts`: CORS, discovery, `/oauth/*`, `/authorize*`, `/mcp`, then the app); `scheduled`
is the cron (Strava export drain, then Garmin pull). Domains: `api.tanren.me`, `mcp.tanren.me`, `tanren.me` (web).

Contracts live in `docs/design/`, not here: `mcp.md`, `oauth.md` (superseded), `auth-v2.md` (ADR-0022),
`integrations.md` (ADR-0018), `garmin.md` (ADR-0023), `native-auth.md`, `legal.md` (ADR-0024), `nutrition.md`
(ADR-0025), `programs-mcp.md` (ADR-0026), `deploy.md`.

## Boundaries

- Depends on `@tanren/shared`, `@tanren/db`. Never imports from `apps/mobile`.
- Effect everywhere except two thin adapters that run an Effect program: `mcp/server.ts` (`McpServer` +
  `createMcpHandler`) and `index.ts`. Biome's `noClass` override excludes only `src/mcp/**` and `src/index.ts`,
  so `src/oauth/**` declares no class. `@cloudflare/workers-oauth-provider` and `OAUTH_KV` are gone (ADR-0022).
- `jose` is value-imported only by `auth/Tokens.ts`; everyone else uses the `Tokens` service.
- Bindings and secrets come from `wrangler` config / `.dev.vars`, which agents never read.

## Layout

`ls src/*` and module headers give the exports; this is the map plus the gotcha per directory.

```
Env.ts, Config.ts     `Env` + decoded config / startup guard. `STRAVA_MODE` / `GARMIN_MODE`: `console` (default; only logs / fakes 2 activities
                      + 7 days; allowed everywhere incl. production) | `provider` (Strava needs `STRAVA_CLIENT_SECRET`; Garmin has no server
                      secret, the user's key is sealed with `INTEGRATION_TOKEN_KEY`, whose fake local value is refused outside local).
                      `STRAVA_CONSOLE_FAIL=inactive` / `GARMIN_CONSOLE_FAIL=rejected` work in console mode only. `NATIVE_RETURN_PREFIXES`
                      pins URL *prefixes* (`exp://`, `exps://u.expo.dev/<projectId>/`, not a host: all EAS projects share `u.expo.dev`)
                      a native code may be sent to; unset = local simulator only.
cloudflareEnv.d.ts    the `Cloudflare.Env` declare-merge. Never name a .d.ts after a sibling .ts basename: on case-insensitive macOS
                      `env.d.ts` next to `Env.ts` is silently dropped by tsc.
api/                  HttpApi from `effect/http-api` (NOT `@effect/platform`); `AccountApi` = `POST /api/account/delete` (legal.md §1.7).
auth/                 `Tokens.ts` is the ONE service for all 7 token kinds (app, MCP, auth code, consent, DCR client id): HS256 JWTs signed
                      with WebCrypto HKDF sub-keys of `BETTER_AUTH_SECRET` (no new secret; changing an HKDF `info` invalidates every token
                      it signs). `Sessions` is JWT-first (Bearer app JWT → 0 D1 reads). Revokes bump
                      `appTokenGen` / `mcpTokenGen`; a burned refresh token re-sent within 30 s still gets a fresh pair. `BetterAuth` is a
                      lazy `Effect.cached` instance on the built-in memory adapter: never import `better-auth/adapters/memory`, its
                      `export *` is `undefined` under wrangler's bundle. Native sign-in: `nativeAuthRoutes.ts` (native-auth.md).
oauth/                the stateless AS (auth-v2.md §5). Trust = host equality against `TRUSTED_CLIENT_HOSTS`; an https `client_id` with a
                      path is resolved by CIMD fetch (5 s, 5 KiB, no redirects, Cache API ≤ 1 h), else it is a DCR client-id JWT. `token.ts`
                      checks signature → client/redirect → PKCE S256 → generation and burns the code in `oauth_code_use` LAST. Every
                      `/authorize*` page sends `PAGE_CSP`; `fontRoute.ts` serves the woff2 as a wrangler `rules` Data module (typed by
                      `fonts/fontModules.d.ts`), called from `index.ts` before the router.
mcp/                  `server.ts` = the only `McpServer`, one per request; `McpRoute.ts` (lazy ManagedRuntime). Tools in `tools.ts`,
                      `writeTools.ts`, `nutritionTools.ts`, `programTools.ts` — 23 in all, a read-only grant lists 12; each tool file has a
                      `*.workerd.test.ts` proving it through `/mcp`. Built-in programs `core-30` / `lean-build-12` are read-only →
                      `Forbidden`; `write_program` / `update_program` retry once on a `conflict <id>` `PersistenceError`; `NotFound.id` is
                      a plain string for slugs.
integrations/         Strava: 403 or an inactive-looking 4xx → `app_inactive`; `blocked` rows retry every 12 h, never `dead`; console mode
                      answers its own callback with `code=console`, refused outside local. Garmin (`GarminPull.ts`): per user ≤ 10 calls,
                      ≤ 2 activity pages of 50, 7-day dailies, 30-day back-fill in 10-day windows (Workers Free 10 ms CPU per cron run);
                      daily 404 → no row; writes only through `GarminImportRepo`. `scheduled.ts`: export
                      drain 10 rows, then Garmin 1 user, each under its own `catchCause`; `scheduledLayer` holds only the drains' ports in
                      a `ManagedRuntime` built once per isolate — never build the cron's layers per invocation (GM-F2).
sync/                 push = `SyncStore.apply`, then for a completed session `ExportQueue.enqueueCompleted` + `drain(1)` within 5 s, never
                      failing the push. `importedActivity` and `dailyHealth` are pull-only: `Sync.push` rejects them `forbidden` (`PULL_ONLY`,
                      before `apply`); only `GarminImportRepo` writes them. `SyncStoreMemory` (Node fake) has no LWW, no parent checks,
                      never reports conflicts — push rules are proven only in the db workerd project.
time/localDate.ts     the ONE local-day module (`zoneOf` invalid/absent → UTC, `dayRange` half-open UTC + DST-correct, `weekOf` Mon–Sun).
                      Never add a second one.
repos/                re-exports the `@tanren/db` ports; `Memory*.ts` fakes behind `Repositories.layerMemory` (Node tests only). `MemoryFoodEntry`
                      checks ownership and totals itself because `MemoryStore.put` does neither; `GarminImportRepo` is NOT in `layerMemory`
                      (tool tests add `MemoryGarminImport.layer`); `MemoryTokens`: every user exists at generation 0.
testing/              `workerdSetup.ts` applies every `packages/db/migrations` file before each workerd test file; `countingD1.ts` counts
                      D1 executions incl. batch members.
scripts/              `seed.ts`, `smoke.ts` (`pnpm smoke:worker --port <n> --log <wrangler output>`), `deployPreflight*.ts`.
vitest / wrangler /   Node project `@tanren/worker` (excludes `*.workerd.test.ts`) + workerd project `@tanren/worker-workerd` on
tsconfig variants     `wrangler.test.jsonc`; `wrangler.jsonc` top level = local, `env.production` = deploy.md §2; `wrangler.web.jsonc` =
                      static-assets Worker `tanren-web`; `typecheck` runs all 3 tsconfigs.
```

- `makeApp` builds every layer eagerly and `src/index.ts` calls it at module scope, where workerd forbids I/O
  (and the clock reads 1970). A layer must never start I/O while it is built: create clients lazily inside the
  request (H3: `betterAuth()` runs a schema check on construction → `Could not validate the database schema` at every startup).
- Persistence and auth both run on `env.DB`. Sync rules (LWW, clamp, per-change
  rejection) belong to `@tanren/db`'s `SyncStore`; never re-implement them here.
- Two Vitest projects. Node (`makeApp(env, …).handler(new Request(…))`) proves logic fast; workerd
  (`*.workerd.test.ts`, real D1) proves the bundle runs: wrangler's esbuild and workerd resolve imports
  differently (a re-export was `undefined` only under workerd). Anything that touches
  bindings, imports from a new package, or `src/index.ts` / `src/app.ts` / `src/auth/**` goes behind a
  workerd test, and the task ends with the smoke, pasted: `pnpm -F @tanren/worker exec wrangler dev --port
  <spare> &` → `curl -i localhost:<spare>/health` (200) → one route behind `Authentication` (401, never 500)
  → kill only that PID.
- Security tests of `/api/auth/*` belong in `*.workerd.test.ts`: Better Auth skips its origin check under
  `NODE_ENV=test` (Node vitest). Its limiter is forced on in production from our `ENVIRONMENT` (`rateLimitFor`);
  its own switch is `NODE_ENV === "production"`, which the Worker never sets.
- Native sign-in routes (`/api/native/*`, `/auth/native/complete`) are rate-limited in isolate memory (10/min/route/IP,
  429 `NativeRateLimited`): weak, one counter per isolate; upgrade = Workers `ratelimits` binding or a WAF rule (owner).
- Dev server: use a spare port when 8787 is busy (`wrangler dev --port`). Never kill processes you did not start.

## MCP (`/mcp`; contract `docs/design/mcp.md`)

- The MCP host serves the connector at `/mcp` only (`MCP_RESOURCE_URL`, the RFC 8707 resource; Claude app URL
  `https://mcp.tanren.me/mcp`); `/` is a help page; the protected-resource document is served at both
  `/.well-known/oauth-protected-resource/mcp` and the root form. `makeRouter` sends the exact path `/mcp` to
  `mcp.handle` before `app.handler`.
- Identity: `McpAuth.resolve → Option<McpPrincipal>`; `layerJwt` verifies the MCP access JWT with 0 D1 reads (a
  revoked grant's token lives out its 15 min); `layerDevToken` = `Bearer <DEV_MCP_TOKEN>` (constant-time compare)
  only with `ENVIRONMENT=local` → seed user, all scopes. `None` → 401 + `WWW-Authenticate: Bearer realm="OAuth",
  resource_metadata=…`, empty body, before the SDK runs. Never cookies, never `Sessions`. `McpRoute.ts` sets
  `allowedHostnames` to the `MCP_RESOURCE_URL` hostname (SDK default: localhost/workers.dev only).
- Scopes: `toolsFor(principal)` registers read tools only with `tanren:read`, write tools only with `tanren:write`
  (otherwise: unknown tool); it is the only enforcement — challenge and metadata merely advertise both. Empty
  requested scope = both on the consent page; the grant is ticked ∩ requested ∩ `MCP_SCOPES`.
- Tools: `call(userId, rawArgs)` decodes once (→ `ValidationError`), runs, encodes to JSON; `inputSchema =
  toStandardJSONSchemaV1(toStandardSchemaV1(toEncoded(input)))`, so the SDK validates the wire shape and `call` never
  sees decoded values. A non-object result (`get_current_plan` → null) is text only, no `structuredContent`. Typed
  errors → `isError` text; `PersistenceError` and defects → `storage unavailable` / `internal error`.
- D1 budget (Free: 50 statements per invocation): `get_overview` ≤ 6 is asserted in `index.workerd.test.ts`; the
  write tools' replace-path counts are printed (not budgeted) by `mcp/writeTools.workerd.test.ts` via `countingD1`.
  Whether one `batch()` counts as one subrequest is not documented — keep tools well under 50.
- Clients send `accept: application/json, text/event-stream` (else -32000) and, in workerd tests, a `host` header;
  replies are SSE `data:` lines.
- Local attach (no user config): `claude -p "…" --mcp-config <file> --strict-mcp-config
  --allowedTools mcp__tanren-local__get_overview` with `{"mcpServers":{"tanren-local":{"type":"http","url":
  "http://localhost:<port>/mcp","headers":{"Authorization":"Bearer local-dev-only-mcp-token"}}}}`. `claude` may not
  be on PATH in agent shells (VS Code ships one under the extension's `resources/native-binary/`).

## Commands

`pnpm -F @tanren/worker check` (package gate: biome → typecheck incl. scripts → both test projects) · `dev` ·
`test` · `typecheck` · root: `pnpm deploy:preflight [--skip-gate]` (read-only), `pnpm db:migrate` ·
`db:seed` · `db:reset` (local D1 only)
