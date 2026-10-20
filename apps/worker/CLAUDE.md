# @tanren/worker

The Cloudflare Worker: REST API (`@effect/platform` HttpApi), Better Auth
(magic link), the batched sync endpoint, static web hosting, and the MCP
server (`McpAgent` from the Cloudflare Agents SDK + `workers-oauth-provider`).

Domains: `api.tanren.me` (REST), `mcp.tanren.me` (MCP), `tanren.me` (web).

## Boundaries

- Depends on `@tanren/shared`, `@tanren/db`. Never imports from `apps/mobile`.
- Effect everywhere except the `McpAgent` adapter class and the Worker
  `fetch` entry, which are thin adapters that run an Effect program.
- Bindings and secrets come from `wrangler` config / `.dev.vars`; agents do
  not read `.dev.vars`.

## Layout

```
src/
  index.ts            Worker entry (fetch) → makeApp(env, { BetterAuth.layer(env.DB), d1Persistence(env.DB) })
  app.ts              makeApp: HttpApi layer + auth mode + persistence → { handler }; memoryPersistence / d1Persistence
  Env.ts, Config.ts   `Env` interface + config/guard; the `Cloudflare.Env` declare-merge (and the only `biome-ignore noNamespace`) is in index.ts
  api/                HttpApi from `effect/http-api` (NOT @effect/platform): Api, Authentication, Handlers
  repos/              re-exports the @tanren/db ports + D1Layer + PersistenceError; MemoryStore + Repositories.layerMemory (Node tests)
  auth/               Sessions port, SessionsLive (Better Auth), BetterAuth, EmailSender (console locally), authRoutes
  sync/               Sync (push = db SyncStore.apply passthrough, pull + serverTime); SyncStoreMemory (Node fake, no LWW)
  mcp/                McpAgent adapter (step 4) — the only class allowed outside Effect factories
  testing/            workerdSetup.ts (applies migrations 0000+0001 before each workerd test file), env.d.ts (TEST_MIGRATIONS)
  *.workerd.test.ts   tests that run inside workerd on a migrated D1 (project @tanren/worker-workerd)
scripts/seed.ts       local seed runner (tsx; typed by tsconfig.scripts.json with @types/node)
scripts/smoke.ts      `pnpm smoke:worker --port <n> --log <wrangler output file>` against a running dev server
vitest.config.ts      Node project `@tanren/worker` (excludes *.workerd.test.ts)
vitest.workerd.config.ts  workerd project `@tanren/worker-workerd` (@cloudflare/vitest-plugin, wrangler.test.jsonc)
wrangler.jsonc        D1 binding `DB` (db `tanren`), migrations_dir ../../packages/db/migrations, fake local vars
wrangler.test.jsonc   test-only D1 binding + TEST_MIGRATIONS for the workerd project
```

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

## Commands

`pnpm -F @tanren/worker check` (package gate: biome → typecheck incl. scripts → both test projects) ·
`dev` · `test` · `typecheck` · `pnpm db:migrate` · `pnpm db:seed` · `pnpm db:reset` (root; local D1 only)

## Status

Step 3 (2026-10-20): integrated with @tanren/db on local D1 (INT-1): REST, Better Auth magic link and sync push/pull pass `pnpm smoke:worker` after `pnpm db:reset`. Workerd project exists (TOOL-1: `/health` on migrated D1). Next: a workerd D1 round trip (authenticated `POST /exercises` → `GET`, sync push → pull) so the manual smoke is only needed for auth routes; move the `Cloudflare.Env` merge in `src/index.ts` to a `.d.ts` to drop the last `noNamespace` ignore.
