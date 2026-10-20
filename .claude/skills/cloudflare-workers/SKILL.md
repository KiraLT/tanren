---
name: cloudflare-workers
description: Cloudflare Workers, D1, Wrangler, Drizzle migrations, Better Auth and the Agents SDK MCP handler (stateless createMcpHandler) as used in apps/worker and packages/db. Load for build steps 2–5 and any Worker or D1 work.
---

# Cloudflare Workers for Tanren

Status: **stub**. Filled in by the engineers who start build
step 2 (D1 + Drizzle) and step 3 (Worker). Until then, use only verified
facts from `docs/research/` and the official docs:

- Workers + Wrangler: https://developers.cloudflare.com/workers/
- D1: https://developers.cloudflare.com/d1/
- Drizzle + D1: https://orm.drizzle.team/docs/connect-cloudflare-d1
- Better Auth: https://www.better-auth.com/docs
- Agents SDK / McpAgent: https://developers.cloudflare.com/agents/
- workers-oauth-provider: https://github.com/cloudflare/workers-oauth-provider

## Testing inside workerd (verified S2-T3, 2026-10-20)

`@cloudflare/vitest-plugin@1.4.6` runs `@effect/vitest` `it.effect` inside workerd. Reference
config: `packages/db/vitest.config.ts` (`cloudflareTest(async () => ({ wrangler: { configPath },
miniflare: { bindings: { TEST_MIGRATIONS: await readD1Migrations("./migrations") } } }))`), setup
file applies `applyD1Migrations(env.DB, env.TEST_MIGRATIONS)` from `cloudflare:test`; `env` comes
from `cloudflare:workers`. tsconfig `types: ["@cloudflare/workers-types",
"@cloudflare/vitest-plugin/types"]`; type bindings by merging into `declare namespace Cloudflare
{ interface Env {...} }` in a `.d.ts` (Biome turns `noNamespace` off for `*.d.ts`; no
`biome-ignore`). Name that file after nothing else in its folder: `src/cloudflareEnv.d.ts`, never
`env.d.ts` next to `Env.ts` (macOS tsc drops it silently; `monorepo` skill, TypeScript).
Storage is isolated per test file. Details: `packages/db/CLAUDE.md` "Verified facts".

## No I/O at module scope (verified hardening H3, 2026-10-20)

workerd forbids I/O (D1, fetch, timers) outside a request handler, and the clock there reads
1970. `src/index.ts` runs at isolate start, and `HttpRouter.toWebHandler(layer)` builds every
layer eagerly at that moment, so whatever a layer's `make` does runs outside a request.
`betterAuth()` validates its schema on construction: every `wrangler dev` start logged
`ERROR [Better Auth]: Could not validate the database schema` with a 1970 timestamp, and the
instance was useless. Rule: module scope only describes layers and captures bindings
(`env.DB`); a client that does I/O when constructed is created inside the request and memoised
with `Effect.cached` (`apps/worker/src/auth/BetterAuth.ts`). The runtime proof's startup log
must contain no `[Better Auth]` or `1970` line; a workerd test that boots `src/index.ts` is the
regression guard (hardening integration checklist).

The worker's workerd project (`@tanren/worker-workerd`, TOOL-1) is the runtime proof for the
bundle, so it must exercise every third-party import path, not only module load: `/health` 200,
`/api/auth/get-session` without a cookie (Better Auth loads and answers), one `Authentication`
route → 401. Step 3 shipped 45 green Node tests while every route returned 500 under workerd (a
better-auth re-export failed in wrangler's bundle); `/health` alone catches that class, a lazy
import inside an auth or sync handler it does not.

What this skill must contain when filled: wrangler config layout (`wrangler.jsonc`,
bindings, `nodejs_compat`), local dev + Miniflare D1, migration workflow
(`drizzle-kit generate` → `wrangler d1 migrations apply`), the Effect SQL
D1 layer, secrets handling (`.dev.vars`, never read by agents), custom
domains (`api.`, `mcp.`, apex), static assets for the web build.

## MCP server: stateless `createMcpHandler`, no McpAgent (verified S4-T4, 2026-10-20)

`McpAgent` is deprecated and needs a Durable Object; Tanren uses the stateless handler (ADR-0010):
`import { createMcpHandler } from "agents/mcp/server"` (agents 0.28.1) and
`import { McpServer, type CallToolResult } from "@modelcontextprotocol/server"` (SDK v2, 2.3.1).
`createMcpHandler(factory, { route: "/mcp" })` returns `(request, env, ctx) => Promise<Response>`;
the factory builds a fresh `McpServer` per request, so the caller's `userId` reaches tools by
closure. Layout: `src/mcp/server.ts` (`createServer({ principal, run })`, the only `McpServer`),
`src/mcp/McpRoute.ts` (`makeMcp(env, { persistence, auth })`: one lazy `ManagedRuntime` per
isolate; `McpAuth.resolve(request, ctx)` → `Option<McpPrincipal>`; `None` → `401` with the
`WWW-Authenticate: Bearer realm="OAuth", resource_metadata=…, scope="tanren:read"` challenge
(`challenge()` in `McpAuth.ts`), empty body, before the SDK runs). Since S5 `src/index.ts`
default-exports the `OAuthProvider` (next section), whose `serveWith` routes the exact path `/mcp`
to `mcp.handle` before `app.handler`. Facts:
- `registerTool(name, { description, inputSchema, annotations: { readOnlyHint: true } }, cb)`:
  `inputSchema` must be a `StandardSchemaWithJSON`. Pass the ENCODED side,
  `Schema.toStandardJSONSchemaV1(Schema.toStandardSchemaV1(Schema.toEncoded(input)))`, so the SDK
  advertises/validates the wire shape and hands raw JSON to `call`, which decodes once (the
  decoded side would decode twice and break `Timestamp`). `tools/list` shows a plain JSON Schema
  (`{"type":"object","properties":{"period":{"enum":[…]}}}`).
- `structuredContent` must be a JSON object: a `null` result (`get_current_plan`) is sent as text
  only. Typed errors become `{ isError: true, content: [text] }` via `Effect.catchTags`; never throw.
- Requests need `accept: application/json, text/event-stream` (else JSON-RPC -32000) and a
  localhost/workers.dev `Host` (production needs `allowedHostnames: ["mcp.tanren.me"]`). 2025-era
  protocol answers arrive as SSE (`event: message` / `data: {…}`): parse the `data:` line.
- D1 statement budget: Free tier allows 50 statements per invocation; design D4 caps a tool call at
  5. Count the repository calls per tool and write the count in a comment next to the tool:
  `PlanRepo.currentPlan` alone costs 4 (plan, weeks, sessions, sets), so `get_overview` reads
  `listPlans` + `listWeeks` (2) and totals 5; `get_exercise_history` is 3, bounded by `limit`
  through `listSessionsForExercise`, never a `getSession` per entry (review S4-REV found 7 and an
  unbounded scan). `src/testing/countingD1.ts` counts D1 executions in workerd tests (S5):
  `get_overview` = 5, `write_plan_week` 4 weeks x 6 = 36 executions including batch members
  (`src/index.workerd.test.ts`, `src/mcp/writeTools.test.ts`).
- Identity (S5): `McpAuth.resolve(request, ctx) → Option<McpPrincipal>` (`{ userId, scopes }`).
  `layerOAuth` decodes `ctx.props` with the shared `OAuthProps` (the provider sets it for a valid
  token), `layerDevToken` gives the seed user every scope (local only), `layerLive` tries OAuth then
  the dev token, `layerFixed` is for tests. `createServer({ principal, run })` passes
  `principal.userId` to tools by closure; `toolsFor(principal)` registers the write tools
  (`src/mcp/writeTools.ts`) only when `scopes` has `tanren:write`, so without it they are an
  unknown tool. Tools are `Tool`/`AnyTool` values with a `kind` (`eraseTool` erases the types).
  The SDK's `getMcpAuthContext()` is not used.
- Workerd test: `makeMcp(...).handle(req, env, createExecutionContext())` from `cloudflare:test`
  (`src/mcp/McpRoute.workerd.test.ts`). Bundle with MCP: 3785 KiB / 718 KiB gzip (Free limit 3 MiB gzip).
- Attach Claude Code without touching user config: `claude -p "…" --mcp-config <file>
  --strict-mcp-config --allowedTools mcp__tanren-local__get_overview` with
  `{"mcpServers":{"tanren-local":{"type":"http","url":"http://localhost:<port>/mcp",
  "headers":{"Authorization":"Bearer local-dev-only-mcp-token"}}}}`. Never `claude mcp add` in a task.

## OAuth provider + wrangler config layout (verified S5, 2026-10-21)

**Config layout** (`apps/worker/wrangler.jsonc`, JSONC with comments):
- Top level = local: `vars` (`ENVIRONMENT: "local"`, `BETTER_AUTH_URL`, `MCP_RESOURCE_URL:
  "http://localhost:8787/mcp"`, fake `BETTER_AUTH_SECRET` / `DEV_MCP_TOKEN`), D1 `DB`, and
  `kv_namespaces: [{ binding: "OAUTH_KV", id: "local-oauth-kv" }]`. A bare `wrangler dev` cannot reach Cloudflare.
- `env.production` (shape from `docs/design/deploy.md` §2): `routes` `api.tanren.me` and
  `mcp.tanren.me` (`custom_domain: true`), its own `vars` (`BETTER_AUTH_URL` `https://api.tanren.me`,
  `MCP_RESOURCE_URL` `https://mcp.tanren.me/mcp`), its own `d1_databases` and `kv_namespaces`
  whose ids are `<owner: …>` placeholders so a deploy fails loudly. **Named envs do not inherit
  `vars`**, hence the repeat; wrangler warns that `BETTER_AUTH_SECRET` / `DEV_MCP_TOKEN` are absent
  there: intended, they are secrets (`wrangler secret put … --env production`, owner only, never in the repo).
- `wrangler.test.jsonc` repeats the local vars + `OAUTH_KV` so a workerd test can boot `src/index.ts`.
  `wrangler.web.jsonc` is the static-assets Worker `tanren-web`, `env.production` route `tanren.me`.
- Custom domains and secrets are owner actions; agents never run `wrangler deploy|secret|login`.
- Bindings are typed in `src/Env.ts`: `OAUTH_KV`, `MCP_RESOURCE_URL`, `OAUTH_PROVIDER?` (the
  provider's `OAuthHelpers`, injected into `env` per request); `EnvVars = Omit<Env, "DB" | "OAUTH_KV" |
  "OAUTH_PROVIDER">`. `WorkerConfig.mcpResourceUrl` is absolute, has no fragment, and may be `http:` only
  when local; `WorkerConfig.fromEnvSync(env)` decodes at module scope (no I/O).

**The provider** is the second adapter next to the MCP handler: `src/index.ts` default-exports
`makeProvider(config, { app, mcp, authorize })` (`src/oauth/provider.ts`), a `new OAuthProvider<Env>`
from `@cloudflare/workers-oauth-provider@1.2.3` (named + default export; `OAuthHelpers`, `AuthRequest`,
`AuthorizationError`, `authorizationErrorRedirect` are named exports). No Durable Object; state lives in
`OAUTH_KV`. Biome's `noClass` override excludes only `src/mcp/**` and `src/index.ts`, so `src/oauth/**`
declares no class: `provider.ts` only calls `new OAuthProvider`.
- Its JS imports `cloudflare:workers`: never value-import it from a Node-tested module; use
  `import type`. Only `index.ts` and workerd tests load `provider.ts`; Node tests use the fake
  `OAuthApi` (`src/oauth/authorize.test.ts`).
- Combined mode: the issuer is the origin of the token endpoint, so full-URL endpoints built from
  `BETTER_AUTH_URL` put the authorization server on the API host (where the Better Auth cookie lives).
  `/.well-known/oauth-authorization-server` answers on any host with that issuer; token and register
  match only that hostname. `resourceMetadata.authorization_servers` defaults to the token-endpoint
  origin, so neither is set. `resourceMetadata.resource` is required (`http:` only on loopback).
- Wire facts: PKCE S256 mandatory, dynamic client registration for public clients. Consent helpers
  `describeConsent / beginConsent / approveConsent / denyConsent` (`d.ts:1233-1263`);
  `beginConsent`'s headers must be forwarded with the consent page. `/authorize` must catch
  `parseAuthRequest` failures.
- Routing in `serveWith`: `/mcp` → `mcp.handle`, `/authorize` and below → `authorize.handle`, the rest →
  `app.handler`. `apiRoute: "/mcp"`; `requiredScopes: ["tanren:read"]`; `resolveExternalToken`
  accepts `DEV_MCP_TOKEN` as the dev principal's props (local only), so the dev token keeps working.
- Better Auth from the authorize page: `auth.api.signInMagicLink` needs `headers`
  (`requireHeaders: true`), body `{ email, callbackURL }`. `/api/auth/get-session` without a cookie
  answers 200 `null`. The magic-link token is in D1 as `verification.identifier = "magic-link:<token>"`.
- Boot proof: `src/index.workerd.test.ts` drives the real default export (health, get-session, `/mcp`
  401 with `resource_metadata`, exercises round trip, sync push → pull incl. a LWW tie → `conflicts`).
  The full OAuth flow test is `src/oauth/oauth.workerd.test.ts`.
  `oauth.workerd.test.ts` (6 green, S5-T4b 2026-10-21): authorization-server metadata issuer =
  `BETTER_AUTH_URL`; no token → 401 with `resource_metadata`; register → authorize → approve → token
  (S256) → `tools/list` 7; a read-only grant → 4 tools and `update_profile` is not executed; the dev
  token → 7; `write_plan_week` on D1, then `get_current_plan` shows it.
- Dev token through the provider: `provider.ts` sets `resolveExternalToken` (audience =
  `mcpResourceUrl`, local only) mapping `Bearer <DEV_MCP_TOKEN>` to the dev principal. Without it the
  provider answers `invalid_token` before `/mcp` runs, so `layerLive`'s dev fallback matters only when
  `makeMcp` is called directly.
- Wrangler warns that CIMD (client ID metadata documents) is disabled without the compat flag
  `global_fetch_strictly_public`. Claude uses DCR, so off is fine; decide at deploy time.
- Local recipe and proven curl flow: `docs/design/local-dev.md` §5.

## Vendor plugin skills

Worker/db engineers load `cloudflare:workers-best-practices`, `cloudflare:wrangler`,
`cloudflare:durable-objects`, `cloudflare:agents-sdk` for generic platform
knowledge; this skill keeps only Tanren deltas. The Cloudflare API MCP is under
`permissions.ask` and is never used to change cloud state.
