---
name: cloudflare-workers
description: Cloudflare Workers, D1, Wrangler, Drizzle migrations, Better Auth and the Agents SDK (McpAgent) as used in apps/worker and packages/db. Load for build steps 2–5 and any Worker or D1 work.
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
{ interface Env {...} }` in a `.d.ts` (needs `// biome-ignore lint/style/noNamespace: …`).
Storage is isolated per test file. Details: `packages/db/CLAUDE.md` "Verified facts".

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
domains (`api.`, `mcp.`, apex), static assets for the web build, and the
McpAgent adapter boundary (the only `class` allowed outside Effect tags).

## Vendor plugin skills

Worker/db engineers load `cloudflare:workers-best-practices`, `cloudflare:wrangler`,
`cloudflare:durable-objects`, `cloudflare:agents-sdk` for generic platform
knowledge; this skill keeps only Tanren deltas. The Cloudflare API MCP is under
`permissions.ask` and is never used to change cloud state.
