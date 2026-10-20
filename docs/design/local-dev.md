# Local development without a production database

Status: accepted (2026-10-20; §8 decisions recorded in ADR-0008). The spec for how steps 2–7 run, test and seed locally.
Short answer: **yes.** Wrangler runs the Worker in local `workerd` (Miniflare) with a local D1, KV and
Durable Objects, all stored as SQLite files under `apps/worker/.wrangler/state/v3`. No Cloudflare account,
no login, no production data. Tags: **[R]** = `docs/research/2026-10-19-cloudflare-core.md` /
`…-toolchain-versions.md`; **[V]** = verified for this note; **[INF]** = inferred; **[UNV]** = unverified.

## 1. Worker, D1, KV, Durable Objects: all local

- `wrangler dev` (from `apps/worker`) is local by default; the local D1 cannot see remote data unless a
  binding sets `"remote": true`, which this repo never does [R §2]. Listens on `localhost:8787`; `--ip`
  changes the interface [V wrangler commands page, Oct 18 2026].
- **No account needed** [INF, strong]: the researcher ran `wrangler dev`, `d1 migrations apply`, Durable
  Objects and `getPlatformProxy` in scratch projects while `deploy`/`secret put` were "not executed: needs
  credentials" [R §1–2]. Local `database_id` is a placeholder; it only names the SQLite file.
- State: `apps/worker/.wrangler/state/v3/{d1,kv,do}/…sqlite`, persists across runs, git-ignored [R §2].
  A second wrangler config in the same directory with the same `database_id` (e.g. an MCP Worker, if the
  one-vs-several-Workers ADR picks option A) shares the same local D1 file [INF].
- Migrations: `drizzle-kit generate` writes `packages/db/migrations/*.sql`; the Worker binding points at it
  with `"migrations_dir": "../../packages/db/migrations"` [R §1]. Apply with
  `wrangler d1 migrations apply tanren --local` (no flag also means local, but scripts always pass `--local`).
- KV (`OAUTH_KV` for `workers-oauth-provider`, step 5) and Durable Objects (only if `McpAgent` is kept;
  `createMcpHandler` needs none [R §0.3]) are simulated by the same Miniflare instance.
- **Seed (step 2 target).** Pure, deterministic generator in `@tanren/db` (`src/seed/month.ts`:
  `seedMonth({ userId, seed, endDate }) → rows per table`, built from the shared schemas, unit-tested).
  Runner `apps/worker/scripts/seed.ts` gets `env.DB` from `getPlatformProxy({ configPath: "wrangler.jsonc",
  persist: { path: "<abs>/apps/worker/.wrangler/state/v3" }, remoteBindings: false })` and inserts through
  the real `D1Client` layer in batches (≤ 100 bound params per statement) [R §2: executed, data visible to a
  running dev server]. Always pass `remoteBindings: false` and an absolute `persist.path`. Fixed seed user
  `00000000-0000-4000-8000-000000000001`, email `dev@tanren.local`. How the runner executes TypeScript is open (§9).
- Scripts (in `apps/worker/package.json`, exposed at the root):
  `db:migrate` = `wrangler d1 migrations apply tanren --local`; `db:seed` = run the runner;
  `db:reset` = delete `apps/worker/.wrangler/state`, then `db:migrate`, then `db:seed`.

## 2. Three environments

| | local (default) | preview (optional) | production |
|---|---|---|---|
| Runs | `wrangler dev`, Vitest | `wrangler deploy --env preview` | `wrangler deploy --env production` |
| Config | top level of `wrangler.jsonc` | `env.preview` | `env.production` |
| D1 | placeholder id, local SQLite | `tanren-preview` (real, throwaway data) | `tanren` |
| Hosts | `localhost:8787` | `*.workers.dev` | `api.`/`mcp.`/`tanren.me` routes |
| Secrets | none needed (dummy values in `vars`) | `wrangler secret put --env preview` | `wrangler secret put --env production` |
| Who | agents and owner | owner only | owner only |

- Top level = local, so a bare `wrangler dev` or test run can never hit Cloudflare. Its `vars` carry
  `ENVIRONMENT: "local"`, `BETTER_AUTH_URL: "http://localhost:8787"`, `ALLOWED_ORIGINS:
  "http://localhost:8081"`, `EMAIL_MODE: "console"`, and dummy, clearly fake `BETTER_AUTH_SECRET` and
  `DEV_MCP_TOKEN`. So a fresh clone needs **no `.dev.vars`** (agents cannot read it anyway).
- `env.production`/`env.preview` repeat every binding and var (bindings and `vars` are not inherited
  [INF from Cloudflare docs; confirm in step 3]), declare `"secrets": { "required": [...] }` [R §1], set
  `ENVIRONMENT`/`EMAIL_MODE: "provider"`, and hold `routes` (routes only under `env.production` also avoids
  the local host-rewrite gotcha [R §1]). `.dev.vars` / `.dev.vars.<env>` stay available for the owner,
  e.g. a real email key while testing locally [R §1].
- Startup guard (step 3, in the config layer): `ENVIRONMENT !== "local"` with `EMAIL_MODE === "console"`
  or with `DEV_MCP_TOKEN` set fails with a `ConfigError` before serving.
- **Agents never touch remote resources.** Forbidden for agents: `wrangler login`, `deploy`, `secret`,
  `d1 create`, any `--remote` or `--env preview|production`, `dev --remote`, `remoteBindings: true`,
  `"remote": true`. Deploy scripts always name `--env`. Recommend the Lead adds a PreToolUse hook that
  rejects these command patterns.

## 3. Tests

- **Worker (and any test that needs D1/KV):** `@cloudflare/vitest-plugin` 1.4.6, **not**
  `@cloudflare/vitest-pool-workers` (0.23.0 peers `vitest ^4.1.0`; we pin 5.0.5). The plugin peers
  `vitest ^4.1.0 || ^5.0.0` [V npm]; tests run in `workerd` with per-test-file isolated storage, fully
  local [V Cloudflare Vitest pages, Aug 20 / Oct 17 2026]. `apps/worker/vitest.config.ts`:
  ```ts
  import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin"
  plugins: [cloudflareTest(async () => ({ wrangler: { configPath: "./wrangler.jsonc" },
    miniflare: { bindings: { TEST_MIGRATIONS: await readD1Migrations("../../packages/db/migrations") } } }))]
  // setup file: import { env } from "cloudflare:workers"; import { applyD1Migrations } from "cloudflare:test"
  //             await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
  ```
  `cloudflareTest` (accepts options or an async function), `readD1Migrations` (package root) and
  `applyD1Migrations(db, migrations, table?)` (`cloudflare:test`) exist in the 1.4.6 types [V];
  `env` from `cloudflare:workers` [V]. The `miniflare.bindings` key is [UNV]. Tests use the real D1Client
  layer; `@effect/vitest` `it.effect` inside workerd is [INF].
- **`packages/shared`, pure parts of `packages/db`:** plain Vitest (Node), no Cloudflare. `packages/db`
  repository tests either use `cloudflareTest` with inline `miniflare: { d1Databases: ["DB"] }` [UNV] or
  live in `apps/worker`; step 2 picks the one that runs.
- Both are projects of the root `vitest run` (`vitest.config.ts` already allows a per-package config).
  pnpm 12 must allow `workerd`'s build script (`allowBuilds`) [R §0.5].

## 4. Auth: magic link without an email provider

- Better Auth's `magicLink({ sendMagicLink: async ({ email, url, token, metadata }, ctx) => … })` leaves
  delivery entirely to us; there is no built-in dev mode; default `expiresIn` 300 s
  [V better-auth.com magic-link page]. The link points at `GET <BETTER_AUTH_URL>/…/magic-link/verify`.
- `sendMagicLink` calls an `EmailSender` service (`Context.Service`). Layers: `layerConsole` logs
  `magic link for <email>: <url>` with `Effect.logInfo` (shows in the `wrangler dev` terminal);
  `layerCapture` (tests) records sends in a `Ref` so a test can sign in end to end; `layerProvider`
  (production: `ResendEmailSender` posts to `https://api.resend.com/emails`; secret `RESEND_API_KEY`, sender `EMAIL_FROM`; ADR-0008). `EMAIL_MODE` selects the layer.
- Owner flow locally: enter `dev@tanren.local` in the web app, click the link printed by wrangler.
  Native (iPhone) login in dev depends on the Expo/Better Auth integration (§9).

## 5. MCP locally

- Step 4 (read tools, before OAuth): in `ENVIRONMENT=local` only, the MCP route also accepts
  `Authorization: Bearer <DEV_MCP_TOKEN>` and acts as the seed user. Attach:
  `claude mcp add --transport http tanren-local http://localhost:8787/mcp --header "Authorization: Bearer <token>"`
  (port 8788 if MCP becomes its own Worker). `--header` syntax [UNV in this note; check `claude mcp add --help`].
- Step 5 (OAuth): `workers-oauth-provider` on local KV; Claude Code runs the browser flow against
  localhost and the login uses the console magic link [INF]. The Claude app's custom connector is
  reached from Anthropic's servers, so it cannot use localhost [INF]: test it on preview or via a tunnel.

## 6. Expo app against the local API

- Base URL resolution in `apps/mobile/src/services/` (one function): `process.env.EXPO_PUBLIC_API_URL`
  (static access only, inlined at bundle time [V Expo env page]; set in the command env for
  export/EAS Update, e.g. `https://api.tanren.me`) → else dev native: Metro's host IP + `:8787` (from
  expo-constants host URI [UNV API name]) → else dev web: `http://localhost:8787`.
- Web: `expo start --web` on `localhost:8081`; cross-origin to `:8787`, so the Worker allows
  `ALLOWED_ORIGINS` (CORS with credentials) and Better Auth `trustedOrigins` uses the same var.
- iPhone with Expo Go on the same Wi-Fi: Expo Go already loads the bundle from the Mac's LAN IP; the API
  must listen there too: `wrangler dev --ip 0.0.0.0` (exposes the dev API to the LAN). Off-LAN:
  `expo start --tunnel` tunnels Metro only; the API then needs `cloudflared tunnel --url
  http://localhost:8787` [UNV, no account?] or the preview environment.

## 7. The local loop

- Root `pnpm dev` = `pnpm --parallel -F @tanren/worker -F @tanren/mobile dev` (no new dependency).
  Worker `dev` = `db:migrate && wrangler dev --ip 0.0.0.0 --show-interactive-dev-session=false`;
  mobile `dev` = `expo start`. Two terminals (`pnpm dev:api`, `pnpm dev:app`) give the full Expo TUI and QR
  code; whether the QR renders under `--parallel` is [UNV]. First run: `pnpm install && pnpm db:reset && pnpm dev`.
- **`pnpm check` covers** (no network, no account): Biome, typecheck, shared/db unit tests, and Worker
  integration tests in workerd against a real, migrated local D1: HttpApi, sync push/pull, auth with
  `layerCapture`, MCP tool handlers. **Needs `pnpm dev` (manual/QA):** UI on web and iPhone, offline
  behaviour on device, Claude Code attached to MCP, clicking real magic links. **Needs preview/prod
  (owner):** real email, the Claude app connector, free-plan CPU (10 ms) and custom domains.

## 8. Decisions for the owner — decided in ADR-0008

Decided 2026-10-20 by the Lead under owner delegation
(`docs/adr/0008-local-development-and-environments.md`). Questions kept for history.

1. **Local secrets live as dummy `vars` in the committed config** (zero-setup clone, agents never need
   `.dev.vars`), with a startup guard so non-local envs must use real secrets. Alternative: `.dev.vars`
   created by the owner.
   **Decision:** yes. Dummy `vars` in `apps/worker/wrangler.jsonc`, guard in `src/Config.ts`;
   `.dev.vars` is an owner-only override; agents never read `.dev.vars*`.
2. **Preview environment:** create `tanren-preview` D1 + `env.preview` now (needed for the Claude app
   connector and off-LAN phone tests in steps 5–6), or defer until step 5.
   **Decision:** no preview now. Local is dev, production is the only remote environment; the
   "preview" column in §2 is not created. Revisit at step 5 only if the Claude app connector cannot
   be tested safely against production.
3. **Email provider for production magic links** (none chosen; local and tests need none). Decide by step 3's end.
   **Decision:** Resend (HTTP API, free tier) via a `layerProvider` selected by `EMAIL_MODE:
   "provider"`; console sender stays the local default. Cloudflare Email Service was checked and
   failed two of three criteria (Email Sending is Beta; not available on Workers Free), see the ADR.
   Owner actions: Resend account, `tanren.me` domain verification (DNS records in Cloudflare),
   `wrangler secret put RESEND_API_KEY --env production`.

## 9. Open / unverified (for a researcher before the step that needs it)

- Step 2: how `apps/worker/scripts/seed.ts` runs TypeScript (Node 24 type stripping with extensionless
  workspace imports vs adding `tsx`); `miniflare.bindings` / inline `d1Databases` in `cloudflareTest`.
- Step 3: exact wrangler env inheritance (`vars`, bindings, `secrets`), and what `wrangler types` emits
  for multi-env configs; that local mode truly needs no login (run once with `CLOUDFLARE_API_TOKEN` unset).
- Step 4: `claude mcp add --header` syntax; whether the dev bearer path fits `createMcpHandler`.
- Step 6: Better Auth with Expo native (cookie/session storage, deep-link `callbackURL`), expo-constants
  host-URI field name, `cloudflared` quick tunnel without an account.


## 9a. Implemented (2026-10-20)
`pnpm db:migrate` / `pnpm db:seed [--seed n] [--end YYYY-MM-DD]` / `pnpm db:reset` (root) run against the local D1 under `apps/worker/.wrangler/state`; the runner is `apps/worker/scripts/seed.ts` via `tsx` (Node type stripping fails on extensionless imports).
