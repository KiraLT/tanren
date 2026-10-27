# v6b — Programs via MCP, in-app editor, swaps, statuses, 12-Week Lean Build (ADR-0026, `docs/design/programs-mcp.md`)

Owner words: plan Amendments 21 (14:34) and 22 (14:36). Design sections are the spec; rows point at them. Models: opus
for P-F0, P-S1, P-M1 and the reviewer; sonnet (+ `frontend-design`) for screens, data and tests from the spec. ≤ 3
engineers in parallel. Every brief carries: "never run a command under `permissions.ask`: `git push|reset|checkout`,
`rm -r*`, `wrangler deploy|login|secret|d1 execute`, `eas *`, Cloudflare MCP `execute`; `pnpm db:reset` is fine".
Ports: worker **9032**, Expo web **8094** (`ps -ef | grep "903\|809"` first). Export dir `docs/design/screens/v6b/`.

Run order: P-F0 starts after N-F0's commit (same shared/mobile store files). P-D1 and P-M* run in parallel with the
nutrition teams (disjoint paths). P-S1/P-S2 touch nutri-server's owned paths (`packages/db/migrations/meta`,
`apps/worker/src/repos/**`, `apps/worker/src/mcp/{server,writeTools}.ts`, `workerdSetup.ts`): they start after that
team's final commit, or earlier if the Lead releases those paths (**R1** to the Lead).
Paths never touched here: `apps/mobile/app/health/**`, `apps/mobile/app/settings/**`, `packages/db/src/schema/
{nutrition,user,garmin}.ts`, `apps/worker/src/integrations/**` (nutrition + Garmin teams).

| id | title | role / model | box | files (exclusive) | after | done |
|---|---|---|---|---|---|---|
| P-F0 | Shared schemas + sync + mobile store v6 | engineer / opus | 20 | `packages/shared/src/{ids,common,program,program.test,sync,sync.test,row,row.test,mcp,mcp.test,index}.ts`, `packages/shared/src/programs/{swaps,swaps.test}.ts`, `packages/db/src/sync/SyncStore.ts` (+ `SyncStore.programs.test.ts`), `apps/worker/src/sync/SyncStore.ts`, `apps/mobile/src/store/{migrations,migrations.test}.ts`, `apps/mobile/src/services/{LocalStore,DataExport,DataExport.test}.ts` | N-F0 | §1 schemas (`UserProgram*`, `ProgramSchedule`, `ProgramSource`, `Swaps`, `paused`, `ProgramSummary`, `summarize`, `toProgram`, `programIdOfRow`, `swapCandidates`, `applySwaps`), §2 members in every listed consumer, §3 input/output schemas WITHOUT touching `MCP_TOOLS`; re-pin the §2 assertions; gate green; report exact exported names |
| P-D1 | 12-Week Lean Build data | engineer / sonnet | 20 | `packages/shared/src/programs/{leanBuild,leanBuild.test,index}.ts`, `packages/shared/src/catalog/catalog.test.ts` (only if a cap trips) | — | §7 verbatim; tests listed in §7; `PROGRAMS` has 2; `grep -ri "<any author/brand>"` nothing — the engineer greps the two names the Lead gives in the brief; gate green |
| P-S1 | D1 schema, migration 0009, repo, erasure, memory ports | engineer / opus | 20 | `packages/db/src/schema/{program,parity.test}.ts`, `packages/db/migrations/0009_*` + `meta/`, `packages/db/src/repositories/{Program,Program.test,AccountErasure,AccountErasure.test,index}.ts`, `apps/worker/src/repos/{MemoryStore,MemoryAccountErasure,MemoryPrograms,MemoryPrograms.test,index}.ts`, `apps/worker/scripts/seed.ts`, `apps/worker/src/testing/workerdSetup.ts` | P-F0, N-S1 (+R1) | §2 table + ALTER, `drizzle-kit generate` → 0009, `UserProgramRepo` signatures §2 (writes via `SyncStore.apply`), erasure deletes `program`, workerdSetup "0000 to 0009"; repo tests: slug unique → reject reason, foreign user `Forbidden`, softDelete twice → false |
| P-S2 | MCP program tools | engineer / sonnet | 20 | `apps/worker/src/mcp/{programTools,programTools.test,programTools.workerd.test}.ts`, `packages/shared/src/mcp.ts` (`MCP_TOOLS` + 9 names only), `apps/worker/src/mcp/{server,writeTools}.ts` (annotations + registration lines only), `apps/worker/src/mcp/nutritionTools.workerd.test.ts` (13 → 22 only), `apps/worker/CLAUDE.md` tool line | P-S1, N-S3 | §3 semantics and descriptions verbatim; unit tests: replace-by-slug keeps id and bumps version, unknown catalog id → NotFound, built-in → Forbidden, delete refuses then `force` abandons, enroll twice → `alreadyActive`, paused blocks nothing but is reported, swap rejects a non-candidate; workerd: `tools/list` 22, read scope sees 3 program reads |
| P-M1 | Mobile ProgramRepo: finder union, statuses, swaps, due list | engineer / opus | 20 | `apps/mobile/src/services/{ProgramRepo,ProgramRepo.test}.ts`, `apps/mobile/src/services/runtime.ts`, `apps/mobile/src/player/{useProgramDay,usePrograms,playerEffects}.ts`, `apps/mobile/src/hooks/usePlayer.ts` | P-F0 | §4 "Mobile services": effectful `find`, `list`, `activeEnrollments`, `dueToday`, `setStatus`, `setSwap`, `save`, `deleteProgram`; `complete` applies `applySwaps` before logging; player takes `enrollmentId`; tests: paused `complete` → `EnrollmentNotActive`, two active programs both due, swap applied in `plannedItems`, delete while enrolled refused |
| P-M2 | Programs tab, detail, Today due list | engineer / sonnet + frontend-design | 20 | `apps/mobile/app/(tabs)/programs.tsx`, `apps/mobile/app/programs/[programId].tsx`, `apps/mobile/src/player/components/{ProgramHome,ProgramList,ProgramActions}.tsx`, `apps/mobile/src/components/TodayPrograms.tsx`, one import + render line in `apps/mobile/app/(tabs)/today.tsx` (coordinate: nutrition's N-M* also touch today.tsx — **R2** to the Lead: one owner for today.tsx, default nutrition team, P-M2 hands the `<TodayPrograms />` line as a one-line request) | P-M1 | §4 tab/detail/Today rows with the stated widths; screenshots 390 + 1280 light/dark to the export dir; `document.querySelectorAll("h1").length === 1` per route; Loading/Failed single-column on `(tabs)/programs`, `programs/[programId]` |
| P-M3 | Editor: new, program editor, day editor, picker | engineer / sonnet + frontend-design | 20 | `apps/mobile/app/programs/{new,pick}.tsx`, `apps/mobile/app/programs/edit/[programId].tsx`, `apps/mobile/app/programs/edit/[programId]/day/[n].tsx`, `apps/mobile/src/components/programs/{ProgramForm,DayForm,ItemCard,SchedulePicker}.tsx` (+ `.test.ts` for pure helpers `slugify`, `moveItem`), `apps/mobile/CLAUDE.md` Layout lines | P-M1 | §4 editor rows at 358 (item card 176 h); duplicate a built-in creates a `manual` row; every save bumps `version`; `ls apps/mobile/app/programs | tr A-Z a-z | sort | uniq -d` empty; screenshots as P-M2 |
| P-M4 | Swap sheet in the player | engineer / sonnet | 15 | `apps/mobile/app/programs/swap.tsx`, `apps/mobile/src/components/programs/SwapList.tsx`, player header button in `apps/mobile/src/player/components/*` (the file that owns the exercise header — name it in the report) | P-M1 | §4 swap: candidates from the active location, revert row, player re-reads; screenshot 390 |
| P-R | Review | reviewer / opus | 15 | all of the above | P-S2, P-M4 | brief-by-brief; blockers routed back (fix 10) |
| P-Q | QA | qa / sonnet | 20 | — | P-R | §5 recipe end to end (`wrangler dev` 9032 + Inspector for MCP; `ui-check` on Expo web 8094); report each step's observed value |

Assumes (cited): §6 of the design. Open for the Lead: R1 (release of nutri-server paths), R2 (one owner for
`(tabs)/today.tsx`), the two names to grep in P-D1 (not written here on purpose).
Deferred (ADR-0026): drag reorder, per-item patch in `update_program`, schedule enforcement, > 12 items per day, sharing.
Chain: P-F0 20 → (P-D1 ∥ P-M1 20 → P-M2 ∥ P-M3 ∥ P-M4 20) ; P-S1 20 → P-S2 20 after nutrition → P-R 15 → P-Q 20. Box ≈ 115 min.

## Team programs (team-lead, opus) — GO 15:07 · final 17:08
Ports (probed 14:52, `ps -ef | grep "port 903\|port 809"` empty, curl 000): worker **9034** (P-Q), Expo web **8094** (P-Q,
P-M2 capture), **8095** (P-M3 capture), **8096** (P-M4 capture). Not 9032 (nutri-today web). Export dir `docs/design/screens/v6b/`,
capture ids `UI-PROG-*`, gallery badge prefix `PG`. Briefs (pre-written, verbatim from the rows + rulings):
`/private/tmp/claude-501/-Users-lukas-Documents-Personal-tanren/2f72436e-0cd5-4397-8737-fd4699a2ee88/scratchpad/programs-briefs.md`.

Assumes (cross-team; each with its owner):
- N-F0 (Lead-dispatched foundation) lands first in `packages/shared/src/{ids,common,row,sync,user,mcp,index}.ts` + tests, db
  `SyncStore.ts`, mobile `migrations.ts` (v5) / `LocalStore.ts` / `DataExport.ts`; P-F0 builds on its exported names (GO message).
- nutri-server lands migration 0008 + `meta/` (P-S1's migration is **0009**), owns `apps/worker/src/repos/**`,
  `mcp/{server,writeTools}.ts`, `workerdSetup.ts` until the Lead relays "N-S1 landed" (P-S1) / "N-S2/N-S3 landed" (P-S2).
  `tools/list` is 13 after nutrition (N-S3's assertion; P-S2 makes it 22). The "today in `profile.timezone`" helper for
  `enroll_program` is the one N-S2 names.
- nutri-today owns `apps/mobile/app/(tabs)/today.tsx`: P-M2 sends the one-line `<TodayPrograms />` mount request through the Lead.
  `apps/mobile/src/services/runtime.ts` is `shared with nutri-today` (they add FoodEntry/Nutrition layer lines; P-M1 changes
  the ProgramRepo line only). `iconPaths.ts` is theirs: we use existing glyphs only (`calendar`, `swap`, `plus`, `play`, `pause`).
- P-D1 (Lead-dispatched): `packages/shared/src/programs/{leanBuild,leanBuild.test,index}.ts`; title "12-Week Lean Build";
  `PROGRAMS = [CORE30, LEAN_BUILD_12]` (in tree 14:51). Forbidden strings everywhere we write: the brand/author names given in the P-D1 brief (never written into repo files; grep per P-D1).
  P-F0 exports `programs/swaps.ts` from the ROOT barrel `packages/shared/src/index.ts`, never from `programs/index.ts`.
- nutri-food owns `app/health/add.tsx` and settings nutrition — disjoint.

| id | title | model | box | depends | wave | status |
|---|---|---|---|---|---|---|
| P-F0 | shared schemas + sync + mobile store v6 | opus | 20 | GO (N-F0) | W1 | done (REV-1a APPROVE) |
| P-M1 | mobile ProgramRepo, usePrograms, player enrollmentId | opus | 20 | P-F0 | W2 | done (REV-1b APPROVE) |
| P-S1 | D1 0009, UserProgramRepo, erasure, memory ports | opus | 20 | P-F0 + "N-S1 landed" | W3 | done (fix r1 landed) |
| REV-1 | rolling review P-F0, P-M1, P-S1 | reviewer/opus | 8 | P-F0, P-M1, P-S1 | W3 | done (REV-1a/1b APPROVE) |
| P-M2 | Programs tab, detail, TodayPrograms | sonnet + frontend-design | 20 | P-M1 | W3 | done (r1; P-Da→P-De PASS) |
| P-M3 | editor: new, program, day, picker | sonnet + frontend-design | 20 | P-M1 | W4 | done (r3; P-R APPROVE, P-De PASS) |
| P-M4 | swap sheet in the player | sonnet | 15 | P-M1 | W5 | done (REV-3b APPROVE, P-Dd PASS) |
| P-S2 | MCP program tools (9) | sonnet | 20 | P-S1 + "N-S2/N-S3 landed" | W4 | done (REV-2b APPROVE) |
| N-S4 | list_activities MCP tool + imported summary in get_overview (Lead 16:10, Amendment 24) | sonnet (P-S2 engineer) | 10 | commit | W5 | done (r1; REV-4a APPROVE) |
| P-M5 | read-only day preview route (Lead 16:11, owner) | opus | 15 | commit (wiring) | W5 | done (r2; REV-4a APPROVE, P-De PASS) |
| P-M6 | rounds before a swap keep their exercise (Lead 16:42) | sonnet (P-M4 engineer) | 12 | P-M4 | W6 | done (P-R APPROVE) |
| P-UI | src/ui raised/sm/muted/headingLevel (Lead 16:19) | sonnet | 12 | — | W6 | done (r2; P-R APPROVE, P-De PASS) |
| P-D | designer verdict on UI-PROG-* (390 + 1280, light + dark) | architect/fable | 10 | P-M2, P-M3, P-M4 | W5 | done (P-Da…P-De, final PASS) |
| P-R | REV-2 delta review: P-M2–M4, P-S2 (+ P-D fixes) | reviewer/opus | 15 | W3, W4 | W5 | done (APPROVE) |
| P-Q | QA §5 recipe end to end (worker 9034, web 8094) | qa/sonnet | 20 | P-R | W6 | done (APPROVE) |
Waves go out one message each; ≤ 2 engineers live (Lead 14:57: four teams share the rate limit; reviewer/designer/QA extra).
W1 P-F0 · W2 P-M1 ∥ P-S1 (if released) · W3 P-M2 ∥ P-M3 + REV-1 · W4 P-M4 ∥ P-S2 (or P-S1/P-S2 on relay) · W5 P-D ∥ P-R · W6 P-Q.
Critical path: P-F0 20 → P-M1 20 → W3 20 → W4 15–20 → P-D ∥ P-R 15 → fix 10 → P-Q 20 ≈ 125 min.

### Log (team programs)
- 14:55 · HOLD prep done: sheet section, ports, P-F0/P-M1/P-S1 briefs pre-written; interim to the Lead.
- 14:57 · Lead: GRANT 1 (`app/programs/play.tsx` → P-M1), GRANT 2 (`components/{TodayReady.tsx,todayHeader.ts,todayHeader.test.ts}` compile-level switch, `useProgramDay` deleted), GRANT 3 (registry: `repos/MemoryStore.ts`, `scripts/seed.ts`, mobile `MockSyncServer`/`SyncEngine`, `shared with nutri-server`); CLAUDE.md lines by team-lead; budget ≤ 2 engineers.
- 15:07 · GO from the Lead (N-F0 facts, nf0-exports.md).
- 15:08→15:22 · P-F0 · engineer/opus · acaf52983f525dec2 · 283k tok · 155 tools · r1 · DONE (13 min): all §1–§3 names exported, program last in SYNC_TABLE_ORDER, store v6, registry MemoryStore/MemoryAccountErasure/seed.ts/seed month.ts/Cursor.edge.test/SyncEngine.test; db sync tests red until 0009 (P-S1), parity.test red (P-S1), shared mcp.test 'nine tools' red (N-S2 added 4 names → nutri-server). Decisions: swapCandidates available = Option (None = no filter, P-S2 passes none), swaps decoding default [] on the wire, programIdOfRow = ProgramId.make(lowercase), custom unique-from filter, toProgram disableChecks.
- 15:23→15:33 · P-M1 · engineer/opus · ab8f220c965a62297 · 211k tok · 60 tools · r1 · DONE: mobile check 1175 green; usePrograms.ts new, useProgramDay.ts deleted; abandon/active replaced by setStatus/activeEnrollments; play needs active ?enrollmentId= else danger Banner.
- 15:23→15:25 · REV-1a (P-F0) · reviewer/opus · ab9e45eb76d6a8b68 · 95k tok · 14 tools · APPROVE; shoulds: (1) swaps wire default = legit expand, deploy note → Lead; (2) swaps ranking test weak → P-S1; (3) MemoryStore lacks program_user_slug_unique → P-S1; nits program.test name, Cursor.ts comment → P-S1.
- 15:30 · Lead: N-S1 landed (P-S1 GO); P-S2 GO (nutri-server finished). Lanes: A P-S1 → P-S2 → P-M4, B P-M2 → P-M3.

- 15:35→15:44 · P-S1 · engineer/opus · a67b2092a14189332 · 192k tok · 84 tools · r1 · DONE: 0009 additive, UserProgramRepo, MemoryPrograms, erasure, app.ts; db 212 / worker 820 / workerd 111.
- 15:35→15:50 · P-M2 · engineer/sonnet · ab9c91fc4685bb916 · 264k tok · 131 tools · r1 · DONE except 2 typed-route reds (P-M3's routes); 32 shots UI-PROG-1..8.
- 15:35→15:37 · REV-1b (P-M1) · reviewer/opus · a23fe72c74d37ce6c · 105k tok · 19 tools · APPROVE; shoulds: 4 missing failure tests, setSwap no-op dirty, finder reads all rows, CLAUDE.md useProgramDay line.
- 15:53→16:08 · P-M3 · engineer/sonnet · a0061db345ecef639 · 280k tok · 120 tools · r1 · DONE: mobile check 1216 green; shots UI-PROG-9..12.
- 15:53→16:02 · P-S2 · engineer/sonnet · aca9be9c9c21ac157 · 242k tok · 80 tools · r1 · DONE: worker 851 incl. workerd, tools/list 22; shared common/errors NotFound loosening (Lead ratified 16:11).
- 15:53→15:56 · REV-2a (P-S1, P-M2) · reviewer/opus · ab1815e8b5412a264 · 112k tok · 26 tools · REQUEST CHANGES (should-level): P-S1 swallowed conflicts; P-M2 dead ProgramPreview, delete copy, delete flow flash; id casing → P-M4/P-M3.
- 15:53→15:55 · P-Da (P-M2 shots) · architect/fable · ad453d76fcf01a75c · 101k tok · 27 tools · FIX 4 (idle 1280 card, hero caption, double Resume, tab Resume secondary); 6 rulings ratified.
- 16:08 · team-lead: mobile + worker typecheck clean → "P-M3 landed" to the Lead.
- 16:09→16:12 · P-S1 fix r1 (resume a67b2092a14189332) · 18 tools · conflicts → PersistenceError, memory putEnrollment immutables; db 214, worker 852, workerd 116.
- 16:09→ · P-M2 fix r1 (resume ab9c91fc4685bb916) · in flight.
- 16:09→16:14 · REV-2b (P-S2, P-M3) · reviewer/opus · a4b6be85bf2ec1e7f · 178k tok · 31 tools · P-S2 APPROVE (should: force-delete non-atomic); P-M3 REQUEST CHANGES (blocking: unguarded double taps; should: stale-prop edits, dead mapItem, 84→60 day truncation → Lead).
- 16:09→16:12 · P-Db (P-M3 shots) · architect/fable · a1d7b58ee7bef6826 · 78k tok · 15 tools · FIX 3 (1280 editors Columns 5/7, no-schedule caption, footer shots); 9 rulings ratified.
- 16:10/16:11 · Lead: N-S4 + P-M5 added; one combined commit after the P-S1/P-M2 fix rounds; NotFound String ratified.

- 16:16→16:17 · P-M2 fix r1 (resume ab9c91fc4685bb916) · 70 tools · designer FIX 1–4 + REV-2a F2/F3/F6 done; mobile 1217; tab Resume `secondary` invisible on Card → src/ui task.
- 16:20 · Lead commit c759af0 (nutrition + programs P-F0…P-M3 r0); DEPLOY-16.
- 16:21→16:29 · P-M3 fix r1 (resume a0061db345ecef639) · 70 tools · double taps guarded, findRow, Columns 5/7, caption; mobile 1254.
- 16:21→16:31 · N-S4 + cap 84 + P-S2 shoulds (resume aca9be9c9c21ac157) · 104 tools · list_activities, imported summary, tools/list 23, retryOnConflict; foreign reds = refresh-token-burn stream.
- 16:21→16:27 · P-M5 · engineer/opus · a905378c8be065ffb · 163k tok · 52 tools · DONE: day preview route; 16:28→16:30 P-M5b (resume) phone DayList + "Show all N days".
- 16:30→16:38 · P-M4 · engineer/sonnet · a16104a39762f1e51 · 218k tok · 82 tools · DONE: swap sheet, mergeDay, setSwap no-op + 5 REV-1b tests; mobile 1276.
- 16:30→16:33 · REV-3a (P-M3 r1, P-M5) · reviewer/opus · a380d7baa3acde4de · 119k tok · 19 tools · REQUEST CHANGES (should): post-save double tap window, reorder-then-step, lock tests, dead exports, caption copy, deleteProgram id spelling; P-M5 nav guards.
- 16:30→16:32 · P-Dc (editor re-shoots + preview) · architect/fable · a29f0721dd9a53af5 · 90k tok · 21 tools · editor closed except remove-confirm re-shoot; preview PASS + 13b FIX 2–3; `raised` Button spec.
- 16:41→16:43 · P-M5 r2 (resume) · nav guards, not-enrolled DayList only, chevrons, ProgramInside deleted.
- 16:41→16:44 · P-UI · engineer/sonnet · af9679a9681a22a80 · 174k tok · 65 tools · DONE: Button raised + sm, StatusPill muted, EmptyState headingLevel; tab Resume raised; mobile 1286.
- 16:41→16:44 · REV-3b (P-M4, N-S4) · reviewer/opus · a6f863e5792ce7c28 · 143k tok · 24 tools · APPROVE both; shoulds: swap push guard, swap-boundary logging (→ P-M6), retry test, CLAUDE.md 7 reads.
- 16:41→16:42 · P-Dd (swap shots) · architect/fable · a8cd831f2c1d18905 · 73k tok · 13 tools · PASS (follow-ups: 18-dark shot, corner clip check).
- 16:41→ · P-M3 fix r2 (resume a0061db345ecef639) · in flight.
- 16:42 · Lead: P-M6 in scope (rounds before a swap keep their exercise); ≤ 6 statements ok.
- 16:46→ · P-M6 + swap guard (resume a16104a39762f1e51) · in flight; N-S4 fix r1 (resume aca9be9c9c21ac157) · in flight.

- 16:47→16:49 · N-S4 fix r1 (resume) · retry test proves fresh row, READ_ONLY idempotent, CLAUDE.md 7 reads.
- 16:41→16:47 · P-M3 fix r2 (resume) · writeGate/useWriteGate, F5–F7, caption; mobile 1286.
- 16:46→16:51 · P-M6 + swap guard (resume a16104a39762f1e51) · per-item-round `performedIds`, reconcilePlan; mobile 1292.
- 16:50→16:54 · REV-4a · reviewer/opus · a8614e8f12d4bffc0 · 144k tok · 31 tools · P-M5 r2, P-UI r1, N-S4 fix APPROVE; P-M3 r2 positional window → r3.
- 16:49→16:54 · P-UI r2 (resume) · Today sm Start, Paused muted, not-enrolled neutral rows, NotFound EmptyState h2.
- 16:53→16:57 · P-M3 fix r3 (resume) · gate `awaiting`/`observed`; mobile 1296.
- 16:57→17:00 · P-R · reviewer/opus · ae1f772b1c3e9f739 · 92k tok · 20 tools · APPROVE (P-M6, P-UI r2, P-M3 r3); mobile check 1298 green. Shoulds → follow-ups below.
- 16:57→16:59 · P-De · architect/fable · a350f0a8aacedc621 · 81k tok · 23 tools · PASS all 8.
- 16:57→17:05 · P-Q · qa/sonnet · a1ba0e99cca127cac · 122k tok · 50 tools · PASS (§5 recipe on worker 9034 + export 8094, dev-token MCP); root `pnpm check` 231 files / 2929 tests green.
- 17:06 · team-lead: writeGate + programEdit tests 5× → 39/39 each run (HM-4's failing test name predates P-M3 r3; the suite is pure and deterministic).

### Follow-ups (should-level, not blocking; for the next programs touch)
- writeGate: `observe(v)` before `finish(v)` can leave the gate shut until the screen is left — keep `lastSeen`, set `awaiting` only when savedVersion > lastSeen (P-R F1).
- `mergeDay.test`: Paused(Working)/Paused(Resting) `reconcilePlan` cases; browser proof of a mid-workout swap through Finish with logged sets checked (P-R F2/F3).
- `ProgramRepo` `performedIds` doc: name the edited-program fallback case (P-R F4).
- `usePrograms` `act()` (enroll/setStatus/remove): `requestSync` after the write (P-Q obs 2: status changes reach MCP only on the 60 s interval).
- Swap candidates may include an exercise already in the same day (P-Q); subtitle = secondary muscles when they differ (P-Dd 3).
- NotFound EmptyState vertical placement differs between `Page scroll` and bounded routes (P-De 7) → ui-polish.
- Copy: paused enrollments listed under "Active" (P-Q obs 1).
- `src/ui/tokens.ts:71` `asideMaxWidth` dead export (pre-existing; P-R F5).

### Integration checklist (items outside owned paths only)
- [x] `apps/mobile/app/(tabs)/today.tsx` (nutri-today) · `<TodayPrograms />` mounted (P-Q: today.tsx lines 97, 114)
- [ ] deploy order (REV-1a, REV-3b): ship Worker + web export + EAS Update together — older bundles cannot decode `program` rows,
  84-day programs or pushes without `swaps`; contract row later: drop the `swaps` decoding default once v6 is adopted
- [ ] INT-R: migrate other `secondary`-in-Card buttons app-wide to `raised` (P-UI rule; programs screens done)

## Log
- 2026-10-27 14:47 · sheet written (architect, fable); Amendment 22 applied mid-run (see ADR-0026 Overrides).
