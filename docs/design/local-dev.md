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
- KV and Durable Objects would be simulated by the same Miniflare instance, but the Worker uses neither
  (`OAUTH_KV` and `workers-oauth-provider` were removed by ADR-0022; `createMcpHandler` needs no DO [R §0.3]).
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

- **Seed first** (`pnpm db:seed`, or `pnpm db:seed -- --persist-to <dir>` for a scratch D1 migrated with
  `wrangler d1 migrations apply tanren --local --persist-to <dir>`): the dev token acts as the seed user, and on
  an empty D1 every tool answers `Forbidden` (nutri-server N-SQ).

- OAuth (stateless since ADR-0022, `docs/design/auth-v2.md` §5): the Worker is its own authorization
  server. No KV, no Durable Object, no account, no library: `src/oauth/provider.ts` is the router,
  `clients.ts` (CIMD and DCR), `consent.ts`, `token.ts` and `metadata.ts` hold the logic, and the only state
  is D1 (`user.appTokenGen` / `mcpTokenGen`, table `oauth_code_use`, migration 0006: `pnpm db:reset` applies
  it). Every key is an HKDF sub-key of the local fake `BETTER_AUTH_SECRET`. `MCP_RESOURCE_URL` is
  `http://localhost:8787/mcp` (`http:` is accepted only when `ENVIRONMENT=local`). The authorize page signs
  in with Better Auth's magic link, which the local console `EmailSender` prints in the wrangler terminal
  (the same link as §4). `src/oauth/oauth.workerd.test.ts` is the automated flow test (register →
  authorize → token → `tools/list`, replayed code, refresh, revoke-mcp).
  Start the Worker as STLS-3's smoke did, on a spare port (on 8787 the committed vars already match, so no `--var`):
  `apps/worker/node_modules/.bin/wrangler dev --port <p> --var BETTER_AUTH_URL:http://localhost:<p> --var MCP_RESOURCE_URL:http://localhost:<p>/mcp`
  (backgrounded, PID file; on any port other than 8787 the `MCP_RESOURCE_URL` var is required, otherwise
  every MCP call is 401 `Invalid audience`). For the web app on another port also pass
  `--var ALLOWED_ORIGINS:http://localhost:<expo port>` (the CORS default covers 8081 and 8790 only). Native
  `begin` with `exp://localhost:8081/--/auth/callback` works locally without `NATIVE_RETURN_PREFIXES`.
  The steps below are the flow the workerd test sends; **run end to end 2026-10-27 13:23–13:28 (STLS-Q,
  wrangler dev :8982): 9 tools, replayed code → invalid_grant, revoke-mcp → refresh invalid_grant, access token
  valid ≤ 15 min after revoke (stateless)**; result in `docs/tasks/v5-auth/team-stateless.md`:
  1. `POST /mcp` (no token) → 401 `WWW-Authenticate: Bearer realm="OAuth", resource_metadata="http://localhost:<p>/.well-known/oauth-protected-resource/mcp", scope="…"`.
  2. `GET /.well-known/oauth-authorization-server` → issuer, `/authorize`, `/oauth/token`, `/oauth/register`,
     `scopes_supported`, `code_challenge_methods_supported: ["S256"]`, `client_id_metadata_document_supported: true`.
  3. `POST /oauth/register`, JSON `{"redirect_uris":["http://localhost:9999/cb"],"client_name":"curl","token_endpoint_auth_method":"none"}`
     → 201 `{ client_id, … }` (a signed JWT: stateless DCR, nothing is stored).
  4. `GET /authorize?response_type=code&client_id=<id>&redirect_uri=http%3A%2F%2Flocalhost%3A9999%2Fcb&scope=tanren%3Aread%20tanren%3Awrite&state=<s>&code_challenge=<S256(verifier)>&code_challenge_method=S256&resource=http%3A%2F%2Flocalhost%3A<p>%2Fmcp`
     signed out → the login page; `POST /authorize/login` (form `email`, `next`) → the magic link is printed in
     the wrangler log. Open it in the browser (sets the session cookie).
  5. Consent page (a DCR client has no verified domain, so the "Unknown app" warning and "Allow anyway" show):
     the form posts `POST /authorize` with `handle` (the consent JWT), `decision=approve`, `scope=…` and the
     `__Host-tanren-consent` cookie (Secure, HttpOnly, SameSite=Lax; `http://localhost` is a secure context in
     browsers, curl needs the cookie passed by hand) → 302 to `redirect_uri?code=…&state=…` (only those two parameters).
  6. `POST /oauth/token`, form `grant_type=authorization_code`, `code`, `code_verifier`, `client_id`,
     `redirect_uri` → `{ access_token, token_type: "Bearer", expires_in: 900, scope, refresh_token }`
     (`no-store`). The same code a second time → 400 `invalid_grant` (burned in `oauth_code_use`).
  7. `POST /mcp` with `Authorization: Bearer <access_token>`, `accept: application/json, text/event-stream`,
     JSON-RPC `tools/list` → 9 tools (6 with a read-only grant).
  8. Refresh: `POST /oauth/token`, form `grant_type=refresh_token`, `refresh_token` → a new pair. After
     `POST /api/token/revoke-mcp` (web cookie session or an app access JWT) the old refresh token answers 400
     `invalid_grant`, and the old access token stays valid until it expires (15 min).
  Native app tokens (not OAuth): `POST /api/native/begin` then the magic link (§6a), then
  `POST /api/native/session` with JSON `{ code, verifier }` → `{ userId, access: { accessToken, refreshToken, expiresAt } }`.
  `POST /api/token/refresh` (JSON `{ refreshToken }`, no cookie) → a new `AppTokenPair`; `POST /api/token/revoke`
  (Bearer app access JWT) → 204 and every app token of the user dies; `POST /api/token/revoke-mcp` → 204 and
  every MCP token and code of the user dies. Any rejected credential is 401 `TokenRejected` with
  `reason: "expired" | "revoked" | "invalid"`, all `no-store`. STLS-3 ran the native part on port 8981
  (`team-stateless.md` Log, 13:08); the MCP part is proven by the workerd test and by STLS-Q's curl run above.
  Claude Code: `claude mcp add --transport http tanren-local http://localhost:8787/mcp` (no header) should run
  the same flow in a browser. **Unverified**: no agent has a headless browser login, so this has not been run.
- Dev token (fallback, local only): with `ENVIRONMENT=local` the MCP route also accepts
  `Authorization: Bearer <DEV_MCP_TOKEN>` and acts as the seed user with every scope (`McpAuth.layerDevToken`;
  `layerLive` tries the MCP JWT first, then the dev token). Attach as in the Owner recipe below; the
  `--header` form is the one INT-A ran. Port 8788 only if MCP ever becomes its own Worker.
- The Claude app's custom connector is reached from Anthropic's servers, so it cannot reach
  localhost. Question for the owner: does it get tested on a tunnel or only on the production
  Worker, given ADR-0008 decided against a preview environment? Unproven; nothing here has tried a tunnel.

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

## 6a. Phone sign-in (Expo Go, native one-time-code flow; docs/design/native-auth.md §5)

The magic link is built from `BETTER_AUTH_URL` and verify redirects relative to it, so for the phone the
API must call itself by the Mac's LAN address. `pnpm dev:phone` does that: wrangler on `0.0.0.0:8787` with
`BETTER_AUTH_URL=http://<LAN IP>:8787` and `ALLOWED_ORIGINS` extended by `http://<LAN IP>:8081`, its output
piped through `apps/worker/scripts/linkQr.mjs`, which passes every line through and prints a terminal QR
after each `magic link for <email>: <url>` line (`uqr`, a worker devDependency; never in the bundle).
The LAN IP is detected (`ipconfig getifaddr en0`, Wi-Fi on macOS); override with `LAN_IP=192.168.x.y pnpm dev:phone`
(other interface, Ethernet), and `PORT=<n>` moves the API off :8787 (`BETTER_AUTH_URL` and `MCP_RESOURCE_URL` follow: `dev:phone` passes
`--var MCP_RESOURCE_URL:http://localhost:$P/mcp`, so the MCP dev token and `/.well-known/oauth-protected-resource/mcp`
work on any port; before that fix INT-X2 got 401 "Token audience does not match resource server" and a PRM 404 on
:8797). The resource stays on `localhost`, not the LAN IP: the OAuth provider accepts `http:` only on a loopback
host and the Worker fails to boot otherwise (`resourceMetadata.resource is required … http is accepted only on a
loopback host`, probed 2026-10-21), so MCP clients connect to `http://localhost:$P/mcp` on the Mac. `/api/native/begin` needs `email`, a 43-char
base64url `challenge` and `returnTo`; an unpinned host gives 400 `NativeBeginRejected{reason:"return-to"}`.
`dev:phone` also sets `NATIVE_RETURN_PREFIXES=exp://localhost:,exp://127.0.0.1:,exp://<LAN IP>:`, because the
worker only links back to pinned prefixes (`exp://<host>:<port>/--/auth/callback`), and Expo Go's host here is the Mac's LAN IP.

1. Terminal A: `pnpm dev:phone` (API only; wait for `Ready on http://0.0.0.0:8787`).
2. Terminal B: `pnpm -F @tanren/mobile dev`; scan the Expo QR with the iPhone camera → Expo Go.
3. In Expo Go: Sign in → `dev@tanren.local` → send the link.
4. Terminal A prints `magic link for dev@tanren.local: http://192.168.x.y:8787/api/auth/magic-link/verify?…`
   and a QR. Scan that QR with the iPhone camera: it must open on the PHONE (Safari). On the Mac the
   deep link has no Expo Go. No camera: copy the URL and paste it into iPhone Safari (Universal Clipboard).
5. Safari shows "Open Tanren" → tap → "Open in Expo Go?" → Open: Expo Go lands on `/auth/callback`, the app
   exchanges the one-time code for an app token pair (`POST /api/native/session`, ADR-0022) and shows Today, signed in.
6. Log a set; Terminal A shows `POST /sync/push 200` (wrangler request log).

While `dev:phone` runs, web sign-in on `localhost:8790` does not work (the cookie lands on the LAN host);
use `pnpm dev` for web. Production: link host `api.tanren.me`, same steps from Mail.

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
- Step 4: settled. `claude mcp add --transport http … --header "Authorization: Bearer …"` was run by INT-A
  (Owner recipe below), and the dev bearer path fits `createMcpHandler` (`McpAuth.layerDevToken`).
- Step 6: Better Auth with Expo native (cookie/session storage, deep-link `callbackURL`), expo-constants
  host-URI field name, `cloudflared` quick tunnel without an account.


## Owner recipe (proven end to end by INT-A, 2026-10-20)

From the repo root, in one terminal:

```
pnpm install
pnpm db:reset        # wipes apps/worker/.wrangler/state, migrates, seeds dev@tanren.local
pnpm web:export      # writes apps/mobile/dist (re-run after any app change)
pnpm dev             # API on http://localhost:8787 (wrangler prints 0.0.0.0:8787) + web on http://localhost:8790; Ctrl-C stops both
```

1. Open `http://localhost:8790`. Signed out, Today shows the demo plan; tap **Sign in**.
2. Enter `dev@tanren.local`, tap **Send magic link**. The `pnpm dev` terminal prints
   `magic link for dev@tanren.local: http://localhost:8787/api/auth/magic-link/verify?token=…`; open it in the
   same browser. You land on Today with the server plan for today (seed: "Lower A" on Tuesday).
3. Tap **Log set 1**. The app pushes on its sync loop, within about 60 s (logging does not trigger a push).
4. The **Plan** tab shows the week; today's session reads "done"; two columns at ≥ 900 px.
5. Attach Claude Code to the local MCP server (token = `DEV_MCP_TOKEN` in `apps/worker/wrangler.jsonc`):

   ```
   claude mcp add --transport http tanren-local http://localhost:8787/mcp --header "Authorization: Bearer local-dev-only-mcp-token"
   ```

   Then ask it to call `get_overview` and `list_sessions` (`from`/`to` ISO timestamps, `includeSets: true`)
   for today: the set from step 3 is listed. Without touching your Claude config:
   `claude -p "…" --mcp-config mcp.json --strict-mcp-config --allowedTools mcp__tanren-local__list_sessions`
   with `{"mcpServers":{"tanren-local":{"type":"http","url":"http://localhost:8787/mcp","headers":{"Authorization":"Bearer local-dev-only-mcp-token"}}}}`
   (the form INT-A ran).

### v2 additions (steps 6–8 INT-X1; 9–15 INT-X1b, 2026-10-21, on the export at 1280 px light and 390 px dark)

Same three commands (`pnpm db:reset` seeds 14 exercises, 15 sessions; `pnpm web:export`; `pnpm dev`).

6. `curl -si localhost:8790/manifest.json` → `200`, `Content-Type: application/json`, `theme_color` `#C2410C`.
7. Signed out, Today shows the demo "Full body A"; **Sign in** (a button) → `/sign-in` → `dev@tanren.local`
   → **Send magic link** → open the printed link → `/today` shows "Lower A" (Back Squat 107.5 kg × 5).
8. Tabs: Today, Plan, Programs, Library, Progress. **Library**: type `squat` in "Search exercises" →
   15 hits (Barbell Back Squat, Front Squat, Goblet, Hack, …); muscle tab **Chest** with `squat` leaves only
   Burpee; tap **Barbell Back Squat** → `/library/barbell-back-squat` with "Illustration placeholder"
   (illustrations not wired yet) and **Add to today's session** → returns to `/today`.
9. **Add to today**: a catalog exercise that is not in today's session (Library → **Goblet Squat** → **Add to
   today's session**) appends a new page on Today ("1 of 6", heading "Goblet Squat", "Set 1 of 3"). One that
   is already there (**Barbell Back Squat** while "Back Squat" is planned) reuses it: no new page, the sets
   already logged stay ("Set 2 of 5" after logging set 1).
10. **Programs** → **Enrol in Core 30** → "Core 30 · Day 1 of 30" → **Start day 1** → `/programs/play`:
    "Work · Dead Bug · Round 1/3 · Exercise 1/7" with a ticking `timer` ("23 seconds left" → "16 seconds
    left"); **Next** → "Rest", the ring around the countdown ("Up next: Crunch · 25 s"); **Finish workout** →
    "Workout complete · Logged as session" → **Close**. Today now shows the banner **Core 30 · Day 2** (the
    next day; button "Open Core 30 day 2"), and Progress lists "Dead Bug, last logged <today>".
11. **Progress**: log a heavier set on Today (**Increase Weight** to 127.5 kg → **Log set 2**). Progress →
    Exercises: "Back Squat, best set 127.5 kg × 5, e1RM 148.8 kg"; its page (aside at ≥ 900 px,
    `/progress/<exerciseId>` on a phone) shows the muscle map, "Volume last 8 weeks" and "Estimated 1RM, last 8
    weeks" charts and a **PR** pill on the 127.5 kg set.
12. **Settings** (Progress → gear button "Settings", or `/settings`): Appearance **Dark** → reload → still Dark.
    **Export my data** downloads `tanren-export-….json`; it decodes with `DataExport` from `@tanren/shared`
    (from `apps/worker`: `F=<file> pnpm exec tsx -e 'import { DataExport } from "@tanren/shared"; import {
    Schema } from "effect"; import { readFileSync } from "node:fs"; Schema.decodeUnknownSync(DataExport)(JSON.parse(readFileSync(process.env.F, "utf8")))'`).
13. **Sign out** → Today signed out ("Nothing planned today", **Sign in** button) → sign in again with a new
    link → Today shows "Lower A", the Core 30 · Day 2 banner and the logged sets ("Set 3 of 5").
14. **PWA**: Chrome reports the export installable (`Page.getInstallabilityErrors` → `[]`,
    `Page.getAppManifest` → `/manifest.json`, no errors; `crossOriginIsolated` true). Desktop Chrome: the
    install icon in the address bar.
15. **MCP/OAuth metadata** on the API: `GET /.well-known/oauth-authorization-server` → 200 (issuer =
    `BETTER_AUTH_URL`, scopes `tanren:read`, `tanren:write`); `GET /.well-known/oauth-protected-resource/mcp` →
    200 `{resource: "<MCP_RESOURCE_URL>", authorization_servers: [...]}` **only when `MCP_RESOURCE_URL` has the
    port the API listens on** (the provider matches the metadata URL's origin to the resource's; otherwise
    404). The bare `/.well-known/oauth-protected-resource` is 404 by design (the resource has the path `/mcp`).
    `tools/list` with the dev token → 8 tools (5 read + 3 write).

Isolated copy of this recipe (parallel agents, nothing shared): `pnpm db:reset` once, copy
`apps/worker/.wrangler/state/.` into a `mktemp -d` dir, then from `apps/worker`
`wrangler dev --port <api> --inspector-port <i1> --persist-to <dir> --var ALLOWED_ORIGINS:http://localhost:<web>
--var BETTER_AUTH_URL:http://localhost:<api> --var MCP_RESOURCE_URL:http://localhost:<api>/mcp`, export with
`EXPO_PUBLIC_API_URL=http://localhost:<api> CI=1 pnpm exec expo export --platform web --output-dir <dist>`
(from `apps/mobile`), serve with `wrangler dev -c wrangler.web.jsonc --port <web> --inspector-port <i2> --assets <dist>`.
Two wranglers started together need distinct `--inspector-port`s (else the second dies "Address already in use"),
and with `BETTER_AUTH_URL` set the printed magic link already carries the API port.

`pnpm dev` runs the root scripts `dev:api` (`wrangler dev --ip 0.0.0.0`, also reachable from the phone on the
LAN) and `dev:web` (`pnpm web:serve`) in parallel through pnpm's regex script selector. For the Expo dev
server instead of the export: `pnpm dev:api` plus `pnpm -F @tanren/mobile web` (`:8081`).

## §STRAVA_MODE: the Strava export locally (ADR-0018, `docs/design/integrations.md`)

`apps/worker/wrangler.jsonc` top-level vars carry `STRAVA_MODE: "console"`, `STRAVA_CLIENT_ID:
"local-strava-client"` and a fake `INTEGRATION_TOKEN_KEY` (32 zero bytes, base64), plus the cron
`triggers.crons: ["*/5 * * * *"]`. No Strava account, no network, no secret: `Config.ts` refuses the
fake key whenever `ENVIRONMENT` is not `local` (`STRAVA_MODE=console` is allowed everywhere: production runs it
until the owner has a Strava app, deploy.md §Strava secrets).

- **Connect short-circuits.** In console mode `POST /integrations/strava/connect` does not return a
  strava.com URL: it returns `${BETTER_AUTH_URL}/integrations/strava/callback?state=<signed state>&code=console&scope=read,activity:write`
  (`authorizeUrl` in `apps/worker/src/integrations/connect.ts`), so the browser walks the real callback
  and lands on `/settings/integrations?connected=strava`; the console `StravaApi.exchangeCode` grants a
  fake athlete "Console Athlete". This works only when `ENVIRONMENT=local`: outside local, connect answers
  `ConnectRejected{not-configured}` and the callback 400 "Strava is not connected yet".
- **The export log line.** Finishing a session pushes; `Sync.push` enqueues and drains one row, and the
  `wrangler dev` terminal prints `[strava:console] create activity Strength training <start_date_local> <elapsed>s`
  (never a token or code). The row becomes `sent` with `externalActivityId` `console-<first 8 of sessionId>`.
- **Scheduled drain.** Rows that did not go out in the push (Pending after a failure, Blocked) are picked up
  by the cron. Start the worker with `--test-scheduled` and call the route:
  `wrangler dev --test-scheduled` then `curl "localhost:<port>/cdn-cgi/local/scheduled?cron=*/5+*+*+*+*"`
  (the log shows `[scheduled] export drain attempted=<n>`; at most 10 rows per run).
- **Simulate a lapsed subscription.** `wrangler dev --var STRAVA_CONSOLE_FAIL:inactive` makes the console
  `createActivity` fail like an inactive Strava app: the export becomes `blocked` (retried every 12 h, never
  `dead`), the log shows `[strava] application refused status=403 …`, Settings shows "Strava app inactive —
  resubscribe on strava.com" and Retry. `Config.ts` accepts only the value `inactive`, and only with `STRAVA_MODE=console`.
- **Another dev server is running?** Use a spare port and its own state, as in the isolated recipe above:
  `wrangler dev --test-scheduled --port <api> --inspector-port <i1> --persist-to <dir> --var MCP_RESOURCE_URL:http://localhost:<api>/mcp`
  with `<dir>` from `mktemp -d`; never `db:reset` while another agent shares the default state.

## §GARMIN_MODE: the Garmin import locally (ADR-0023, `docs/design/garmin.md`)

`apps/worker/wrangler.jsonc` top-level vars carry `GARMIN_MODE: "console"` (also the `Config.ts` default when the var is
unset) and rely on the same fake `INTEGRATION_TOKEN_KEY` and the same cron (`*/5 * * * *`) as Strava. No Garmin account,
no network, no key. `GARMIN_BASE_URL` is unset locally (decode default `https://personal.connectapi.garmin.com`, unused in console mode).

- **Console fixture.** `GarminApi.layerConsole` answers with 2 activities (a run with a distance, a strength session without
  one) and 7 daily-health days (today back to today − 6). Connect in Settings → Integrations → Garmin by pasting any
  16+ characters; the console exchange accepts them and the display name is fake.
- **Pull it.** Start the worker with `--test-scheduled` and call the cron route (the same call as the Strava drain):
  `curl "http://localhost:<port>/cdn-cgi/local/scheduled?cron=*/5+*+*+*+*"`. The log shows
  `[scheduled] export drain attempted=<n>` then `[scheduled] garmin drain users=<n>` (Garmin runs after the Strava drain,
  each with its own `catchCause`; 4 users per run, at most 10 Garmin calls per user). After the next app sync the Feed shows
  the 2 imported cards and Today shows the day strip.
- **Simulate a rejected key.** `wrangler dev --test-scheduled --var GARMIN_CONSOLE_FAIL:rejected` makes the console
  exchange fail like a revoked or expired key: Settings shows "Token rejected" and asks for a new key. `Config.ts` accepts
  only the value `rejected`, and only with `GARMIN_MODE=console` (startup guard otherwise).
- **Provider mode (real Garmin).** `--var GARMIN_MODE:provider` calls the Garmin Personal API. It needs a real personal
  key pasted into Settings → Integrations → Garmin at run time (generated at connect.garmin.com → Settings → Personal API
  token). **Never put a key in a file, a `--var`, a commit or a committed log**; it is sealed in D1 like the Strava tokens.
  The owner regenerates the key after any test.
- **Another dev server is running?** Spare port and own state, exactly as in §STRAVA_MODE.

## 9a. Implemented (2026-10-20)
`pnpm db:migrate` / `pnpm db:seed [--seed n] [--end YYYY-MM-DD] [--persist-to <dir>]` / `pnpm db:reset` (root; `--persist-to` takes the same `<dir>` as `wrangler … --local --persist-to`, so a scratch D1 needs no copied script; the month seed also writes 10 food entries and 7 Garmin `daily_health` rows) run against the local D1 under `apps/worker/.wrangler/state`; the runner is `apps/worker/scripts/seed.ts` via `tsx` (Node type stripping fails on extensionless imports).
