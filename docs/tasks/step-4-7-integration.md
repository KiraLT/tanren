# INT-4/7 — integration of team mcp (step 4) and team plan-web (step 7)
Source: docs/tasks/step-4.md §Integration, hardening-1 §Integration checklist · Status: pre-written (dispatch when both teams report) · Updated: 2026-10-20 · Role: engineer / opus · Time box: 20 min · Model note: a second engineer runs INT-B in parallel

## Goal
One local full stack that the owner can test from a copy-paste recipe: seeded D1, API worker on :8787, exported web app served on :8790, sign-in screen → magic link in the wrangler terminal → Today and Plan against the server plan, and Claude Code attached to `/mcp` reading the same data. Root gate green, everything committed.

## Read first
- CLAUDE.md, `apps/worker/CLAUDE.md`, `apps/mobile/CLAUDE.md`, `packages/db/CLAUDE.md`
- skills: `cloudflare-workers`, `expo-mobile`, `ui-check` ("Full stack" recipe), `monorepo`
- `docs/tasks/step-4.md`, `docs/tasks/step-7.md` (team reports in their Logs), `docs/tasks/hardening-1/team-hardening.md` §Integration checklist, `docs/design/mcp.md`, `docs/design/local-dev.md`
- every path claim below is to be grep-verified by the engineer first; team reports may have moved files

## INT-A (engineer / opus) — full stack proof
In: root `package.json` (new `dev` script only), `apps/worker/wrangler.jsonc` `ALLOWED_ORIGINS` (must list `http://localhost:8081` and `http://localhost:8790`), `docs/design/local-dev.md` §"Owner recipe" (new section, copy-paste), fixes to files no team report left red, `apps/mobile/CLAUDE.md` / `apps/worker/CLAUDE.md` Status lines.
Out: new features; anything a team report lists as "escalation" (route those to the Lead in the report).
- [ ] Root `pnpm check` green after both team merges (paste tail). If red, fix only build/type/lint drift between the two teams' files; a semantic conflict goes back to the Lead in ≤ 3 lines.
- [ ] `pnpm dev` (root) starts the API worker on :8787 and the web app on :8790 together (concurrently via `pnpm -r --parallel` or two `wrangler dev` invocations; no new dependency unless `catalog:`-pinned and justified) and prints both URLs; `Ctrl-C` stops both.
- [ ] Recipe proven in order and pasted: `pnpm db:reset` → `pnpm web:export` → `pnpm dev` → open `http://localhost:8790` → sign-in screen → `dev@tanren.local` → magic link printed in the terminal → open it → Today shows the server plan with today's session → log one set → Plan tab shows the week (two columns at ≥ 900 px) → `/sync/pull` from the page returns the set. Use the `ui-check` skill for the browser steps; paste the accessibility snapshots that prove each state.
- [ ] `claude mcp add --transport http tanren-local http://localhost:8787/mcp --header "Authorization: Bearer <DEV_MCP_TOKEN from wrangler.jsonc>"` then `get_overview` and `list_sessions` return the seeded data including the set just logged (paste the tool output). If `claude` is not on PATH, prove the same with a `curl` JSON-RPC `initialize` + `tools/call` pair and say so.
- [ ] `docs/design/local-dev.md` gains an "Owner recipe" section with exactly the commands that worked (no placeholders except the token name).

## INT-B (engineer / opus, in parallel; disjoint files) — hardening leftovers that needed both teams
In: `apps/mobile/src/services/SyncEngine.ts` + test (how a push whose response accepts some changes and rejects one for the same `(table,id)` is applied locally: the rejected row must not be retried forever and must be reconciled on the next pull), `apps/worker/src/index.workerd.test.ts` (new) booting the real `index.ts` entry in workerd with D1: `/health` 200, `/api/auth/get-session` 401 without a cookie, `/mcp` 401 without a bearer, one authenticated D1 round trip (`POST /exercises` → `GET /exercises`).
Out: everything in INT-A; `src/mcp/**` internals; UI files.
- [ ] Tests pass in the worker workerd project and the mobile project; `pnpm -F @tanren/worker check` and `pnpm -F @tanren/mobile check` tails pasted.

## Then (Lead)
- Cross-team `reviewer` (opus) on `git diff a65e5e6` scoped to the two teams' owned paths + INT-A/INT-B; `review-fanout` workflow instead if the diff > 800 lines. `qa` only if > 800 lines.
- Commit: "Steps 4 and 7: MCP read tools, Plan screen, web hosting, sign-in" then ping the owner with the recipe from `docs/design/local-dev.md`.
- EM Mode 1 on both team reports + INT-A/INT-B (event trigger); then `/retro` for steps 4 ∥ 7 against the "zero-lag tail" targets (from transcripts).

## Log
- 23:4x · pre-written by the Lead while teams mcp and plan-web build (speed tactic 5)
