# Program player v2: row press → preview, weights per set, resume an unfinished day

Status: accepted (Lead decision under plan Amendment 3; owner ask 2026-10-27 18:41, Amendment 31) ·
Architect: PROG-D2 · Builds on `v2-programs.md` (§4 player, §5 logging), `programs-mcp.md`, ADR-0020,
ADR-0026. Briefs: `docs/tasks/programs-player-briefs.md`.

Owner (verbatim): "when I click on active program name I expect go to preview. / There is no ability
to track weights for exervices? At least when you go to exercise mode. Stats should track weigths, not
reps in statistics / If you start program, do smth, go back - it should say continue day 1 and progress
should not be lost."

## 0. Three decisions

| # | Decision | Why |
|---|----------|-----|
| D1 | **"Weighted" is derived from the catalog**, never stored on the item: `isLoaded(catalogId)` = the entry's `equipment` intersects `LOADED_EQUIPMENT` (free weights, machines, cables; §2). No `ProgramItem` field, no `write_program` change, no D1 migration. | `CatalogExerciseFields.equipment` already says "Empty = bodyweight" (`packages/shared/src/catalog/CatalogExercise.ts`); a flag would be a second copy of that fact and Claude would have to set it right on every `write_program`. |
| D2 | **Progress is device-local**: store table `program_day_progress`, migration v8 (after FREE-1's v7), not synced, no D1 change. | It is a player's live clock (phase, remaining ms) rewritten every few seconds; sync is batched by minutes and two devices' clocks would race. The completed day already syncs through `session`/`workout_set` and the enrollment. A workout is one phone in one gym. Revisit (D1 migration) only if the owner asks to continue a day on another device. |
| D3 | **Row press target** = the current day's read-only preview `/programs/[programId]/day/[n]` (P-M5), `n` = `enrollment.currentDay`. Start / Continue stays the only primary action. | The preview already lists items, mode, rest and stats; a second "program detail" hop would be one tap further from what the owner asked to see. |

## 1. Row press → preview (PROG-1)

Surfaces whose title names an active program:

| Surface | File · component | Today | Change |
|---------|------------------|-------|--------|
| Today "Programs due" row | `src/components/TodayPrograms.tsx` `ListRow` | no `onPress`, trailing `Button size="sm" label="Start"` | `onPress` → `router.push({ pathname: "/programs/[programId]/day/[n]", params: { programId: entry.program.id, n: String(entry.enrollment.currentDay) } })`, `chevron` **off** (the trailing slot holds the button), `accessibilityLabel` "<name>, Day n · ≈ m min, opens the day preview". The Start button keeps its own `onPress`; `ListRow` renders `trailing` outside the pressable title area (VERIFY by `grep -n "Pressable" apps/mobile/src/ui/ListRow.tsx`; if the whole row is one Pressable, the button's own `onPress` wins because RN delivers the touch to the innermost responder — state the check in the report). |
| Programs tab "Active" card | `src/player/components/ProgramHome.tsx` `DayCard` (used by `ProgramList.tsx` `ActiveSection` and `app/programs/[programId].tsx`) | ring + name + "Day n of m" line, not pressable | new optional prop `onOpenDay?: () => void`; when given, the header row (ring + texts) is a `Pressable` with `accessibilityRole="button"`, label "Preview day n of <name>", `hitSlop` so the box is ≥ 44 tall (row content is 40 = `ProgressRing size="md"`; VERIFY `sizes.ringMd` in `src/ui/tokens.ts`). `app/(tabs)/programs.tsx` passes it (PROG-1); `app/programs/[programId].tsx` passes it in PROG-2 (CONFIRM-2 owns that file until it lands). |

Width at 390 (ListRow in `ListGroup`, 16 gutters → 358 content, row padding 16 each side → 326): title
column `flex: 1` ≈ 326 − 8 gap − Start button (`sm` = 36 high, ≈ 72 wide) = ≈ 246 for two lines of
"Lean build" / "Day 3 · ≈ 15 min"; nothing is added to the row, so no overflow. Height: two-line
`ListRow` = 22 + 20 + 2·8 + 2 = 60 ≥ 44. The row press and the button are ≥ 44 apart horizontally
(button width ≥ 44 by `buttonTouchHeight`, `src/ui/controls.ts`).

## 2. Weights in the player (PROG-3)

### 2.1 `isLoaded` (shared, pure)

`packages/shared/src/catalog/loaded.ts` (exported from `catalog/index.ts`):

```ts
export const LOADED_EQUIPMENT: ReadonlySet<CatalogEquipment> = new Set([
  "barbell", "dumbbell", "kettlebell", "trapBar", "ezBar", "plate", "landmine", "medicineBall",
  "smithMachine", "legPress", "hackSquat", "legExtension", "legCurl", "chestPressMachine", "pecDeck",
  "shoulderPressMachine", "hipAbductorMachine", "calfRaiseMachine", "abCrunchMachine",
  "assistedPullUpMachine", "cable", "latPulldown", "seatedRowMachine",
])
/** True when the exercise moves an external load (its sets carry a real `weightKg`). */
export const isLoadedEquipment = (equipment: ReadonlyArray<CatalogEquipment>): boolean
/** By catalog id over the bundled catalog; `false` for an unknown id. */
export const isLoaded = (catalogId: CatalogId): boolean
```

Excluded on purpose: `bench`, `rack`, `box`, `preacherBench`, `backExtensionBench`,
`gluteHamDeveloper` (supports; a loaded exercise on them also lists the bar/dumbbell),
`pullUpBar`, `dipStation`, `band`, `abWheel`, `foamRoller`, `suspensionTrainer`, `cardioMachine`.
Test: every literal of `CatalogEquipment` is in exactly one of the two lists (registry-driven,
`.claude/rules/tests.md`); `isLoaded` of a known barbell entry true, of a plank id false.

A program item is **weighted** iff `item.kind === "reps" && isLoaded(item.catalogId)`. Timed items
and bodyweight reps items keep today's Done / countdown UI unchanged.

### 2.2 Player state (`src/player/cues.ts` `PlayerRun`)

```ts
export interface SetEntry { readonly weightKg: number; readonly reps: number }
export interface PlayerRun {
  …existing…
  /** One per performed item-round, in `performedItems` order; `None` for timed / bodyweight. */
  readonly entries: ReadonlyArray<Option.Option<SetEntry>>
  /** The steppers' current value for the item being worked; `None` unless weighted. */
  readonly draft: Option.Option<SetEntry>
}
export type RunEventTag = PlayerEventTag | "adjust"
// `adjust` carries { weightKg, reps } and only replaces `draft` (no `nowMs` use).
```

`reduceRun`: entering `Working` on a weighted item sets `draft` to the prefill (§2.3); `next` /
deadline out of `Working` appends `draft` to `entries` (so `entries.length === performedItems`
always; test pins it); `previous` within `PREVIOUS_GRACE_MS` drops the last entry with the
item-round. `playerMachine.ts` is untouched (the machine stays time-only).

Steppers: `stepWeight` (± 2.5, min 0) and `stepReps` (± 1, min 1) from `src/components/stepMath.ts`;
`Stepper` from `src/ui` (`label`, `valueText`, `unit`, `onDecrement`, `onIncrement`, `size`).

### 2.3 Prefill

Per item-round, first match wins: (1) the entry of the same `catalogId` in an earlier round of this
run; (2) the exercise's last live set (`HistoryRepo.lastSet`, below); (3) `{ weightKg: 0, reps: item.reps }`.
Reps are prefilled from the item's target when (2) is used (`{ weightKg: last.weightKg, reps: item.reps }`):
the program sets the rep target, history sets the load.

`HistoryRepo` gains `readonly lastSet: (id: ExerciseId) => Effect.Effect<Option.Option<WorkoutSet>, StoreError>`,
the query now private in `TodayRepo.ts` `lastLiveSet` (`ORDER BY ws."loggedAt" DESC LIMIT 1`, live
session and set). `TodayRepo` calls `HistoryRepo.lastSet` and `lastLiveSet` is deleted (one query site,
Amendment 23). VERIFY the layer order in `src/services/runtime.ts` provides `HistoryRepo` to `TodayRepo`.
`ProgramRepo` gains `readonly prefill: (catalogIds: ReadonlyArray<CatalogId>) => Effect.Effect<ReadonlyArray<{ readonly catalogId: CatalogId; readonly last: Option.Option<SetEntry> }>, StoreError>`
= `ExerciseLink.ensure(catalogId)` → `HistoryRepo.lastSet` for the loaded ids only (`ensure` creates the
`exercise` row when missing; that row is needed for logging anyway). `usePlayer` loads it once per
`session.day` and passes it to `reduceRun` via `PlayerConfig.prefill` (a `ReadonlyMap<CatalogId, SetEntry>`).

### 2.4 Logging (`ProgramRepo.complete`)

`CompletionInput` gains `readonly entries: ReadonlyArray<Option.Option<SetEntry>>` (positional with
`performedIds`); `FinishedRun` carries the same. `historyFor` (today: `WeightKg.makeEffect(0)` once for
every set, `reps: Reps.makeEffect(loggedCount(planned.item))`) becomes per set:
`Option.match(entry, { onNone: () => ({ weightKg: 0, reps: loggedCount(item) }), onSome: (e) => e })`.
Timed items keep `reps = seconds` (ADR-0007 Q4, ADR-0020). `CompletionResult.Saved` gains
`volumeKg: number` (Σ weightKg·reps over `entries`, pure) and `sets: number` (= `performedItems`).

### 2.5 Finish summary (`PlayerView.tsx` `CompletionSheet`)

Two stat tiles side by side (never a `·` text row): **Duration** `14:32` and **Volume** `1 240` with
unit `kg` (muted "No load" when `volumeKg === 0`), each a `Card` with `Text variant="headline" tabular`
numeral, `variant="caption"` label. At 390 inside the sheet (358 wide): 2 × 171 + 16 gap = 358.
Reference the owner judges against: the Strava activity stats row.

### 2.6 Progress / stats — current behaviour (grep 18:33)

- `apps/mobile/src/services/ProgramRepo.ts` `historyFor`: `const weightKg = yield* WeightKg.makeEffect(0)` for every program set; `reps: Reps.makeEffect(loggedCount(planned.item))` where `loggedCount` (same file, after `workSeconds`) returns **seconds** for a timed item. So a dumbbell row done in a program is stored `0 kg × 10` and a 30 s plank as `0 kg × 30`.
- `packages/shared/src/activity.ts` `epley1Rm`: `weightKg <= 0 → 0`; `SetScore`: "Bodyweight (0 kg): reps decide" → `markPrs` marks the program's 0-kg set a **PR** whenever no heavier set exists, and a plank's "30 reps" beats "25 reps".
- `apps/mobile/src/components/progress/progressFormat.ts` `formatSetText`: `weightKg <= 0 → "N reps"`; `weekSeries`: reps per week when every week's volume is 0; `e1RmText`: `None` for 0 kg; `weekBarsHeading`: "Reps, last 8 weeks". `HistoryRepo.ts` `WeekBucket.volumeKg` "0 for bodyweight work".
- Net effect the owner saw: Progress "tracks reps" for every program exercise, and timed holds read as reps.

### 2.7 Progress / stats — after PROG-3

`ExerciseHistory` / `ExerciseSummary` gain `readonly unit: "kg" | "reps" | "s"` from the exercise's
catalog link: `Option.flatMap(exercise.catalogId, findCatalog)` → `kind === "timed"` ⇒ `"s"`;
`isLoadedEquipment(equipment)` ⇒ `"kg"`; else (bodyweight reps, or no link) `"reps"`.

| unit | `best` / `bestE1Rm` / `e1RmTrend` / `markPrs` | `weeks` | copy |
|------|-----------------------------------------------|---------|------|
| `kg` | over sets with `weightKg > 0` only (0-kg sets from pre-PROG-3 program days or an unweighted round are **not data points**); `None` when none | `volumeKg` over `weightKg > 0` sets; chart kg | "Volume, last 8 weeks", best "80 kg × 8 · e1RM 101.3 kg"; a 0-kg set in `recent` reads "10 reps · no load", never PR |
| `reps` | unchanged (reps decide) | `reps` | "Reps, last 8 weeks", "12 reps" |
| `s` | best = max `reps` (seconds); no e1RM | Σ seconds per week | "Seconds, last 8 weeks", "45 s"; `recent` rows "45 s" |

`buildHistory`/`summarize` take `unit` and filter before `bestSet`/`markPrs`; `progressFormat.ts`
`weekSeries(weeks, unit)` and `formatSetText(weightKg, reps, unit)` take it; `rowDetail.ts` unchanged.
`SeriesUnit` becomes `"kg" | "reps" | "s"`. Tests to change (name the assertion in the brief):
`progressFormat.test.ts` cases on `weekSeries` bodyweight detection (now by `unit`), `formatSetText`
"12 reps"; `HistoryRepo.test.ts` best-set expectations that relied on a 0-kg PR.
MCP `get_exercise_history` (`packages/shared/src/activity.ts` summary) is out of scope here; VERIFY
whether it marks 0-kg PRs and list it in the report as a follow-up question, do not change it.

## 3. Resume an unfinished day (PROG-2)

### 3.1 Store (migration v8, `src/store/migrations.ts`, after v7)

```sql
CREATE TABLE IF NOT EXISTS "program_day_progress" (
  "enrollmentId"   TEXT PRIMARY KEY NOT NULL,
  "dayNumber"      INTEGER NOT NULL,
  "snapshot"       TEXT NOT NULL,      -- JSON of DaySnapshot (below), Schema-encoded
  "updatedAt"      TEXT NOT NULL       -- ISO, device clock
)
```

Device-local like `free_workout` (v7): no `userId`, no sync columns, never pushed (D2).

### 3.2 Contract: `src/services/DayProgressRepo.ts` (new, `Context.Service`, `static layer`)

```ts
export const DaySnapshot = Schema.Struct({
  dayNumber: DayNumber,
  /** Item-rounds whose work finished; `performedIds`/`entries` are positional with it. */
  performedItems: Schema.Int,
  performedIds: Schema.Array(CatalogId),
  entries: Schema.Array(Schema.Option(Schema.Struct({ weightKg: Schema.Number, reps: Schema.Int }))),
  /** Wall-clock run accounting (playerMachine `RunClock`): elapsed = savedAtMs − startedAtMs − pausedMs. */
  startedAtMs: Schema.Number,
  pausedMs: Schema.Number,
  savedAtMs: Schema.Number,
  /** The open phase; restored as `Paused` with `remainingMs` (None for a reps item). */
  phase: Schema.Struct({
    tag: Schema.Literals(["Working", "Resting"]),
    round: Schema.Int, itemIndex: Schema.Int,
    remainingMs: Schema.Option(Schema.Number),
  }),
})
export interface DayProgressRepoShape {
  readonly read: (id: ProgramEnrollmentId) => Effect.Effect<Option.Option<DaySnapshot>, StoreError>
  readonly write: (id: ProgramEnrollmentId, snapshot: DaySnapshot) => Effect.Effect<void, StoreError>  // upsert
  readonly clear: (id: ProgramEnrollmentId) => Effect.Effect<void, StoreError>
}
```

Writers: `usePlayer` calls `write` in the existing phase-change effect (keyed on `phaseKey`) and on
`pause`, while `run.player` is `Working | Resting | Paused`; never on `Idle` or `Done`.
`clear` is called (a) by `ProgramRepo.complete` in its transaction (one `DELETE … WHERE "enrollmentId" = ?`
beside the enrollment update, so a completed day can never show "Continue"), (b) by `ProgramRepo.setStatus`
when the new status is `abandoned`, (c) by `ProgramRepo` when an enrollment row is deleted or re-enrolled.
A **paused** enrollment keeps its snapshot (Resume → Continue).

### 3.3 Read side: `ActiveProgram.inProgress`

```ts
export interface ActiveProgram {
  …existing…
  /** Some when a snapshot exists for `enrollment.currentDay`: "k of m done". */
  readonly inProgress: Option.Option<{ readonly performedItems: number; readonly totalItems: number }>
}
```

`totalItems = plannedItems(day).length` (rounds × items). `active` / `dueToday` read the snapshot in the
same `Effect` (`DayProgressRepo.read`), and a snapshot whose `dayNumber !== currentDay` is treated as
`None` and cleared. Consumers of `ActiveProgram` to update: `grep -rln "ActiveProgram" apps/mobile`
(TodayPrograms, ProgramList, ProgramHome, play.tsx, usePrograms, tests).

### 3.4 Restore (`cues.ts`, `playerMachine.ts`)

`playerMachine.ts` gains `export const restore = (config, snapshot: DaySnapshot, nowMs): Paused` building
`inner` = `Working | Resting` with `phaseStartMs: nowMs`, `endsAtMs: Option.map(remainingMs, r => nowMs + r)`
(`Resting` always Some), `startedAtMs`, `pausedMs` copied; `remainingMs` copied; `pausedAtMs: nowMs`.
Resuming adds the paused interval as today (`pausedMs` grows), so `durationSeconds` excludes the time
away. `cues.ts` gains `initialRunFrom(config, snapshot, nowMs): PlayerRun` (`performedItems`, `entries`,
`startedAtMs: Some`) and `snapshotOf(run, nowMs): Option<DaySnapshot>` (`None` on Idle/Done).
`play.tsx` reads `DayProgressRepo.read(enrollmentId)` once when latching; `usePlayer(session, snapshot)`
uses `initialRunFrom` when Some. `send("start")` stays a no-op on a non-Idle state (VERIFY:
`grep -n '"start"' apps/mobile/src/player/playerMachine.ts`, the Idle-only branch).

### 3.5 State matrix

Values: `S` = snapshot for (enrollmentId, currentDay) exists (writer: `usePlayer` → `DayProgressRepo.write`;
removed by §3.2 clears), `k` = `snapshot.performedItems`, `m` = `plannedItems(day).length`.

| Surface | Row | Condition in | Keeps neighbours out | Shows |
|---------|-----|--------------|----------------------|-------|
| Today row / DayCard | Start | status `active`, day Some, `S` false | `S` true → Continue; status `paused` → Resume (existing) | title, "Day n · ≈ m min", **Start** |
| Today row / DayCard | Continue | status `active`, day Some, `S` true | `k ≥ m` cannot persist: Done is never written and `complete` clears; a failed save keeps the last Working/Resting snapshot (k < m) | title, "Day n · k of m done", **Continue** (`accessibilityLabel` "Continue day n of <name>") |
| DayCard | Resume | status `paused` | `active` → Start/Continue | existing Resume pill; snapshot kept |
| Today list | absent | `dueToday` filter: `status === "active" && day Some` and not completed today (`ProgramRepo.ts` `dueToday`) | — | — |
| Player | Fresh | latched, snapshot None | — | "Go" → `start` (existing) |
| Player | Restored | latched, snapshot Some | — | `Paused` at the saved phase, transport shows Resume, header "Round r/… · Exercise i/…", steppers hold `entries`/`draft` |
| Player | Done | `run.player._tag === "Done"` | — | CompletionSheet (§2.5); `completeDay` → `complete` clears `S` |
| Player | Save failed | Done + `completion.Failed` | — | existing Retry; `S` stays (last phase) so the row still says Continue — documented, acceptable |

Leaving the player (`onClose`, back gesture, app kill, web reload) writes nothing extra: the last
phase-change write is the state. Loss window: at most the time since the last phase change inside the
current phase (a few seconds of a hold), never a performed item-round.

## 4. Copy (sentence case, `.claude/rules/react.md`)

"Continue day 3" (button, Today row `sm`, DayCard `lg`), "3 of 21 done" (subtitle/line),
"Volume", "Duration", "No load", "Seconds, last 8 weeks", "no load" (recent row suffix).

## 5. Not decided here

- Editing a logged program session's weights afterwards (Feed/activity edit): out of scope.
- A per-item target weight on `ProgramItem` for Claude to prescribe loads: not now; the prefill from
  history covers the owner's "at least when you go to exercise mode". Open question for the Lead.
- Two-device resume (D2) and MCP `get_exercise_history` PR semantics for 0-kg sets (§2.7 VERIFY).
