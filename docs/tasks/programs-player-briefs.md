# Program player v2 briefs (PROG-D2 → Lead, 2026-10-27 18:45)

Design `docs/design/programs-player-v2.md` (§ numbers below). No D1 change, no MCP change (D1 of the
design: weighted is derived from the catalog). Store migration **v8** (after FREE-1's v7).
Permissions line for every brief: write only the files listed; no `git`, no `pkill`, no cloud calls;
start wrangler/expo by pid file per `apps/mobile/CLAUDE.md` Commands. Load `expo-mobile` +
`effect-conventions`.

Order and hand-offs (file conditions, not commits):
1. **PROG-1** starts now (touches no FREE-1 / CONFIRM-2 file).
2. **PROG-3** starts when FREE-1's files are final (it edits `TodayRepo.ts`); may run beside PROG-1.
3. **PROG-5** (sets per exercise, below) starts when PROG-3's report has landed; **PROG-2** starts when PROG-5's report has landed AND CONFIRM-2's `app/programs/*.tsx` are final
   (it edits `play.tsx`, `[programId].tsx`, `cues.ts`, `usePlayer.ts`, `ProgramRepo.ts`, all also PROG-3's).
4. **PROG-4** (dynamic schedule) after PROG-2; **PROG-R** after PROG-4, before the commit. Full order: PROG-1 → PROG-3 → PROG-5 → PROG-2 → PROG-4 → PROG-R.

## PROG-1 — Row press → day preview (engineer / sonnet, time box 8 min)

Files: `apps/mobile/src/components/TodayPrograms.tsx`, `apps/mobile/src/player/components/ProgramHome.tsx`
(`DayCard` + `onOpenDay?` prop only), `apps/mobile/src/player/components/ProgramList.tsx`,
`apps/mobile/app/(tabs)/programs.tsx`. NOT `app/programs/*` (CONFIRM-2 owns them; PROG-2 wires the detail).
Facts (grep 18:33): `TodayPrograms.tsx` `ListRow` has no `onPress`, trailing `Button size="sm" label="Start"`;
`ListRow` props include `onPress`, `chevron`, `accessibilityLabel` (`src/ui/ListRow.tsx`); `DayCard`
(`ProgramHome.tsx`) renders ring + name + `dayCardLine` + one pill, no press; preview route is
`/programs/[programId]/day/[n]` with `params: { programId, n: String(n) }` (`app/programs/[programId].tsx`
`onPreview`); `ActiveProgram.enrollment.currentDay` is the day to open.
Do: design §1 table, both rows; `chevron` off on the Today row; the Start button keeps its own press.
Done when: `pnpm check` green; VERIFY in the report how `ListRow` nests `trailing` vs its Pressable (one
grep line) and that a tap on Start does NOT open the preview; ui-check at 390 dark, signed-in store with an
active enrollment (seed recipe: `docs/design/reviews/UI-NUTRI-e2e.md` or `EXPO_PUBLIC_DEV_USER_ID` + enrol
Core 30 from the Programs tab): Today → tap the program name → day preview URL `/programs/<id>/day/<n>`
with the items list; back → tap Start → `/programs/play?enrollmentId=`; Programs tab → tap the Active
card's name → same preview. Shots `docs/design/screens/UI-PROG-{1,2}-390-dark.png`. Report the measured
`getBoundingClientRect` height of the Today row (≥ 44) and of the DayCard header press area (≥ 44).

## PROG-3 — Weights per set + Progress units (engineer / opus, time box 20 min)

Starts when FREE-1's files are final (`TodayRepo.ts` edited here).
Files: `packages/shared/src/catalog/{loaded.ts,loaded.test.ts,index.ts}`, `apps/mobile/src/services/
{HistoryRepo.ts,HistoryRepo.test.ts,TodayRepo.ts,ProgramRepo.ts,ProgramRepo.test.ts}`,
`apps/mobile/src/player/{cues.ts,cues.test.ts,playerEffects.ts,playerEffects.test.ts}`,
`apps/mobile/src/hooks/usePlayer.ts`, `apps/mobile/src/player/components/PlayerView.tsx`,
`apps/mobile/src/components/progress/{progressFormat.ts,progressFormat.test.ts,ExerciseDetail.tsx,
ProgressRows.tsx}`. NOT `playerMachine.ts`, NOT `app/**` (CONFIRM-2), NOT `migrations.ts`.
Facts (grep 18:33): `ProgramRepo.ts` `historyFor` logs every set with `WeightKg.makeEffect(0)` and
`reps: Reps.makeEffect(loggedCount(planned.item))` (seconds for timed); `cues.ts` `PlayerRun` has
`performedItems`, `reduceRun(config)`; `playerEffects.ts` `FinishedRun { performedItems, performedIds }`,
`CompletionResult.Saved { durationSeconds }`; `PlayerView.tsx` reps block = numeral + "reps" + `doneButton`
(`send("next")`); `stepMath.ts` exports `stepWeight`, `stepReps`, `formatKg`; `src/ui` exports `Stepper`
(`label, valueText, unit, onDecrement, onIncrement, size`); `TodayRepo.ts` private `lastLiveSet(exerciseId)`
is the last-set query; `HistoryRepo.ts` interface has `exercises`, `exercise(id)` only;
`activity.ts` `epley1Rm` is 0 for `weightKg <= 0`, `SetScore` lets reps decide at 0 kg;
`progressFormat.ts` `weekSeries` picks reps when all weeks' volume is 0; `exercise.catalogId` is an
`Option<CatalogId>` (`packages/shared/src/exercise.ts`); `ExerciseLink.ensure(catalogId)` → `ExerciseId`.
Do: design §2.1–§2.7 exactly (names, signatures). `HistoryRepo.lastSet` replaces `TodayRepo.lastLiveSet`
(delete it; VERIFY `runtime.ts` layer order). `PlayerConfig.prefill: ReadonlyMap<CatalogId, SetEntry>`.
Finish summary = two tiles (§2.5), never a `·` row.
Tests (`.claude/rules/tests.md`): `loaded.test.ts` iterates `CatalogEquipment.literals` (every literal in
exactly one list); `cues.test.ts`: `entries.length === performedItems` after start→next×3, `adjust` only
changes `draft`, `previous` within grace drops the last entry; `ProgramRepo.test.ts`: `complete` with
`entries: [Some({80, 8}), None]` writes `weightKg 80, reps 8` then `0, loggedCount`; `HistoryRepo.test.ts`:
`unit "kg"` drops 0-kg sets from `best`/`e1RmTrend`/`weeks.volumeKg`, `unit "s"` best is max seconds;
`progressFormat.test.ts`: `formatSetText(0, 45, "s") === "45 s"`, `weekSeries(weeks, "s").unit === "s"`.
Changed assertions to name in the report: `progressFormat.test.ts` the `weekSeries` "bodyweight → reps"
case (now `unit`-driven) and any `formatSetText(0, n)` → `"n reps"` case (gains the `unit` arg).
Done when: `pnpm check` green; ui-check 390 dark with an enrollment whose current day has a loaded reps
item (enrol the 12-week program, `leanBuild.ts`, or `write_program` one day with a dumbbell item): player
shows kg/reps steppers prefilled, change to 20 kg × 10, Done → next item; Finish workout → sheet shows
Duration and Volume tiles (report the volume number = Σ kg×reps); Feed/activity for the session lists
"20 kg × 10"; Progress → that exercise → best set in kg, "Volume, last 8 weeks"; a plank exercise reads
"45 s" / "Seconds, last 8 weeks". Shots `docs/design/screens/UI-PROG-{3,4,5}-390-dark.png`. Report ends
with `## Exports` (`SetEntry`, `isLoaded`, `LOADED_EQUIPMENT`, `HistoryRepo.lastSet`, `ProgramRepo.prefill`,
`CompletionInput.entries`, `FinishedRun.entries`, `PlayerConfig.prefill`, `SeriesUnit`) — PROG-2's GO payload.
VERIFY in the report: MCP `get_exercise_history` PR marking of 0-kg sets (`packages/shared/src/activity.ts`
summary path) — question, not a change.

## PROG-2 — Resume an unfinished day (engineer / opus, time box 20 min)

Starts when PROG-3's report landed AND CONFIRM-2's `app/programs/*.tsx` are final.
Files: `apps/mobile/src/store/migrations.ts` (v8), `apps/mobile/src/services/{DayProgressRepo.ts,
DayProgressRepo.test.ts,ProgramRepo.ts,ProgramRepo.test.ts,runtime.ts}`, `apps/mobile/src/player/
{playerMachine.ts,playerMachine.test.ts,cues.ts,cues.test.ts}`, `apps/mobile/src/hooks/usePlayer.ts`,
`apps/mobile/app/programs/play.tsx`, `apps/mobile/app/programs/[programId].tsx` (DayCard `onOpenDay` +
`inProgress` only), `apps/mobile/src/components/TodayPrograms.tsx`, `apps/mobile/src/player/components/
{ProgramHome.tsx,ProgramList.tsx}`, `apps/mobile/src/player/usePrograms.ts`, `apps/mobile/CLAUDE.md`
(store v8 line + Layout note).
Facts (grep 18:33): `migrations.ts` `MIGRATIONS = [v1 … v7]`, v7 is `free_workout` (device-local pattern to
copy); `usePlayer.ts` has the phase-change effect keyed on `phaseKey(run.player)` and the `send("start")`
on mount; `play.tsx` latches `{ session, original }` once from `usePrograms().state.active`; `ActiveProgram`
(`ProgramRepo.ts`) = `{ enrollment, program, day }`; `dueToday` keeps `status === "active" && day Some`;
`plannedItems(day)` (exported, `ProgramRepo.ts`) gives `m`; `useStoreVersion` bumps on every store write
(`StoreEvents.changes`) — a `write` through the same `store` re-reads Today behind the player (accepted).
Do: design §3.1–§3.5 exactly: `DaySnapshot` schema, `DayProgressRepo` (`read`/`write`/`clear`),
`ActiveProgram.inProgress`, clears in `complete` (same transaction), `setStatus("abandoned")`, re-enrol;
`restore` in `playerMachine.ts`; `initialRunFrom` + `snapshotOf` in `cues.ts`; Today row and DayCard
"Continue day n" + "k of m done" (§4 copy); `[programId].tsx` DayCard `onOpenDay` (design §1).
Tests: `migrations` v8 applies on a v7 store; `DayProgressRepo` write→read round-trip, `clear`; `restore`
yields `Paused` whose `inner.endsAtMs === nowMs + remainingMs` and `durationSeconds` after resume excludes
the gap (`TestClock`); `snapshotOf` is None on Idle/Done; `complete` deletes the row; `active` returns
`inProgress: Some({ k, m })` only when `snapshot.dayNumber === currentDay` (a stale row → None and deleted).
Done when: `pnpm check` green; ui-check 390 dark: Start day 1 → Done on 2 items → browser back → Today row
reads "Continue day 1" / "2 of m done" (report m) → Programs tab card same → Continue → player is paused at
item 3 with the header position → reload the page on `/programs/play?enrollmentId=` → still item 3 →
Finish workout → sheet → close → Today row back to Start (or absent, completed today) → Feed card has 2 sets.
Shots `docs/design/screens/UI-PROG-{6,7,8}-390-dark.png`. VERIFY in the report: `"start"` is Idle-only in
`playerMachine.ts`; the back gesture on native unmounts the player (no extra write needed).

## PROG-R — review PROG-1 + PROG-3 + PROG-2 (reviewer / opus, time box 8 min)

Scope: the three diffs against `docs/design/programs-player-v2.md` §1–§4 and `.claude/rules/*`.
Check: `isLoaded` lists partition `CatalogEquipment` (test iterates the registry); `entries.length ===
performedItems` invariant tested; `historyFor` writes real `weightKg` only from `entries`, timed items still
`reps = seconds`; 0-kg sets of a `kg` exercise excluded from best/e1RM/volume and never PR; `lastLiveSet`
gone from `TodayRepo.ts` (`grep -n lastLiveSet apps/mobile/src/services`); `complete` clears
`program_day_progress` in the same transaction; snapshot never written on Idle/Done; `restore` is pure
(no `Date`); Today row press and Start button are separate targets; copy sentence case; no `legacy`/`old`/
"remove later" (Amendment 23); `MIGRATIONS` length 8 and no shipped migration edited. Report blocking /
should / nit with file + symbol, and the `pnpm check` tail.

## Amendment 31 paragraph (Lead pastes into `docs/plan.md`; architect does not edit the plan)

31. **Program player: weights, resume, row press** (2026-10-27 18:41, owner, verbatim): "More feedback:
   when I click on active program name I expect go to preview. / There is no ability to track weights for
   exervices? At least when you go to exercise mode. Stats should track weigths, not reps in statistics /
   If you start program, do smth, go back - it should say continue day 1 and progress should not be lost."
   Lead reading: pressing an active program's name (Today row, Programs tab card) opens the current day's
   read-only preview while Start stays the primary action; in the player, reps items of exercises that move
   an external load (derived from the catalog's equipment, no new item field) get kg × reps steppers
   prefilled from the exercise's last logged set, each performed round is logged as a `set` with real
   weight and reps, and the finish summary shows volume; Progress charts weight / e1RM for loaded
   exercises, ignoring 0-kg program sets, and reps or seconds (labelled) for bodyweight and timed ones; an
   unfinished day is kept on the device (`program_day_progress`, store v8, not synced) and surfaces as
   "Continue day n · k of m done" on Today and the program card, the player restoring to the saved phase
   paused (`docs/design/programs-player-v2.md`, `docs/tasks/programs-player-briefs.md`).

## PROG-4 — Dynamic schedule: one day per calendar day (engineer / opus, time box 15 min)

Starts when PROG-2's report has landed (shares `ProgramRepo.ts`, `ProgramHome.tsx`, `ProgramList.tsx`,
`play.tsx`). No shared/worker schema half: `currentDay` stays a stored column (design §6.2 D4).
Files: `apps/mobile/src/services/{ProgramRepo.ts,ProgramRepo.test.ts}`, `apps/mobile/src/player/components/
{ProgramHome.tsx,ProgramList.tsx}`, `apps/mobile/src/player/programDays.ts` (+test; copy helper),
`apps/mobile/app/programs/play.tsx`, `apps/mobile/app/programs/[programId].tsx`, `apps/worker/src/mcp/
programTools.ts` (description string only), `apps/mobile/CLAUDE.md` (Programs line).
Facts (grep 19:09): `ProgramRepo.ts` enrol `currentDay: 1` (:436-438), `complete` rejects `dayNumber !==
currentDay` (:716-719) and writes `currentDay: nextDay` (:756), `dueToday` (:373-387) filters by a completion
with `localDate(completedAt) === today`; `DayCard` (`ProgramHome.tsx:136`) shows `Start day N` or Resume;
`play.tsx` opens any `status === "active"` enrollment; `programTools.ts` `summaryFrom` (:151) returns
stored `currentDay`, `completedDays`, `lastCompletedAt`.
Do: design §6.2–§6.3: `ActiveProgram.doneToday`, `complete` → `StoreError(DayDoneToday)` on a second
completion the same local day, `play.tsx` banner "Done for today. Day N is up tomorrow.", DayCard "Done for
today · Day N tomorrow" + `StatusPill "Done today"` in place of the primary pill, `dueToday` via the flag,
MCP description sentence. Sentence case; no `·`-joined numbers beyond that one line of text (no stats).
Tests: `complete` twice on one local day → second fails `DayDoneToday`, writing nothing; `active` returns
`doneToday: true` after a completion at 23:59 local and `false` at 00:01 next day (`TestClock` +
`DateTime.CurrentTimeZone` layer); a missed day: enrol, advance the clock 3 days, `active` still day 1.
Done when: `pnpm check` green; ui-check 390 dark: complete day 1 → Programs tab card reads "Done for today ·
Day 2 tomorrow" with no Start pill → detail same → open `/programs/play?enrollmentId=` directly → banner →
Today has no Programs due row. Shot `docs/design/screens/UI-PROG-9-390-dark.png`. VERIFY in the report
whether the Programs tab re-reads on focus (design §6.3) and the exact `DateTime` zone API used.

## ADR-0026 amendment paragraph (Lead pastes under `## Amendments` of `docs/adr/0026-programs-via-mcp.md`)

**Amendment (2026-10-27 19:07, owner: "Program should not be tied exactly to the day. It should be dynamic").**
An enrollment's current day is sequential, not calendar-bound: `currentDay` (stored, written only by
`complete`) is the first day without a live completion, a missed calendar day skips nothing, and at most one
program day completes per local calendar day per enrollment (`complete` fails `DayDoneToday`; the Today row,
the Programs tab card, the program detail and the player show "Done for today · Day N tomorrow" instead of
Start). `startedOn` and `schedule` stay descriptive (editor and MCP metadata) and drive no display.
`get_program_progress` keeps its shape; its description states the rule. Design
`docs/design/programs-player-v2.md` §6; task PROG-4.

## PROG-5 — Sets per exercise + 12-week program content (engineer / opus, time box 15 min; Lead may grant 20)

Starts when PROG-3's report has landed (same player files); PROG-2 then starts after PROG-5 (snapshot uses
`stepIndex`, design §7.3). Order: PROG-1 → PROG-3 → PROG-5 → PROG-2 → PROG-4 → PROG-R.
Files — shared/worker half: `packages/shared/src/programs/{Program.ts,Program.test.ts,leanBuild.ts,
leanBuild.test.ts,swaps.ts}`, `packages/shared/src/mcp.ts` (+test), `apps/worker/src/mcp/programTools.ts`
(descriptions). Mobile half: `apps/mobile/src/player/{playerMachine.ts,playerMachine.test.ts,
playerMachine.edge.test.ts,cues.ts,cues.test.ts,mergeDay.ts,mergeDay.test.ts,playerHeader.ts,
playerHeader.test.ts}`, `apps/mobile/src/services/{ProgramRepo.ts,ProgramRepo.test.ts}` (`plannedItems`),
`apps/mobile/src/components/programs/{dayPreviewLines.ts,dayPreviewLines.test.ts,ItemCard.tsx,
programEdit.ts,programEdit.test.ts}`, `apps/mobile/src/player/components/ProgramHome.tsx` (`DayItems`
trailing only).
Facts (grep 19:12): `RepsItem` has no sets field; `ProgramDay.rounds` 1..5 is the only repetition;
`leanBuild.ts` `STRENGTH_ROUNDS = 3`, `strengthDay` one item per move, `BLOCK_1..3` reps 12/15, 10/12, 8/12,
`cardioSeconds` 900/1200/1500; days are JSON text in D1 (`packages/db/src/schema/program.ts:17`) and the
store (`migrations.ts:211`) → no migration; `playerMachine.ts` `enterWork` reads `config.day.items[itemIndex]`,
`progress` returns `{ round, rounds, item, items }`; `mcp.ts:369-383` `ProgramItemInput`, `:386-391`
`ProgramDayInput`; `dayPreviewLines.ts` `itemLine(item)`; `ItemCard.tsx` uses `CompactStepper` for reps/seconds.
Do: design §7.2 schema (decoding default 1), §7.3 `expandDay` + `Step`, machine on steps (`stepIndex`),
`progress`/eyebrow copy, `plannedItems`/`dayDurationSeconds` over steps, preview and editor lines, MCP
input + descriptions, §7.4 content. Sentence case; no author names (`grep -rn -i "labrada" packages apps docs`
→ nothing).
Tests: minimal reps item decodes with `sets: 1`; `sets: 11` fails; `expandDay` of `{ sets: 3, rest 90 }` then a
timed item yields 4 steps with rests 90, 90, 90, <timed's>; machine: start → next ×3 on a 3-set item stays on
exercise 1 (`set` 1→3) then exercise 2; `historyFor` logs 3 `workout_set` rows for one 3-set item;
`dayDurationSeconds` of a push day block 1 ≈ 45 min (state the exact number); registry test: every built-in
day decodes (`CORE30`, `LEAN_BUILD_12`). Changed assertions to name in the report from
`grep -n "toBe\|toEqual\|minutes\|rounds" packages/shared/src/programs/leanBuild.test.ts`.
Done when: `pnpm check` green; ui-check 390 dark: enrol the 12-week program → detail day 1 preview shows
"4 × 10 reps · 120 s rest" rows → Start → header "Exercise 1/7 · Set 1/4" → Done → rest → "Set 2/4" with the
steppers still showing the set-1 weight → Finish → Feed card lists one set per performed step. Shots
`docs/design/screens/UI-PROG-{10,11}-390-dark.png`. VERIFY in the report: `Schema.withDecodingDefaultKey`
on a union member decodes/encodes round-trip in the installed effect version (else `Schema.optionalKey` +
`setsOf(item)` helper, and say so); `swaps.ts` `applySwaps` copies `sets` through.
