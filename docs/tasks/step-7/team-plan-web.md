# Team sheet: plan-web (step 7)
Charter: `docs/tasks/step-7.md` · Team lead started 23:16 (2026-10-20) · Time box 75 min → 00:31
Owned paths: see charter. Read-only step-6 services: `src/services/{SqlDriver,LocalStore,StoreEvents,CurrentUser,SyncEngine,SyncTransport,MockSyncServer,apiBaseUrl,TodayRepo}*.ts`, `src/store/**`, `src/hooks/{useLogSet,useSync,useRestTimer}.ts`.
Sequencing: team hardening owns `apps/worker/src/**`, `apps/worker/package.json`, `apps/worker/tsconfig*.json`, `packages/db/src/{sync,seed}/**` until the Lead says it reported → P5 waits. Team mcp owns `apps/worker/src/{mcp/**,index.ts,auth/devUser.ts}`, `packages/shared/src/mcp.ts`, `packages/db/src/repositories/Session.ts`. Ports: plan-web 8787 (API) + 8790 (web) only; mcp 8791–8793.

## Assumes (cross-team) — copied from the charter
- hardening (must finish before P5 / before runtime proof relies on it): seed always has a planned session on the seed end date (else `pnpm db:seed --end <today>`); `apps/worker/src/env.d.ts` holds the `Cloudflare.Env` merge, `tsconfig.test.json` exists — plan-web touches neither. H3 edits `src/auth/**`: P5 rebases on its `EmailSender.ts`/`BetterAuth.ts`.
- mcp: owns `src/index.ts`, `src/mcp/**`, worker `package.json` deps + catalog; does not edit `wrangler.jsonc` or create `wrangler.web.jsonc`. plan-web runs `pnpm db:reset` at most once (start of the runtime proof) and logs it; mcp seeds through tests.
- step 6 (done): LocalStore schema (quoted camelCase, `_dirty`), `TodayRepo.localToday`, `StoreEvents`, `runtime.ts` (`PlanWeekRepo.layer` added to the app layer: one line, announced). `Weekday` = shared `Schema.Literals([...])`. **Charter says "weekStart is a Monday"; ADR-0007 (accepted) overrides: any weekday.**
- Lead/owner: domains, real `database_id`, production vars/secrets; no preview env.

## Tasks
| id | model | group | status | agent id |
| --- | --- | --- | --- | --- |
| S7-P1 PlanWeekRepo + usePlanWeek + runtime line | engineer/opus | A | done | (see Log) |
| S7-P2 web hosting (wrangler.web.jsonc, _headers, ALLOWED_ORIGINS, scripts, smoke) | engineer/sonnet | A | done | |
| S7-P3 Plan screen UI (fixture until P1 types land) | engineer/sonnet | A | done | |
| S7-P4 two-column + runtime proof + docs | engineer/opus | B (after P2, P3) | done | |
| S7-P5 Resend EmailSender | engineer/opus | after Lead's "hardening done" | done | |
| S7-P6 sign-in screen (Lead request 23:33) | engineer/sonnet | after P3 | done |
| S7-REV | reviewer/opus | after P3–P5 | done (APPROVE r2) |
| S7-QA | qa/sonnet | after REV | done (PASS) | |

Parallel budget note: charter says max 2; the Lead's dispatch message overrides it to start P1 ∥ P2 ∥ P3 now (disjoint file sets). Logged as a Decision.

## Frozen ports
- `PlanWeekRepo` types (charter contract) — FROZEN 23:19.

## Log
`HH:MM→HH:MM · task · role/model · agent id · tokens · tool uses · rounds · outcome`
(mirrored in docs/tasks/step-7.md Log)
- 23:17→23:20 · S7-P2 · engineer/sonnet · a1d39d31ac98b6d48 · 86k · 13 · 1 · done
- 23:17→23:21 · S7-P1 · engineer/opus · af2316d0ca14a0cbe · 114k · 24 · 1 · done; PlanWeekRepo types FROZEN 23:19
- 23:17→23:22 · S7-P3 · engineer/sonnet · a0d27f3e09a94bebe · 143k · 56 · 1 · done
- 23:24→23:31 · S7-P5 · engineer/opus · adc3b186ec3ba9f4a · 143k · 59 · 1 · done
- 23:24→23:33 · S7-P4 · engineer/opus · a04d4f71e411d5c7b · 152k · 66 · 1 · done + escalation (direct /plan StoreError)
- 23:33 S7-P6 added at Lead's request
- 23:34→23:40 · S7-P6 · engineer/sonnet · ad6fb7d10a16233ef · 139k · 55 · 1 · done
- 23:34→23:36 · S7-REV r1 · reviewer/opus · a37f9bac03b34e63b · 104k · 14 · REQUEST CHANGES
- 23:34→ · S7-P1 fix · af2316d0ca14a0cbe (in flight; leaves 8787/8790 up for the final proof)
- 23:34→23:43 · S7-P1 fix r1 · af2316d0ca14a0cbe · 168k total · 46 · 2 · done (root cause bfcache/OPFS; fix in runtime.ts PageSqlDriver)
- 23:41→23:43 · S7-P3 fix r1 · a0d27f3e09a94bebe · 7 tools · done · S7-P5 fix r1 · adc3b186ec3ba9f4a · 7 tools · done
- 23:43→ · S7-REV r2 · a37f9bac03b34e63b (P1 runtime.ts, P6, P3/P5 fixes)
- 23:41→23:46 · S7-P4 fix r1 + final proof · a04d4f71e411d5c7b · done (COEP → require-corp, SetList dedupe, proof on :8790 both widths + sign-in)
- 23:43→23:45 · S7-REV r2 · a37f9bac03b34e63b · APPROVE (3 should on P6, 4 nits)
- 23:45→23:47 · S7-P6 fix r2 · ad6fb7d10a16233ef · done (sendMagicLink tests, Match)
- 23:47→ · S7-REV r2 delta (P4 delta + P6 fixes) · a37f9bac03b34e63b
- 23:47→23:48 · S7-REV r2 delta · a37f9bac03b34e63b · APPROVE, no new findings (runtime.ts nits #4–#6 open)
- 23:49→23:51 · S7-QA · qa/sonnet · a0f804d1176ceffc7 · 91k · 14 · PASS (+12 tests; mobile 141, worker 120)
- 23:52 team report · wall-clock 36 min of 75
- 23:48 team lead stopped S7-P1's servers on 8787/8790

## Integration checklist
- [ ] `apps/worker/wrangler.jsonc` · production `ALLOWED_ORIGINS=https://tanren.me`, `EMAIL_FROM`, `RESEND_API_KEY` secret · owner action 0/1 in charter
- [ ] production `wrangler.jsonc` env block must set `EMAIL_FROM` explicitly (named envs do not inherit top-level `vars`) · `wrangler deploy --dry-run --env production` (owner)
- [ ] `apps/mobile/.expo/types/router.d.ts` is regenerated only by `expo start`; after adding a route (`/sign-in`) run it once or `tsc` fails on `Link href` · `pnpm -F @tanren/mobile typecheck`
- [ ] `apps/mobile/src/services/runtime.ts` · `PlanWeekRepo.layer` merged into `AppLayer` (P1, announced) · `pnpm -F @tanren/mobile check`

## Escalations
- S7-P5 edited `apps/worker/src/auth/auth.test.ts` + `src/testing/fixtures.ts` (outside the brief): the new required `EMAIL_FROM` reaches every `EnvVars` literal; the preview+provider test now fakes Resend 401. Team-lead ratified; Lead to confirm (hardening had reported, mcp may touch fixtures.ts).
- Foreign files inside our exclusive `apps/mobile/**`: `src/services/{SyncEngine,TodayRepo,apiBaseUrl}.edge.test.ts`, `src/store/migrations.edge.test.ts`, `src/testing/` (not plan-web; one turned mobile tsc red mid-step at 23:43). Lead: whose are they?
- Two live browser tabs cannot share the OPFS store (second tab fails after 10 s): product decision.
- P6 sign-in (resolved by the P1 runtime fix, same cause): one non-reproduced "Could not load today" right after first magic-link landing in a tab with the demo store (possible start-up race in step-6 read-only code).

## Briefs
P4/P5/P6 were dispatched directly (inputs existed at 23:23/23:33, pre-writing would have delayed them); texts are in the dispatch prompts.
