# Team mcp — step 4 sheet
Charter: `docs/tasks/step-4.md` · Team-lead: opus · Start 23:16 · Box 75 min (→ 00:31) · Updated 23:43

## Assumes (cross-team) — copied from the charter
- hardening (done 23:20): `Cloudflare.Env` merge lives in `apps/worker/src/cloudflareEnv.d.ts` (NOT `env.d.ts`); no `namespace` in `src/index.ts`; `tsconfig.test.json` covers `src/testing/**` + `*.workerd.test.ts`; seed always has a planned session on its end date; mcp never calls `Sessions`.
- plan-web: owns `wrangler.jsonc` vars, `wrangler.web.jsonc`, `src/auth/EmailSender*`, `ResendEmailSender.ts`, `src/{Env,Config,Config.test}.ts`; never edits `src/index.ts`; ports 8787/8790 (mcp: 8791–8793); owns the shared local D1 (no `pnpm db:reset` by mcp).
- Lead/owner: `DEV_MCP_TOKEN` stays a committed local-only var; `mcp.tanren.me`, `allowedHostnames`, OAuth, Claude app connector = step 5. Lead granted team mcp `docs/design/mcp.md` §3 for the `Label` fix (23:3x).

## Tasks
| id | model | group | status |
| --- | --- | --- | --- |
| S4-SPIKE | spike/opus | A | done |
| S4-T2 | engineer/sonnet | A | done |
| S4-T1 | engineer/sonnet | B (after hardening) | done |
| S4-T3 | engineer/opus | B | done (fix r1 done) |
| S4-T4 | engineer/opus | C | done (fix r1 done) |
| S4-REV | reviewer/opus | D | approve (2 should, 2 nit → routed) |
| S4-QA | qa/sonnet | D (parallel with REV) | criteria PASS; FAIL only on foreign db test (SyncStore) |

## Frozen ports
- `SessionRepo.listSetsInRange`, `listSetsForExercise` — FROZEN 23:19 (S4-T2 compiled; consumed by T3).
- `packages/shared/src/mcp.ts` §3 names with `name: Label` — FROZEN 23:28.
- `AnyReadTool.call`, `readTools`, `McpAuth.{layerDevToken,layerFixed}` — FROZEN 23:31 (consumed by T4).

## Log
- 23:17→23:20 · S4-SPIKE · spike/opus · a48699daf4b3a3a40 · 93k · 30 · 1 · works; no zod; inputSchema needs `toStandardJSONSchemaV1(toStandardSchemaV1(..))`; `allowBuilds: core-js-pure: false` needed
- 23:17→23:19 · S4-T2 · engineer/sonnet · a0ab0a7f7487c8f9f · 92k · 16 · 1 · done; db 73 green; edited memory `Repositories.ts` (outside charter, required)
- 23:23→23:26 · S4-T1 · engineer/sonnet · a71e0062c7d41b5bb · 110k · 44 · 1 · done; shared 154, worker 48 green; smoke 8791 /health 200, /mcp 501
- 23:23→23:31 · S4-T3 · engineer/opus · a8e20afbbd42dd4c3 · 142k · 38 · 1 · done; 24 tests; worker 81 green
- 23:32→23:37 · S4-T4 · engineer/opus · a44291323fb02e19c · 137k · 44 · 1 · done; worker 104 green, root `pnpm check` 453 green; Claude Code headless get_overview 7d → 5 sessions
- 23:38→23:40 · S4-REV · reviewer/opus · abdcfcca8cce51544 · 110k · 18 · 1 · APPROVE; should: overview 7 statements (D4 ≤ 5), CLAUDE.md stale; nit: history unbounded scan, defects leak
- 23:38→23:41 · S4-QA · qa/sonnet · a6515e3c40cd3d90f · 93k · 18 · 1 · +11 tests (worker 115); db red on hardening's SyncStore test only
- 23:41→23:45 · S4-T3 fix r1 (overview ≤ 5, `listSessionsForExercise`) · a8e20afbbd42dd4c3 · 180k · 26 · 2 · done; overview 5 statements, history 3 bounded
- 23:41→23:43 · S4-T4 fix r1 (defect → "internal error") · a44291323fb02e19c · 151k · 10 · 2 · done
- 23:45 · team-lead gate: shared 155 · db 97 · worker 117, all green · team DONE (27+2 min)
- 23:41 · team-lead wrote `apps/worker/CLAUDE.md` §MCP + Status (should #2), fixed `docs/design/mcp.md` §3 Label + §4 handler text

## Escalations
- `apps/worker/src/repos/Repositories.ts` (charter: read-only, no other team owns it) edited by S4-T2 (+ T3 fix r1): the memory `SessionRepo` must implement the grown port. Ratify.
- `pnpm-workspace.yaml` `allowBuilds: core-js-pure: false` (root config beyond catalog lines): required, or `pnpm install` fails `ERR_PNPM_IGNORED_BUILDS` (agents → mimetext → @babel/runtime-corejs3). Ratify.
- QA saw `packages/db/src/sync/SyncStore.test.ts > is atomic…` red at ~23:40 (reviewer saw db green at 23:39): not an mcp file; Lead to confirm owner.
- Root `CLAUDE.md` hard rules still say "McpAgent adapter" → Lead's file.

## Integration checklist
- [ ] `apps/worker/src/index.ts` · `/mcp` exact-path dispatch already wired (team mcp owns it) · verify `pnpm -F @tanren/worker exec wrangler dev --port 8787` + `curl -i -X POST localhost:8787/mcp` → 401 `WWW-Authenticate: Bearer`.
- [ ] INT-4/7 proof · Claude Code attach without `claude mcp add`: `<claude> -p "call list_sessions for today with includeSets true" --mcp-config mcp.json --strict-mcp-config --allowedTools mcp__tanren-local__list_sessions` (config shape in `apps/worker/CLAUDE.md` §MCP) after logging a set in the web app · verify the set appears.
- [ ] Root `CLAUDE.md` + `docs/plan.md`-adjacent wording "McpAgent adapter" → "MCP adapter (`createMcpHandler`, ADR-0010)" · Lead.
- [ ] ADR-0010 cites: `inputSchema` encoded-side decision, non-object result as text only, no DO · Lead.
- [ ] Workerd test that boots `src/index.ts` (needs `ENVIRONMENT` etc. in the workerd test env) covering `/mcp` 401 + `/health` · INT-B.
