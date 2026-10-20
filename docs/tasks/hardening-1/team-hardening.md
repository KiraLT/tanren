# Team hardening — worker + db backlog before steps 4 and 7
Source: review/integration backlog of steps 2, 3, 6 (docs/tasks/step-2.md Log) · Status: building · Updated: 2026-10-20 · Team-lead: opus · Time box: 35 min for the team

## Charter
- **Owned paths:** `apps/worker/src/sync/**`, `apps/worker/src/api/**`, `apps/worker/src/auth/**`,
  `apps/worker/src/testing/**`, `apps/worker/src/index.ts`, `apps/worker/src/env.d.ts` (new),
  `apps/worker/src/*.test.ts`, `apps/worker/src/*.workerd.test.ts`, `apps/worker/tsconfig*.json`,
  `apps/worker/package.json` (scripts only), `packages/db/src/sync/**`, `packages/db/src/seed/**`,
  `apps/worker/scripts/seed.ts`. Package docs: `apps/worker/CLAUDE.md`, `packages/db/CLAUDE.md`.
- **Not owned:** `apps/mobile/**`, `apps/worker/wrangler.jsonc`, `apps/worker/src/mcp/**`, `.claude/**`,
  root tooling. `packages/shared/src/sync.ts` only for an additive rejection-reason literal (note it).
- **Provides:** silent `wrangler dev` startup; push rejects duplicate `(table,id)` and foreign/missing
  parents; 503 on session-store failure; worker test types no longer leak into production types; the
  seed always covers the machine's local date.
- **Assumes (cross-team):** team mcp (step 4) starts after this team reports and will own
  `wrangler.jsonc`, `src/mcp/**` and additions to `src/index.ts`; team plan-web (step 7) owns `apps/mobile`.
  Nobody else edits the owned paths while this team runs.
- **Runtime proof:** `pnpm -F @tanren/worker exec wrangler dev --port <spare>` startup log contains no
  `[Better Auth]` error; `/health` 200; one `Authentication` route 401; `pnpm db:reset && pnpm smoke:worker`
  passes; root `pnpm check` green. Kill only your own PID.
- **Docs:** team-lead updates `apps/worker/CLAUDE.md` (Layout: `env.d.ts`, `tsconfig.test.json`; Status) and
  the seed sentence in `packages/db/CLAUDE.md`. Nobody commits; the Lead commits.

## Tasks (H1 ∥ H2 ∥ H3 ∥ H4 — disjoint files; then one reviewer; QA skipped, small diffs)
| id | title | role / model | depends on | files | status |
| --- | --- | --- | --- | --- | --- |
| H1 | worker test types out of prod: `tsconfig.test.json`, `env.d.ts`, fixture, workerd test nits | engineer / sonnet · 15 min | — | `apps/worker/tsconfig.json`, `tsconfig.test.json` (new), `package.json` typecheck, `src/index.ts`, `src/env.d.ts` (new), `src/testing/*`, `src/app.workerd.test.ts`, `src/app.test.ts` (fixture import only) | done |
| H2 | sync push: reject duplicate `(table,id)` in one batch and children whose parent is missing or another user's | engineer / opus · 20 min | — | `packages/db/src/sync/SyncStore.ts` + `.test.ts`; `packages/shared/src/sync.ts` only if a reason literal is missing | done |
| H3 | worker auth/api: silent Better Auth startup, 503 on session-store failure, HTTP tests for nested set routes | engineer / opus · 20 min | — | `apps/worker/src/auth/**`, `src/api/**`, `src/app.ts`, new `src/api/Sets.test.ts` (do not edit `app.test.ts`) | done |
| H4 | seed covers today | engineer / sonnet · 15 min | — | `packages/db/src/seed/**` (+ tests), `apps/worker/scripts/seed.ts` if a flag changes | done |
| H5 | review all four, route blocking findings back, root gate + runtime proof | reviewer / opus · 10 min | H1–H4 | read-only | done |

## Done-criteria
### H1
- [ ] `apps/worker/tsconfig.json` no longer includes `src/testing/**`, `src/**/*.workerd.test.ts` or the vitest configs; a new `tsconfig.test.json` includes them with `@cloudflare/vitest-plugin/types`; `typecheck` runs three `tsc -p` (main, scripts, test). Proof: `pnpm -F @tanren/worker typecheck` output.
- [ ] `grep -rn 'TEST_MIGRATIONS' apps/worker/src --include='*.ts' | grep -v testing | grep -v workerd.test` is empty (production code cannot see the test binding).
- [ ] The `declare global { namespace Cloudflare … }` merge moves from `src/index.ts` to `src/env.d.ts`; `grep -rn biome-ignore apps/worker/src` is empty.
- [ ] `src/app.workerd.test.ts`: dispose registered with `onTestFinished` (or try/finally); test renamed to what it proves ("builds the app with D1 persistence and serves /health"); `EnvVars` fixture shared from `src/testing/fixtures.ts` and imported by `app.test.ts` and the workerd test.
- [ ] `pnpm -F @tanren/worker check` green, output pasted.
### H2
- [ ] In one push batch, the second change with the same `(table, id)` is rejected with a reason and the first is applied; test.
- [ ] A child row (`set` → `session`; `planWeek` → `plan`; `plannedSession` → `planWeek`; `plannedSet` → `plannedSession`) whose parent does not exist, or belongs to another `userId`, is rejected with a reason; the rest of the batch still applies; tests for both cases.
- [ ] Rejection reasons are literals of the existing `PushResponse` rejection schema in `packages/shared` (add one additive literal only if none fits, and say so). `pnpm -F @tanren/db check` green, output pasted; `pnpm -F @tanren/worker test` still green.
### H3
- [ ] Root cause of `ERROR [Better Auth]: Could not validate the database schema` (1970 timestamp) at `wrangler dev` startup found and named in the report (hypothesis: the auth instance or its schema check runs outside a request, where D1 is unavailable); after the fix the startup log is clean and the magic-link flow still works (`pnpm smoke:worker` passes). Paste the startup log tail.
- [ ] A failing session store (`Sessions` port error) yields HTTP 503 with a `Schema.TaggedError` body, never 500; Node test with a failing `Sessions` layer.
- [ ] HTTP tests for the nested set routes under `/sessions/:id/sets` (create, list, patch/delete as implemented) in `src/api/Sets.test.ts`: 200 paths, 401 without session, 404 for a foreign session id.
- [ ] `pnpm -F @tanren/worker check` green, output pasted.
### H4
- [ ] After `pnpm db:reset` (and `pnpm db:seed --end <any date>`), the seeded current plan week has a `plannedSession` on the end date's weekday, so Today has something to log against on the day the seed is run; deterministic for a given `--seed`/`--end`; existing counts in tests updated with the reasoning (today the plan trained Mon/Wed/Fri/Sat only; the 2026-10-20 e2e needed a TZ trick).
- [ ] `pnpm -F @tanren/db check` green, output pasted; `pnpm db:reset` output pasted (session/set counts).
### H5
- [ ] Reviewer verdict per task with file:line findings; blocking ones fixed by the same engineer; root `pnpm check` green pasted; runtime proof pasted.

## Log
- 23:08 · charter written by the Lead from the step-2 backlog + TOOL-1 review + INT-2b findings; team-lead dispatched
- 23:09 · team sheet: team-lead (opus) read charter; Assumes copied: team mcp starts after this report and owns wrangler.jsonc, src/mcp/**, src/index.ts additions; team plan-web owns apps/mobile; nobody else edits owned paths
- 23:10→23:12 · H1 · engineer/sonnet · ad324d9f40a9bdb4e · 79k · 16 · 1 · done: tsconfig.test.json, 3× tsc, `src/cloudflareEnv.d.ts` (NOT env.d.ts: macOS case-insensitive collision with Env.ts, tsc drops it), shared envVars fixture, smoke :8812 200/401
- 23:10→23:13 · H2 · engineer/opus · ad2e8b447489c97f2 · 97k · 16 · 1 · done: duplicate (table,id) → invariantViolated (request order); missing/foreign parents were already missingParent; db 70 tests
- 23:10→23:14 · H4 · engineer/sonnet · a44e8b84fca119021 · 106k · 34 · 1 · done: end weekday always has an unlogged plannedSession (shift nearest); fixed Monday-end 6th-week bug; seed --end local date; db:reset 16 sessions / 276 sets
- 23:10→23:15 · H3 · engineer/opus · aa6875948a034284a · 121k · 35 · 1 · done: root cause = toWebHandler builds layers at module scope → betterAuth() schema check outside request; lazy Effect.cached auth; SessionStoreUnavailable 503; Sets.test.ts + Authentication.test.ts; smoke :8811 passed, startup log clean
- 23:15→23:17 · H5 review · reviewer/opus · a9b663d635b01b064 · 92k · 12 · APPROVE all four; 0 blocking, 3 should (planWeek→plan test, SessionsLive adapter test, docs drift), 3 nit
- 23:18 · fix round 1 (shoulds + 2 nits) → H2 (planWeek test, splitDuplicates single pass) ∥ H3 (SessionsLive test, envVars fixture); docs drift fixed by team-lead (worker + db CLAUDE.md)
- 23:18→23:19 · fix round 1 · H2 (+planWeek→plan foreign/missing in existing test, splitDuplicates O(n); db 73 tests) ∥ H3 (SessionsLive.test.ts with `as unknown as Auth` + comment, envVars fixture; worker 48 tests) · done
- 23:19 · team-lead runtime proof :8820: startup log 0 `[Better Auth]`/1970 lines, /health 200, /exercises 401, db:reset 16/276, smoke passed; own PIDs killed (wrangler 3119 + workerd 3123), port free
- 23:19 · root `pnpm check` RED outside team: apps/mobile src/components/planFormat.ts (Option.getEquivalence, step-7 WIP); earlier transient red in packages/db/src/repositories/Session.ts + worker src/repos/Repositories.ts (not owned; another stream editing). Team package gates green.

## Integration checklist
- [ ] packages/shared · move `SessionStoreUnavailable` (apps/worker/src/auth/Sessions.ts, `// INTEGRATION`) into @tanren/shared so mobile decodes the 503 · `pnpm check`
- [ ] apps/worker/src/auth/authRoutes.ts · map rejected `auth.handler` on `/api/auth/*` to 503 (still 500) · Node test with rejecting handler
- [ ] apps/worker · workerd test that boots `src/index.ts` (module-scope I/O regression guard) + D1 round trip · `pnpm -F @tanren/worker test`
- [ ] apps/mobile · a push repeating an id now gets both `accepted` and `rejected` for that (table,id); check the outbox treats `accepted` as synced · mobile sync test
- [ ] packages/db · decide whether a tombstoned parent accepts new children (today: yes)
