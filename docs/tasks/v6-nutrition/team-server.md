# Team charter: Nutrition server (db + MCP) (v6, ADR-0025)
Status: DONE 15:30 (GO 15:07, 23 min of 70) · prepared on HOLD 14:52 · team-lead opus · Lead sheet: `docs/tasks/v6-nutrition.md` (team "nutri-server") · Design: `docs/design/nutrition.md` §1–§3
Box 70 (from GO). Worker port **9031** (probed 14:48: `ps -ef | grep "port 903"` empty, `curl localhost:9031/health` exit 7 → free).
Briefs (pre-written, pasted at dispatch): scratchpad `briefs-nutri-server.md` (path in the first interim).

## Mission
Migration 0008, `FoodEntryRepo`, `GarminImportRepo.listDays`, the four MCP tools with the §3 descriptions verbatim,
`update_profile` description extension, memory ports, workerd test through `McpRoute`.

## Owned paths (Lead sheet)
`packages/db/src/schema/{nutrition.ts,index.ts,user.ts}`, `packages/db/migrations/0008_*` + `meta/`,
`packages/db/src/repositories/{FoodEntry,FoodEntry.test,GarminImport,index}.ts`, `apps/worker/src/mcp/{nutritionTools,
nutritionTools.test,nutritionTools.workerd.test,writeTools,server}.ts`, `apps/worker/src/repos/**` (memory ports),
`apps/worker/src/testing/workerdSetup.ts` ("0000 to 0008"), `apps/worker/CLAUDE.md` (tool list line, `shared with Lead`).

## Frozen contracts
Design §1–§3 as landed by N-F0 (exact names: pasted from the GO message here), `RejectReason "invariantViolated"`, `ToolDeps`.
- (GO) N-F0 exported names: _pending_

## Assumes (cited, re-read 14:50)
- `ProfileRepo` has `get`/`put` only (`packages/db/src/repositories/Profile.ts:15–45`; `put` = generic `makePut(sql, "profile", ProfileRow, ROW_KEYS.profile)`) → `update_profile` merge path unchanged (`writeTools.ts:376` spreads `...patch`, so `nutrition` from `ProfilePatch` flows through).
- `DailyHealth` fields per `garmin.md` §1 (`packages/shared/src/garmin.ts:66` `date: LocalDate`; `totalCalories`, `activeCalories`, `steps`, `updatedAt`).
- `server.ts:102` `ANNOTATIONS: { [N in McpToolName]: ToolAnnotations }` is exhaustive; N-F0 adds the 4 entries so the gate stays green; N-S2 owns them after.
- `get_overview` derives no local "today": rolling window ending `DateTime.now`, UTC (`tools.ts:163–165`) → nutrition uses `profile.timezone` (precedent `integrations/activityText.ts:103–104`: `DateTime.zoneMakeNamed` → `DateTime.makeZoned`); no profile → UTC, targets None.
- Tool listing order: `toolsFor` = reads then writes (`server.ts:117–120`); tests pin `[...MCP_TOOLS]` and `MCP_TOOLS.slice(0, 6)` for read scope (`oauth/oauth.workerd.test.ts:279–359`), `tools.test.ts:498` "six read tools".
- `Persistence` union + `memoryPersistence`/`d1Persistence` in `apps/worker/src/app.ts:60–112` must provide `FoodEntryRepo` for `makeMcp`'s runtime (`McpRoute.ts:33`) — outside owned paths → Lead question Q1.
- `ToolDeps` (`apps/worker/src/mcp/tools.ts:34`) must gain `FoodEntryRepo | GarminImportRepo` — outside owned paths → Lead question Q2.
- Account erasure: `ERASED_TABLES` + DELETE in `packages/db/src/repositories/AccountErasure.ts:14–67` (+ test row, `repos/MemoryAccountErasure.ts`) must include `food_entry` (INT-N's privacy sentence says food is "deleted with your account") → registry growth, granted.
- Garmin team released `GarminImport.ts`, `MemoryGarminImport.ts`, `workerdSetup.ts`, `app.ts`, `AccountErasure*`: committed in **5fc47a0** (14:4x); worker/db tree clean at 14:48 except N-F0's shared files.

## Task table
| id | role/model | box | depends | status | done-criteria |
| --- | --- | --- | --- | --- | --- |
| N-S1 | engineer/opus | 15 | GO (N-F0 names) | done | schema `food_entry` + `profile.nutrition`, `drizzle-kit generate` → 0008 (adds only), `FoodEntryRepo` via `SyncStore.apply`, `GarminImportRepo.listDays`, memory ports, erasure registry, workerdSetup "0000 to 0008"; repo tests (listRange half-open, softDelete false twice, foreign user `Forbidden`, invariant → `invariantViolated`) |
| N-S2 | engineer/opus | 20 | N-S1 | done | 4 tools §3 verbatim, budget/kcalLeft/burnedAsOf, week Mon–Sun profile zone, workouts, insights; unit tests per tool; `update_profile` description; listing order = `MCP_TOOLS` |
| N-S3 | engineer/sonnet | 15 | N-S1 (runs with N-S2, polls for its registration) | done | workerd test via `McpRoute`: `tools/list` 13, `log_food` → `day.kcalLeft`, read scope cannot call `log_food`; worker `CLAUDE.md` tool line |
| REV-1 | reviewer/opus | 5 | N-S1 | merged into REV-2 (all three tasks finished together) | rolling review of N-S1's files while N-S2 ∥ N-S3 run |
| REV-2 | reviewer/opus | 10 | N-S2, N-S3 | done (REQUEST CHANGES → fixed) | delta pass over N-S2/N-S3 + REV-1 fixes; runs package gates |
| N-SQ | qa/sonnet | 10 | N-S2, N-S3 (∥ REV-2) | done PASS | `wrangler dev --port 9031`: `log_food` → `get_nutrition_day` → `delete_food_entry` over JSON-RPC, quoted bodies |
| FIX | same engineers (SendMessage) | 10 | REV-2 | done r1 | blocking findings only, gates re-run |

Waves (one message each): W1 N-S1 · W2 N-S2 ∥ N-S3 ∥ REV-1 · W3 REV-2 ∥ N-SQ (+ REV-1 fix resumes) · W4 fix resumes → TL root gate.

## Integration checklist
(items OUTSIDE owned paths only)
- [ ] `docs/design/local-dev.md` §5 · add "seed first (`pnpm db:reset`): the dev token's user must exist, a freshly migrated D1 answers `Forbidden: this account no longer exists`" · verify: N-SQ recipe on an empty `--persist-to` D1 (N-SQ 15:26)
- [ ] programs v6b P-S1 · `program` table + 0009 turns `packages/db` typecheck (`parity.test.ts:14`), 21 db pull tests and `index.workerd` push→pull green · verify: `pnpm check`

## Decisions
- 14:48 Garmin paths released by commit 5fc47a0 (GarminImport.ts, MemoryGarminImport.ts, workerdSetup.ts, app.ts, AccountErasure*).

## Decisions (to ratify)
- `FoodEntryRepo.put`: reject `forbidden` → `Forbidden`, any other reject → `PersistenceError` (reason + id); not in `Repositories.layer` (needs SyncStore), provided by `d1Persistence`.
- `listRange` half-open, `listDays` inclusive (all providers); memory `FoodEntryRepo` on shared `MemoryStore` with its own ownership + totals checks.
- `time/localDate.ts` exports `zoneOf, localDayOf, localHourOf, addDays, dayRange, weekOf` (Lead ruling 14:54).
- Week review: insights at today's local hour for the current week, Sunday 23:00 for other weeks; `workoutsDone` = sessions started in local Mon–Sun with `finishedAt` (shared doc aligned); `workoutsPlanned` = plan week with `weekStart` in (Monday − 7, Monday].
- `get_nutrition_day`: the `burnedAsOf` sentence sits inside the parenthesis after "partial until midnight".
- Design truth-up (Lead GO): §4 pin 1 = 3 070 (BMR 1 800), §7 23 items, `searchQuickAdd("shake")` = 2.

## Escalations / Lead questions
- 15:25 shared `NutritionProfile` optional keys (DEFECT) → Lead fixed 15:27; N-S2 dropped `.fails` in fix r1.
- Q1 (14:52) `apps/worker/src/app.ts` Persistence union + 2 layer lines → **Lead YES 14:54** (N-S1, `registry: app.ts`, minimal; programs P-S1 adds `ProgramRepo` the same way later).
- Q2 (14:52) `tools.ts:34` `ToolDeps` line → **Lead YES 14:54** (N-S2, registry).
- Lead 14:54: local-day helper in `apps/worker/src/time/localDate.ts` (new, N-S2) for reuse by Garmin G-F1; erasure registry in N-S1 confirmed; budget 3 concurrent children.

## Log
- 2026-10-27 14:09 · skeleton written (architect).
- 14:52 · HOLD: prepared at 14:52 (sheet, Assumes, port 9031 free, briefs N-S1/N-S2/N-S3 drafted). No engineer dispatched.
- 14:55 · Lead answered Q1/Q2 YES, helper path ruled, budget 3; briefs updated. Waiting for GO (N-F0 box ≈ 15:06).
- 15:10 · GO received (15:07). N-F0 names pasted into briefs (scratchpad prompt-ns{1,2,3}.md).
- 15:12→15:20 · N-S1 · engineer/opus · a794873e2b58d0d2d · 189k tok · 83 tools · r1 · DONE (8.4 min); foreign reds = programs v6b (`program` in SyncTable, no table)
- 15:12→15:23 · N-S2 · engineer/opus · a6047b6b3fc0c1d27 · 201k tok · 77 tools · r1 · DONE (11.4 min); DEFECT shared NutritionProfile optional keys → escalated
- 15:12→15:19 · N-S3 · engineer/sonnet · a3c83eb1d03cd6342 · 134k tok · 37 tools · r1 · DONE (7.7 min); workerd 5/5
- 15:25 · interim to Lead (W1 files, registry, escalation). Dispatching REV ∥ N-SQ.
- 15:25→15:27 · REV · reviewer/opus · a947c14c4822b3b91 · 110k tok · 17 tools · r1 · REQUEST CHANGES (1 blocking: stale .fails after shared fix; 3 nits)
- 15:25→15:27 · N-SQ · qa/sonnet · a134aa70660f429ab · 73k tok · 17 tools · PASS (wrangler dev 9031: 13 tools, log_food 590 kcal → targets 3070/155, kcalLeft 2480, delete true→false, -5 kcal → validation error, no 500)
- 15:27 · FIX r1 resumes: N-S2 a6047b6b3fc0c1d27 (.fails, shared mcp.test count, workoutsDone doc) ∥ N-S1 a794873e2b58d0d2d (month.ts comment, memory softDelete foreign test)
- 15:27→15:28 · FIX r1 · N-S1 (2 nits, 46 s) ∥ N-S2 (.fails dropped, shared mcp.test 13, workoutsDone doc; 56 s) · both green
- 15:29 · TL gates: worker tsc ✓; worker Node src/mcp+repos+time 138/138; workerd 110/111 (1 foreign: index push→pull, sync.pull on missing `program` table, v6b); db FoodEntry/AccountErasure/month 30/30; db tsc ✗ only parity.test.ts:14 `program` (v6b); root `pnpm check`: biome 638 files ✓, typecheck ✗ same parity line (v6b)
- 15:30 · CLAUDE.md lines written (apps/worker: repos MemoryFoodEntry + time/; packages/db: v6 nutrition Status). Team report.
