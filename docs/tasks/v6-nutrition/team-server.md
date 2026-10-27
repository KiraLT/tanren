# Team charter: Nutrition server (db + MCP) (v6, ADR-0025)
Status: HOLD (prepared 14:52) · team-lead opus · Lead sheet: `docs/tasks/v6-nutrition.md` (team "nutri-server") · Design: `docs/design/nutrition.md` §1–§3
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
| N-S1 | engineer/opus | 15 | GO (N-F0 names) | queued | schema `food_entry` + `profile.nutrition`, `drizzle-kit generate` → 0008 (adds only), `FoodEntryRepo` via `SyncStore.apply`, `GarminImportRepo.listDays`, memory ports, erasure registry, workerdSetup "0000 to 0008"; repo tests (listRange half-open, softDelete false twice, foreign user `Forbidden`, invariant → `invariantViolated`) |
| N-S2 | engineer/opus | 20 | N-S1 | queued | 4 tools §3 verbatim, budget/kcalLeft/burnedAsOf, week Mon–Sun profile zone, workouts, insights; unit tests per tool; `update_profile` description; listing order = `MCP_TOOLS` |
| N-S3 | engineer/sonnet | 15 | N-S1 (runs with N-S2, polls for its registration) | queued | workerd test via `McpRoute`: `tools/list` 13, `log_food` → `day.kcalLeft`, read scope cannot call `log_food`; worker `CLAUDE.md` tool line |
| REV-1 | reviewer/opus | 5 | N-S1 | queued | rolling review of N-S1's files while N-S2 ∥ N-S3 run |
| REV-2 | reviewer/opus | 10 | N-S2, N-S3 | queued | delta pass over N-S2/N-S3 + REV-1 fixes; runs package gates |
| N-SQ | qa/sonnet | 10 | N-S2, N-S3 (∥ REV-2) | queued | `wrangler dev --port 9031`: `log_food` → `get_nutrition_day` → `delete_food_entry` over JSON-RPC, quoted bodies |
| FIX | same engineers (SendMessage) | 10 | REV-1/REV-2 | queued | blocking findings only, gates re-run |

Waves (one message each): W1 N-S1 · W2 N-S2 ∥ N-S3 ∥ REV-1 · W3 REV-2 ∥ N-SQ (+ REV-1 fix resumes) · W4 fix resumes → TL root gate.

## Integration checklist
(items OUTSIDE owned paths only)
- [ ] _none yet_

## Decisions
- 14:48 Garmin paths released by commit 5fc47a0 (GarminImport.ts, MemoryGarminImport.ts, workerdSetup.ts, app.ts, AccountErasure*).

## Escalations / Lead questions
- Q1 (14:52) `apps/worker/src/app.ts` Persistence union + 2 layer lines → **Lead YES 14:54** (N-S1, `registry: app.ts`, minimal; programs P-S1 adds `ProgramRepo` the same way later).
- Q2 (14:52) `tools.ts:34` `ToolDeps` line → **Lead YES 14:54** (N-S2, registry).
- Lead 14:54: local-day helper in `apps/worker/src/time/localDate.ts` (new, N-S2) for reuse by Garmin G-F1; erasure registry in N-S1 confirmed; budget 3 concurrent children.

## Log
- 2026-10-27 14:09 · skeleton written (architect).
- 14:52 · HOLD: prepared at 14:52 (sheet, Assumes, port 9031 free, briefs N-S1/N-S2/N-S3 drafted). No engineer dispatched.
- 14:55 · Lead answered Q1/Q2 YES, helper path ruled, budget 3; briefs updated. Waiting for GO (N-F0 box ≈ 15:06).
