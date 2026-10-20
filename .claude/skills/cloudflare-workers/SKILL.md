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
closure. Layout: `src/mcp/server.ts` (`createServer({ userId, run })`, the only `McpServer`),
`src/mcp/McpRoute.ts` (`makeMcp(env, { persistence, auth })`: one lazy `ManagedRuntime` per
isolate; `McpAuth.resolve` → `401` + `WWW-Authenticate: Bearer`, empty body, before the SDK runs),
`src/index.ts` routes the exact path `/mcp` before `app.handler`. Facts:
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
  unbounded scan). No test counts statements yet; a counting D1 layer in the workerd tests is open.
- Identity: step 4 passes `userId` to tools by closure (`createServer({ userId, run })`). The SDK's
  `getMcpAuthContext()` (`agents/mcp/server`) exposes `ctx.props` to tool callbacks; the OAuth
  layer (step 5, `docs/design/oauth.md`) decides whether `McpAuth.layerOAuth` reads `ctx.props`
  directly or through it. Do not use it in step-4 code paths.
- Workerd test: `makeMcp(...).handle(req, env, createExecutionContext())` from `cloudflare:test`
  (`src/mcp/McpRoute.workerd.test.ts`). Bundle with MCP: 3785 KiB / 718 KiB gzip (Free limit 3 MiB gzip).
- Attach Claude Code without touching user config: `claude -p "…" --mcp-config <file>
  --strict-mcp-config --allowedTools mcp__tanren-local__get_overview` with
  `{"mcpServers":{"tanren-local":{"type":"http","url":"http://localhost:<port>/mcp",
  "headers":{"Authorization":"Bearer local-dev-only-mcp-token"}}}}`. Never `claude mcp add` in a task.

## Vendor plugin skills

Worker/db engineers load `cloudflare:workers-best-practices`, `cloudflare:wrangler`,
`cloudflare:durable-objects`, `cloudflare:agents-sdk` for generic platform
knowledge; this skill keeps only Tanren deltas. The Cloudflare API MCP is under
`permissions.ask` and is never used to change cloud state.
