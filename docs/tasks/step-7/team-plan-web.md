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
| S7-P1 PlanWeekRepo + usePlanWeek + runtime line | engineer/opus | A | in-progress | (see Log) |
| S7-P2 web hosting (wrangler.web.jsonc, _headers, ALLOWED_ORIGINS, scripts, smoke) | engineer/sonnet | A | in-progress | |
| S7-P3 Plan screen UI (fixture until P1 types land) | engineer/sonnet | A | in-progress | |
| S7-P4 two-column + runtime proof + docs | engineer/opus | B (after P2, P3) | todo (brief below) | |
| S7-P5 Resend EmailSender | engineer/opus | after Lead's "hardening done" | todo (brief below) | |
| S7-REV | reviewer/opus | after P3–P5 | todo | |

Parallel budget note: charter says max 2; the Lead's dispatch message overrides it to start P1 ∥ P2 ∥ P3 now (disjoint file sets). Logged as a Decision.

## Frozen ports
- `PlanWeekRepo` types (charter contract) — FROZEN once P1 reports them compiling (time below).

## Log
`HH:MM→HH:MM · task · role/model · agent id · tokens · tool uses · rounds · outcome`

## Integration checklist
- [ ] `apps/worker/wrangler.jsonc` · production `ALLOWED_ORIGINS=https://tanren.me`, `EMAIL_FROM`, `RESEND_API_KEY` secret · owner action 0/1 in charter
- [ ] `apps/mobile/src/services/runtime.ts` · `PlanWeekRepo.layer` merged into `AppLayer` (P1, announced) · `pnpm -F @tanren/mobile check`

## Escalations

## Pre-written briefs
(P4 and P5 below; dispatch = paste.)
