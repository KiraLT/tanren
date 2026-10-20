# @tanren/worker

The Cloudflare Worker: REST API (`@effect/platform` HttpApi), Better Auth
(magic link), the batched sync endpoint, static web hosting, and the MCP
server (stateless `createMcpHandler` from the Cloudflare Agents SDK, ADR-0010; OAuth via
`workers-oauth-provider` arrives in step 5).

Domains: `api.tanren.me` (REST), `mcp.tanren.me` (MCP), `tanren.me` (web).

## Boundaries

- Depends on `@tanren/shared`, `@tanren/db`. Never imports from `apps/mobile`.
- Effect everywhere except the MCP adapter (`mcp/server.ts`: the `McpServer` instance +
  `createMcpHandler` call) and the Worker `fetch` entry, which are thin adapters that run an Effect program.
- Bindings and secrets come from `wrangler` config / `.dev.vars`; agents do
  not read `.dev.vars`.

## Layout

```
src/
  index.ts            Worker entry (fetch) → makeApp(env, { BetterAuth.layer(env.DB), d1Persistence(env.DB) })
  app.ts              makeApp: HttpApi layer + auth mode + persistence → { handler }; memoryPersistence / d1Persistence
  Env.ts, Config.ts   `Env` interface + config/guard
  cloudflareEnv.d.ts  the `Cloudflare.Env` declare-merge (typed `cloudflare:workers` env). Never name a .d.ts after a
                      sibling .ts basename: on case-insensitive macOS `env.d.ts` next to `Env.ts` is silently dropped by tsc
  api/                HttpApi from `effect/http-api` (NOT @effect/platform): Api, Authentication, Handlers
  repos/              re-exports the @tanren/db ports + D1Layer + PersistenceError; MemoryStore + Repositories.layerMemory (Node tests)
  auth/               Sessions port, SessionsLive (Better Auth), BetterAuth (lazy `Effect.cached` instance),
                      Email (MagicLinkEmail, EmailSendFailed, EmailSenderShape), EmailSender (console locally,
                      Resend via `makeResendSender`), authRoutes (store/build/request failure → 503
                      `SessionStoreUnavailable`, `EmailSendFailed` → 502 `EmailDeliveryFailed`, defect → 500 `InternalError`)
  sync/               Sync (push = db SyncStore.apply passthrough, pull + serverTime); SyncStoreMemory (Node fake, no LWW)
  mcp/                tools.ts (four read tools, pure Effect over the repo ports) · McpAuth.ts (identity port) ·
                      server.ts (the only `McpServer`, one per request) · McpRoute.ts (`makeMcp`, lazy ManagedRuntime)
  testing/            workerdSetup.ts (applies migrations 0000+0001 before each workerd test file), env.d.ts (TEST_MIGRATIONS,
                      test project only), fixtures.ts (shared `envVars` for Node + workerd tests)
  *.workerd.test.ts   tests that run inside workerd on a migrated D1 (project @tanren/worker-workerd)
scripts/seed.ts       local seed runner (tsx; typed by tsconfig.scripts.json with @types/node)
scripts/smoke.ts      `pnpm smoke:worker --port <n> --log <wrangler output file>` against a running dev server
vitest.config.ts      Node project `@tanren/worker` (excludes *.workerd.test.ts)
vitest.workerd.config.ts  workerd project `@tanren/worker-workerd` (@cloudflare/vitest-plugin, wrangler.test.jsonc)
wrangler.jsonc        D1 binding `DB` (db `tanren`), migrations_dir ../../packages/db/migrations, fake local vars
wrangler.test.jsonc   test-only D1 binding + TEST_MIGRATIONS for the workerd project
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
- Dev server: use a spare port when 8787 is busy (`wrangler dev --port`). Never kill processes you did not start.

## MCP (`/mcp`, step 4; contract `docs/design/mcp.md`)

- Stateless `createMcpHandler` (`agents/mcp/server`) + `McpServer` (`@modelcontextprotocol/server` v2); no
  `McpAgent`, no Durable Object, no session state (ADR-0010). `index.ts` routes the exact path `/mcp` to
  `mcp.handle(request, env, ctx)` before `app.handler`; `/mcp/`, `/mcpx` go to the REST app.
- Identity: `McpAuth.resolve(request) → Option<UserId>`. Step 4 = `layerDevToken`: `Authorization: Bearer
  <DEV_MCP_TOKEN>` (constant-time compare) and `ENVIRONMENT=local` → `DEV_USER_ID` (`auth/devUser.ts`).
  `None` → 401 `WWW-Authenticate: Bearer`, empty body, before the SDK runs. Never cookies, never `Sessions`.
  Step 5 adds `layerOAuth` (`ctx.props`) and `allowedHostnames: ["mcp.tanren.me"]` (default allowlist is
  localhost/workers.dev only).
- Tools: `AnyReadTool.call(userId, rawArgs)` decodes once (→ `ValidationError`), runs, encodes to JSON.
  `inputSchema = toStandardJSONSchemaV1(toStandardSchemaV1(toEncoded(input)))` so the SDK validates and
  advertises the wire shape and never hands decoded values to `call`. A non-object result (`get_current_plan`
  → null) goes out as text only, no `structuredContent`. Typed errors → `isError` text; `PersistenceError` and
  defects are logged and shown as `storage unavailable` / `internal error`.
- D1 budget (Free: 50 statements per invocation): `get_overview` ≤ 5, via `SessionRepo.listSetsInRange`.
- Clients send `accept: application/json, text/event-stream` (else -32000) and, in workerd tests, a `host`
  header; 2025-era protocol replies are SSE `data:` lines.
- Local attach without touching user config: `claude -p "…" --mcp-config <file> --strict-mcp-config
  --allowedTools mcp__tanren-local__get_overview` with `{"mcpServers":{"tanren-local":{"type":"http","url":
  "http://localhost:<port>/mcp","headers":{"Authorization":"Bearer local-dev-only-mcp-token"}}}}`.
  `claude` may not be on PATH in agent shells (VS Code ships a binary under the extension's
  `resources/native-binary/`).

## Commands

`pnpm -F @tanren/worker check` (package gate: biome → typecheck incl. scripts → both test projects) ·
`dev` · `test` · `typecheck` · `pnpm db:migrate` · `pnpm db:seed` · `pnpm db:reset` (root; local D1 only)

## Status

Step 3 (2026-10-20): integrated with @tanren/db on local D1 (INT-1): REST, Better Auth magic link and sync push/pull pass `pnpm smoke:worker` after `pnpm db:reset`. Workerd project exists (TOOL-1: `/health` on migrated D1). Hardening-1 (2026-10-20): test types split out of prod (`tsconfig.test.json`), `Cloudflare.Env` merge in `cloudflareEnv.d.ts` (no `biome-ignore` left), silent `wrangler dev` startup (lazy Better Auth), 503 `SessionStoreUnavailable` when the session store fails, HTTP tests for nested set routes. HI-1 (2026-10-20): `SessionStoreUnavailable` lives in `@tanren/shared`; every `/api/auth/*` failure answers 503. QA edge tests (`src/api/Routes.edge.test.ts`): 21 routes 401 signed out, cursor/limit validation 400, nested set routes 404 for foreign ids. Known gap: `SyncStoreMemory` (Node fake) has no LWW, no parent checks and never reports conflicts, so push rules are proven only in the db workerd project. Next: a workerd test that boots `src/index.ts` with a D1 round trip and a sync push → pull through the real `SyncStore` (INT-B).
Step 4 (2026-10-20, team mcp): `/mcp` serves `get_overview`, `get_exercise_history`, `list_sessions`, `get_current_plan` to the dev-token user; workerd test `mcp/McpRoute.workerd.test.ts` (initialize, tools/list, calls, 401); Claude Code headless called `get_overview` against `wrangler dev` on the seed (5 sessions / 65 sets in 7d). Known gap: no test boots `src/index.ts` itself (its module-scope `env` needs `ENVIRONMENT` in the workerd test env). Next: step 5 write tools + OAuth.
INT-A (2026-10-20): root `pnpm dev` runs this Worker on :8787 next to the web export on :8790; the owner recipe (`docs/design/local-dev.md` §Owner recipe) was proven end to end: web magic link → set logged → `/sync/pull` and MCP `list_sessions` (Claude Code headless) return it.
