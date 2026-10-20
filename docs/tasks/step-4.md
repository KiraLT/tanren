# Step 4 — team mcp: MCP server, read tools, attach from Claude Code
Source: docs/plan.md step 4 · Status: planning · Updated: 2026-10-20 · Baseline commit: c6a4d68 (`git diff c6a4d68` shows the step)
Design: `docs/design/mcp.md` (normative: contract, modules, wire examples) · Runs in parallel with `docs/tasks/step-7.md` (team plan-web) after `docs/tasks/hardening-1/team-hardening.md` finishes.

## Team charter: mcp
Mission: Claude Code attaches to `http://localhost:8787/mcp` against `wrangler dev` and reads the seed user's training history through four tools (`get_overview`, `get_exercise_history`, `list_sessions`, `get_current_plan`), each an Effect program over the `@tanren/db` repositories scoped to the caller's `userId`. Stateless `createMcpHandler`, no Durable Object, dev bearer token as the step-4 identity; the step-5 OAuth seam (`McpAuth` port, `ctx` passed through) is left open, not built.
Owned paths (exclusive): `apps/worker/src/mcp/**`, `apps/worker/src/index.ts`, `apps/worker/src/auth/devUser.ts` (new), `packages/shared/src/mcp.ts` + `mcp.test.ts` + the barrel line in `packages/shared/src/index.ts`, `packages/db/src/repositories/Session.ts` + `Session.test.ts`, `apps/worker/package.json` + `packages/shared/package.json` dependency lines, catalog entries for own deps in `pnpm-workspace.yaml`, lockfile (foundation task only), `apps/worker/CLAUDE.md` §mcp, `.claude/skills/cloudflare-workers/SKILL.md` McpAgent→createMcpHandler paragraph.
Read-only: `apps/worker/src/{app,Config,Env}.ts`, `src/api/**`, `src/auth/**` (except `devUser.ts`), `src/repos/**`, `src/sync/**`, `wrangler.jsonc` (no change needed: no DO binding), `packages/db/**` (except `repositories/Session.*`), `docs/design/{mcp,db,data-model,local-dev}.md`.
Contracts (frozen): `docs/design/mcp.md` §3 schemas (names, fields, defaults), §4 module names and signatures (`ReadTool`, `readTools`, `McpAuth`, `makeMcp`, `createServer`), §2 auth rule (local + `DEV_MCP_TOKEN` → `DEV_USER_ID`, else 401 `WWW-Authenticate: Bearer`), §1 route `/mcp` dispatched in `index.ts` before `app.handler`.
Provides: `/mcp` endpoint (streamable HTTP, JSON-RPC `initialize`/`tools/list`/`tools/call`); `SessionRepo.listSetsInRange`, `SessionRepo.listSetsForExercise` in `@tanren/db`; shared `mcp.ts` schemas (step 5 registers the write tools against them).
Runtime proof (required in S4-T4 and once before the team report): `pnpm db:reset` → `pnpm -F @tanren/worker exec wrangler dev --port <spare> &` → `curl -i -X POST localhost:<spare>/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"initialize",...}'` → 200 without token expect 401 → `claude mcp add --transport http tanren-local http://localhost:<spare>/mcp --header "Authorization: Bearer local-dev-only-mcp-token"` → in a Claude Code session call `get_overview` with `period: "7d"` and paste the JSON result (sessions > 0 on the seed) into the report → `claude mcp remove tanren-local` → kill only your wrangler PID. If `claude` is not on PATH, the report says so and shows the same `tools/call` via curl.
Assumes (cross-team):
- hardening (finished before this team starts): `apps/worker/src/env.d.ts` holds the `Cloudflare.Env` declare-merge (no `namespace` in `src/index.ts`; keep it that way when editing `index.ts`); `apps/worker/tsconfig.test.json` covers `src/testing/**` and `*.workerd.test.ts`; `pnpm db:reset` always leaves a planned session on the seed end date; `Sessions.current` may carry a 503 error channel — mcp never calls `Sessions`.
- plan-web: edits `wrangler.jsonc` (`ALLOWED_ORIGINS` + new `EMAIL_FROM` vars only), adds `wrangler.web.jsonc`, and (S7-P5, Resend email per ADR-0008) edits `src/auth/EmailSender*.ts`, `src/auth/ResendEmailSender.ts`, `src/{Env,Config,Config.test}.ts`; mcp touches none of these. mcp reads `WorkerConfig.devMcpToken`/`environment` only (both exist today; plan-web adds fields, removes none). plan-web never edits `src/index.ts`. Both teams run `wrangler dev` on their own spare ports (mcp: 8791–8793; plan-web: 8787 for the API + 8790 for web).
- Lead/owner: `DEV_MCP_TOKEN` stays a committed local-only var (local-dev.md §2, guard in `Config.ts`); `mcp.tanren.me` routing, `allowedHostnames`, OAuth and the Claude app connector are step 5.
Docs: `apps/worker/CLAUDE.md` (team-lead writes the mcp section + Status) · `cloudflare-workers` skill (engineer of S4-T3 replaces the McpAgent wording with the verified `createMcpHandler` facts) · `docs/design/mcp.md` corrections go through the team-lead with a one-line Log entry.
Budget: max 2 engineers in parallel · max 2 review rounds · target ≤ 75 min wall-clock.
Forbidden: root config changes beyond the catalog lines named above; Durable Object bindings; `wrangler deploy`/`--remote`/`--env`; killing processes you did not start; `zod` unless S4-SPIKE proves the Effect-Schema path impossible.
Report: team report format from `.claude/agents/team-lead.md`.

## Decisions
- D1 `createMcpHandler` (stateless, `agents` 0.28.1 + `@modelcontextprotocol/server` 2.3.1) instead of the deprecated `McpAgent`; no Durable Object — accepted (Lead delegation); plan deviation to be recorded as ADR-0010 once 0007–0009 land. Facts: `docs/design/mcp.md` §1, research 2026-10-19 §0.3.
- D2 Step-4 identity = `Authorization: Bearer <DEV_MCP_TOKEN>` in `ENVIRONMENT=local` only, mapped to the seed user `DEV_USER_ID`; anything else 401. No cookies, no `Sessions` dependency; step 5 swaps `McpAuth.layerDevToken` for an OAuth layer — accepted (Lead delegation).
- D3 Tool inputs/outputs are Effect Schemas in `packages/shared/src/mcp.ts`, write-tool inputs typed now and registered in step 5 — accepted (Lead delegation).
- D4 Two new `SessionRepo` queries (`listSetsInRange`, `listSetsForExercise`) so an overview is ≤ 5 D1 statements (Free: 50 queries per invocation) — accepted (Lead delegation).
- D5 `index.ts` dispatches `/mcp` by exact path before `app.handler`; the MCP adapter builds one `ManagedRuntime` per isolate and one `McpServer` per request — accepted (Lead delegation).

## Tasks
| id | title | role / model | depends on | files | status |
| --- | --- | --- | --- | --- | --- |
| S4-SPIKE | `createMcpHandler` in this repo: bundle + workerd + Effect Schema as `inputSchema` | spike / opus (≤ 10 min, scratch project outside the repo or a throwaway branch of `apps/worker`) | — | none committed; findings → Log + `docs/design/mcp.md` §4 VERIFY lines | todo |
| S4-T1 | Foundation: deps, shared `mcp.ts` schemas + tests, `devUser.ts`, `index.ts` dispatch stub (`/mcp` → 501) | engineer / sonnet | — (SPIKE result only decides zod yes/no; start without it) | `pnpm-workspace.yaml` catalog, `apps/worker/package.json`, lockfile, `packages/shared/src/{mcp,mcp.test,index}.ts`, `apps/worker/src/auth/devUser.ts`, `apps/worker/src/index.ts` | todo |
| S4-T2 | `@tanren/db`: `SessionRepo.listSetsInRange` + `listSetsForExercise` + workerd tests | engineer / sonnet | — | `packages/db/src/repositories/Session.ts`, `Session.test.ts` | todo |
| S4-T3 | `tools.ts` (four read tools, Node tests on memory layers) + `McpAuth.ts` (dev token layer + fixed layer, tests) | engineer / opus | T1, T2 (T2 for `listSetsInRange`; stub against the port shape meanwhile) | `apps/worker/src/mcp/{tools,tools.test,McpAuth,McpAuth.test}.ts` | todo |
| S4-T4 | `server.ts` + `McpRoute.ts` adapters, `index.ts` wiring, workerd test (`initialize` → `tools/call get_overview` → JSON), runtime proof with Claude Code | engineer / opus | T1, T3, SPIKE | `apps/worker/src/mcp/{server,McpRoute,McpRoute.workerd.test}.ts`, `apps/worker/src/index.ts`, `apps/worker/CLAUDE.md`, skill paragraph | todo |
| S4-REV | Review (runs `pnpm -F @tanren/worker check`, `pnpm -F @tanren/shared check`, `pnpm -F @tanren/db check`) | reviewer / opus | T3, T4 | owned paths | todo |
| S4-QA | QA only if diff > 800 lines | qa / sonnet | REV | *.test.ts | todo |

Parallel groups: A = {SPIKE, T1, T2} · B = {T3} (T4 may start its adapter skeleton alongside T3 once T1 is in) · C = {T4 finish} · D = {REV, fixes}.

## Done-criteria
### S4-SPIKE
- [ ] Answers, each with the command run: (a) `agents@0.28.1` + `@modelcontextprotocol/server@2.3.1` install under pnpm 12 with the catalog (no `minimumReleaseAge` refusal; if 0.28.1 lacks something, name the exclude line); (b) `createMcpHandler(() => server)(request, env, ctx)` answers `initialize` + `tools/call` under `wrangler dev` with `compatibility_date 2026-10-19` + `nodejs_compat`, and inside `@cloudflare/vitest-plugin` 1.4.6; (c) `registerTool`'s `inputSchema` accepts `Schema.toStandardSchemaV1(effectSchema)` or a `Schema.toJsonSchemaDocument(...)` object (which one; the `.d.ts` line); (d) the exact `McpServer` import path and `registerTool` handler signature (second argument shape).
- [ ] If (b) fails: the failing error verbatim and the smallest config change that fixes it, or "blocked" so the Lead can decide.
### S4-T1 Foundation
- [ ] `packages/shared/src/mcp.ts` matches `docs/design/mcp.md` §3 (all seven names in `MCP_TOOLS`); `mcp.test.ts` round-trips one encoded example per read output (the §5 overview sample decodes) and rejects an invalid `period`.
- [ ] `agents` 0.28.1 and `@modelcontextprotocol/server` 2.3.1 in the catalog and `apps/worker/package.json`; `pnpm install` clean; `pnpm -F @tanren/worker exec wrangler deploy --dry-run` still bundles (size in the report).
- [ ] `apps/worker/src/auth/devUser.ts` exports `DEV_USER_EMAIL`, `DEV_USER_ID`; `BetterAuth.ts` imports them from there (two-line change, the only edit outside owned paths, announced in the report).
- [ ] `src/index.ts`: `/mcp` → `501 Not Implemented` stub, no `namespace` block (hardening moved it to `env.d.ts`); `pnpm -F @tanren/shared check` and `pnpm -F @tanren/worker check` green, output pasted.
### S4-T2 SessionRepo queries
- [ ] `listSetsInRange(userId, { from, to })`: live sets (`deleted_at IS NULL`) joined to live sessions with `from <= started_at < to`, ordered `(started_at, session id, order, created_at, id)`, one statement, `user_id` on both tables.
- [ ] `listSetsForExercise(userId, exerciseId, limit)`: live sets of that exercise from the newest `limit` live sessions containing it, newest session first; one or two statements.
- [ ] Workerd tests: foreign user sees nothing; range is half-open; tombstoned set excluded; `limit` honoured. `pnpm -F @tanren/db check` green, pasted.
### S4-T3 tools + McpAuth
- [ ] `readTools` has exactly the four read tools with the §3 schemas; `get_overview` defaults to `30d`, computes `range` from `DateTime.now`, `volumeKg` = Σ weightKg·reps over live sets, `best` = max weight then reps, `exercises` sorted by volume desc then name, `currentPlan` from `PlanRepo.currentPlan`.
- [ ] `get_exercise_history` → `NotFound` for an unknown id; `list_sessions` with `includeSets: false` returns `sets: []`; `get_current_plan` returns `null` when no active plan.
- [ ] `McpAuth.layerDevToken`: matching token in `local` → `Some(DEV_USER_ID)`; wrong token, missing header, or `environment !== "local"` → `None`; `McpAuth.layerFixed(Option<UserId>)` for tests.
- [ ] Node tests with `Repositories.layerMemory` + `TestClock` for every rule above (≥ 10 tests); `pnpm -F @tanren/worker check` green, pasted.
### S4-T4 adapters + wiring + proof
- [ ] `server.ts` registers every `readTool` with `annotations: { readOnlyHint: true }`, returns `structuredContent` + text JSON, maps errors per §4 (no `throw`, no `any`, no `as` without comment; the `McpServer` instance and `createMcpHandler` call are the only non-Effect code).
- [ ] `McpRoute.ts` `makeMcp(env, { persistence, auth })`: 401 + `WWW-Authenticate: Bearer` without identity; `index.ts` routes `/mcp` to it with `d1Persistence(env.DB)` + `McpAuth.layerDevToken`, everything else to `app.handler`.
- [ ] `McpRoute.workerd.test.ts` on migrated D1 (seeded rows written through `Repositories.layer` in the test): `initialize` 200; `tools/list` names the four tools; `tools/call get_overview` returns `structuredContent` that decodes with `Overview`; no token → 401.
- [ ] Runtime proof per the charter pasted (curl 401, curl/Claude `get_overview` JSON with `sessions > 0`); `apps/worker/CLAUDE.md` mcp section + Status updated; skill paragraph replaced. `pnpm -F @tanren/worker check` green, pasted.
### S4-REV
- [ ] `git diff c6a4d68 -- <owned paths>` reviewed against `docs/design/mcp.md`; package gates green; blocking findings routed within the team; no edits outside owned paths except the two `BetterAuth.ts` import lines.

## Integration (Lead, after both teams report)
- INT-4/7: root `pnpm check` green; `pnpm db:reset` → `wrangler dev` (API, :8787) + `wrangler dev -c wrangler.web.jsonc` (:8790) + Claude Code attached to `/mcp`: log a set in the web app, then `list_sessions` over today shows it. Cross-team `reviewer` on `git diff c6a4d68`; `qa` if the combined diff > 800 lines.

## Log
- 2026-10-20 · created from architect breakdown (docs/design/mcp.md written the same hour)
