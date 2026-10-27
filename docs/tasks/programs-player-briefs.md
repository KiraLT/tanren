# Program player v2 briefs (PROG-D2 → Lead, 2026-10-27 18:45)

Design `docs/design/programs-player-v2.md` (§ numbers below). No D1 change, no MCP change (D1 of the
design: weighted is derived from the catalog). Store migration **v8** (after FREE-1's v7).
Permissions line for every brief: write only the files listed; no `git`, no `pkill`, no cloud calls;
start wrangler/expo by pid file per `apps/mobile/CLAUDE.md` Commands. Load `expo-mobile` +
`effect-conventions`.

Order and hand-offs (file conditions, not commits):
1. **PROG-1** starts now (touches no FREE-1 / CONFIRM-2 file).
2. **PROG-3** starts when FREE-1's files are final (it edits `TodayRepo.ts`); may run beside PROG-1.
3. **PROG-2** starts when PROG-3's report has landed AND CONFIRM-2's `app/programs/*.tsx` are final
   (it edits `play.tsx`, `[programId].tsx`, `cues.ts`, `usePlayer.ts`, `ProgramRepo.ts`, all also PROG-3's).
4. **PROG-R** after PROG-2, before the commit.

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
