# ADR-0010: MCP server as a stateless `createMcpHandler` route, not an `McpAgent` Durable Object

Date: 2026-10-20 · Status: **accepted** (Lead decision under owner delegation, 2026-10-20; plan Amendment 3) · Step 4 · Author: architect (recording the step-4 architect's design, `docs/design/mcp.md` §1–2)

## Context

`docs/plan.md` names "Cloudflare Agents SDK (`McpAgent`) + `workers-oauth-provider`" for the MCP
server. `McpAgent` is a Durable Object: it needs a DO binding, a `migrations` block and a class
export in `wrangler.jsonc`, and keeps per-session state. **Verified 2026-10-20 against the
Cloudflare docs** (Agents SDK v0.20.0 changelog, 2026-07-27; `agents/model-context-protocol/apis/agent-api`
updated 2026-07-27; `…/apis/handler-api` updated 2026-10-18): `McpAgent` "is deprecated and
feature-frozen", "no removal version is announced", and new servers should use `createMcpHandler`
from `agents/mcp/server` with an MCP SDK v2 server factory (`@modelcontextprotocol/server`); the
v1 `@modelcontextprotocol/sdk` is only for the legacy path. The remote-MCP guide says: "Do not use
that path for a new server." Installed: `agents@0.28.1` exports `./mcp/server` and peers
`@modelcontextprotocol/server@2.3.1` (`docs/design/mcp.md` §1 [V]). Tanren's tools are
request/response reads and writes against D1; nothing needs MCP session state, pushed
server-to-client requests or replay.

## Decision

Deviation from the plan, recorded explicitly: the MCP server is a **stateless
`createMcpHandler` route** in the existing `apps/worker`, not an `McpAgent` Durable Object.

- `src/index.ts` dispatches `/mcp` by exact path before `app.handler`;
  `createMcpHandler(createServer, options)(request, env, ctx)` builds one `McpServer` per request.
- No DO binding, no `migrations`, no class export in `wrangler.jsonc`; the free-tier footprint is
  one Worker plus D1, as before.
- Auth seam for step 5: the `McpAuth` port (`Context.Service`, `resolve(request) →
  Effect<Option<UserId>>`) with `layerDevToken` now and `layerOAuth` later reading `ctx.props` set
  by `@cloudflare/workers-oauth-provider` (still planned, unchanged). The adapter takes `ctx` and
  passes it through so step 5 adds a layer, not a rewrite.
- Rule change that follows: CLAUDE.md's "one allowed adapter class / non-Effect code" exception
  now applies to the MCP handler adapter module (`apps/worker/src/mcp/server.ts` and
  `McpRoute.ts`: the `McpServer` instance and the `createMcpHandler` call) instead of an
  `McpAgent` subclass. The `noClass` override for `apps/worker/src/mcp/**` (ADR-0002) stays; it
  is no longer needed for a subclass but is harmless.

## Consequences

- Fewer moving parts: no DO, no session store, every request independent; tests run the handler
  directly in workerd (`McpRoute.workerd.test.ts`).
- The plan's "Cloudflare Agents SDK" is still the library; only the deprecated class is avoided.
- Writes in step 5 are plain tool calls; nothing stateful was lost because nothing stateful was
  planned.
- `allowedHostnames: ["mcp.tanren.me"]` must be set for production (default allowlist is
  localhost/workers.dev), an owner-set var at step 5/7.
- `VERIFY:` (S4-SPIKE) whether `registerTool`'s `inputSchema` accepts an Effect Schema through
  `Schema.toStandardSchemaV1` or needs `zod`; the decision here does not depend on the answer.

## Alternatives considered

- **`McpAgent` + Durable Object (the plan's words).** Deprecated and feature-frozen upstream, tied
  to the v1 SDK, needs a DO binding and migrations, and buys session state we do not use.
  Rejected.
- **A separate MCP Worker** (`mcp.tanren.me` as its own script). Clean host split, but a second
  deploy, a second D1 binding to the same database, duplicated config and auth wiring; the route
  can still be served on `mcp.tanren.me` from the one Worker via routes. Rejected for now;
  revisit only if the Worker's bundle or CPU budget forces a split.
- **`createLegacyMcpHandler` (sessionful bridge).** Only for migrating existing sessionful servers;
  scheduled for removal in the next major. Rejected.

Not decided here: whether `createMcpHandler`'s `authContext` option replaces the closure for
passing `userId` (step 5 may switch); production host/routes layout (step 7).
