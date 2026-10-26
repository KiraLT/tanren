# ADR-0020 — Program item modes: timed holds and cardio, counted reps for everything else

Status: accepted (Lead delegation, plan Amendment 3) · 2026-10-26 · Source: plan Amendment 11 (owner, 22:14)

## Context
Core 30 ships every item as `kind: "timed"` (v2-programs.md §3) although the model already has
`ProgramItem = TimedItem | RepsItem` discriminated on `kind` (`packages/shared/src/programs/Program.ts`),
the machine already runs a reps work phase with `endsAtMs: None` that only `next` ends
(`playerMachine.ts:35`), `cues.itemAmount` already prints "12 reps", `alertFor` already returns `None`
for a reps work phase, and `ProgramRepo.loggedCount` already logs `reps` for a reps item
(`ProgramRepo.ts:117-122`). The catalog marks all 24 `CORE30_CATALOG_IDS` `kind: "timed"`
(`data/core.ts`), and `catalog.test.ts:152` / `core30.test.ts:36` freeze that. The owner: "only some
like cardio, plank should have timing. Most of them should be do X (count)".

## Decision
1. **No schema change.** The discriminant stays `kind: "timed" | "reps"` with `seconds` / `reps`
   (not a nested `target`); `Reps` is the shared brand from `common.ts:69`. No `perSide` field:
   alternating movements (bird dog, bicycle crunch, heel touch, plank shoulder tap, plank hip dip,
   scissor kick, dead bug) count **total** reps and every Core 30 count is even, so "12 reps" is 6 a
   side; unilateral holds (side plank) stay one timed item, sides switched by the user at will.
2. **Classification lives in the catalog `kind`**, one source of truth: timed = isometric holds
   (plank, side-plank, hollow-hold, superman-hold, leg-raise-hold, bear-crawl-hold) and continuous
   rhythm/cardio moves (mountain-climber, high-knees, flutter-kick); reps = every movement with a
   distinct start and end position per repetition (the other 15 Core 30 ids: dead-bug, crunch,
   reverse-crunch, lying-leg-raise, v-up, bicycle-crunch, russian-twist, heel-touch, plank-hip-dip,
   plank-shoulder-tap, glute-bridge, bird-dog, scissor-kick, sit-up, toe-touch-crunch). `data/core.ts`
   flips those 15 to `kind: "reps"`; the Library's Kind facet and `CatalogDetail` follow for free.
   `core30.ts` derives each item's mode from `findCatalogExercise(id).kind` (`distance` → timed).
3. **Counts from the phase's work seconds**, `REPS_BY_WORK_SECONDS`: 25 s → 12, 30 → 16, 35 → 18,
   40 → 20, 45 → 22, recovery 75 s → 20. `SECONDS_PER_REP` 3 → 2 (a floor-core rep is ~1 s up, 1 s
   down), so the estimate of a reps item is 24/32/36/40/44 s ≈ the seconds it replaces and the
   12–18 min bound of `core30.test.ts` holds (day 1 = 15.0 min, day 29 = 17.5, day 30 = 17.6).
4. **Player, reps work phase**: the clock slot shows the count as the numeral (`Text variant="clock"`,
   64/68, label "12 reps") with a `caption` "reps" under it, the ring is absent, and a full-width
   `Button size="xl"` (64) "Done" sends `next`; no auto-advance; Done is `disabled` while Paused.
   Rest after Done is timed as today. Timed items are unchanged. Cues are unchanged: the "work" beep
   marks the start, no deadline alert exists for a reps work phase, and the rest alert already reads
   "Rest over — Crunch, 16 reps" (`alertFor`).
5. **Live Activity** (ADR-0012, gated, not built): the port is `PhaseAlerts.schedule(at, text)`;
   a reps work phase schedules nothing, so no payload change is needed when it lands.
6. **Rows**: `programEnrollment` / `programDayCompletion` carry day number and wall-clock duration
   only, never per-item data, so they are unaffected. Logged sets keep ADR-0007 Q4: a reps item logs
   `reps = count`, a timed item logs `reps = seconds`, both `weightKg 0`; Feed and Progress derive
   from set rows and need no change.

## Consequences
Owner-visible: Core 30 reads "Dead Bug 12 reps · Plank 25 s" on the day list and the player shows a
big count with Done. Tests to rewrite: `catalog.test.ts:152` (kind ∈ {timed, reps} per the rule),
`core30.test.ts:36` (item kind = catalog kind, counts from the table), `Program.test.ts:54`
(`SECONDS_PER_REP`). Library users see 15 core exercises move from "Timed" to "Reps" (correct).

## Not decided
Per-side counts or a "switch sides" mid-hold cue; "reps actually done" (−/+) on the Done screen;
programs beyond Core 30; speech cues (none exist today, haptic + beep only).

## Alternatives considered
- `target: { _tag }` nested union: a schema migration of static data for no behavioural gain.
- Classification table inside `core30.ts` only: leaves the catalog calling a crunch "timed" in the
  Library; two truths to keep aligned.
- Keep `SECONDS_PER_REP = 3` and relax the 12–18 min test to 20: hides a real tempo error (day 30
  would read 20 min) instead of fixing the estimate.
