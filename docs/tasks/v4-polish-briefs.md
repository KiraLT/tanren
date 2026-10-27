# Pre-written briefs: polish follow-ups
Status: PLAN-LOG waits for polish round 5 to be accepted (r5 owns `planFormat.ts`, `PlanWeek.tsx`, `plan.tsx` until
then; `src/services/**` was frozen for r5). Facts grep-verified by the Lead 2026-10-27 10:15.

## Brief: PLAN-LOG — logged sets and volume on the Plan week summary
Role: engineer   Model: sonnet   Step: polish (plan Amendment 7; REV-POLISH should-fix, r5 interim item 1)   Task sheet Log: docs/tasks/step-2.md
Time box: 15 min (`date` at start; at the box stop and report) · Report ≤ 40 lines

### Goal
The Plan week header's stat row shows "Planned sets / Planned volume" (r5). Under each planned figure the week's
*logged* figure appears when the week has logged sets ("Planned 24 · Logged 18"); weeks with nothing logged show
the planned figures alone. The data comes from the local store, offline, through `PlanWeekRepo`.

### Read first
- CLAUDE.md, `apps/mobile/CLAUDE.md`, skills `expo-mobile`, `effect-conventions`; `docs/design/ui-polish.md` §Plan 3
  (week summary as a three-up stat row).
- `src/services/PlanWeekRepo.ts` (`Context.Service` at line 166; exports `PlanWeekView`, `PlannedSessionStatus`) and its
  test; `src/hooks/usePlanWeek.ts` (`PlanWeekState` Loading/Empty/Failed/Ready at lines 15–19, `toPlanWeekState`);
  `src/components/exerciseStats.ts:13` (`loggedVolumeKg(loggedSets)`), `:28` (Volume label via `formatVolume`);
  `src/components/planFormat.ts` (week summary figures, "Planned volume … of the done sessions" at line 181 as of
  e34ca1e; r5 may have moved `formatVolume` to `progress/progressFormat.ts` — grep before editing);
  `src/components/PlanWeek.tsx`, `app/(tabs)/plan.tsx`; how Today links sessions to plans: `grep -n plannedSessionId
  src/services/TodayRepo.ts src/services/LocalStore.ts` (paste the output in the report).

### Scope
In: `src/services/PlanWeekRepo.ts` (+test), `src/hooks/usePlanWeek.ts` (+test if one exists), `src/components/planFormat.ts`
(+test), `src/components/PlanWeek.tsx`, `app/(tabs)/plan.tsx`.
Out: `src/services/TodayRepo.ts`, `SyncEngine.ts`, `src/ui/**` (use `StatRow` as is), worker, shared.

### Decisions already made
- `PlanWeekView` gains `logged: { readonly sets: number; readonly volumeKg: number }` per planned session (0/0 when
  nothing logged) computed in `PlanWeekRepo` from non-deleted local `set` rows of sessions whose `plannedSessionId`
  matches; volume = `loggedVolumeKg` semantics (weight × reps; bodyweight = 0 kg counts 0 volume). One query per
  week load, not one per session.
- The summary line: planned figure as today; the logged figure as a second `caption` line "Logged 18 · 1 240 kg"
  only when the week's logged sets > 0 (designer's form from r5's PASS; keep the tile heights unchanged).
- `Option` for absence only where the type carries it; `0` sets is a value, not `None`.

### Done when
- [ ] Repo test: a week with two planned sessions, one with 3 logged sets (2 × 100 kg × 5 + 1 × 0 kg × 10) → sets 3,
      volumeKg 1000; soft-deleted set excluded; a week with none → 0/0 everywhere and no "Logged" line rendered.
- [ ] `planFormat` tests for the new line (present / absent).
- [ ] `ui-check` 390 light: Plan with the seeded month shows the logged line under the planned figures; paste the
      stat row's bounding box and its neighbours' (prev.bottom ≤ new.top; new.bottom ≤ next.top) and open the PNG;
      1280 too (Plan is a Columns screen).
- [ ] `pnpm -F @tanren/mobile check` green (paste tail), root `pnpm check` if nothing else is live.
Forbidden: `git commit|push|reset|checkout`, `rm -r*`, `wrangler *`, `eas *`, dependency or root-config changes, files outside In.

## Queued nits for the next polish round (Lead, 2026-10-27 11:05)
- AppBar eyebrow at 1280: the 28 px ring slot stays reserved at progress 0, so the eyebrow starts at x 148 while the title starts at x 120 (shooter probe, UI-P5-play-1280-light); at 390 both are flush. Designer decides: drop the slot at 0 (text shifts 28 px when progress starts) or keep it and indent the title the same.
- Landing light scheme: illustration amber vs rust primary (one colour set, LAND-R item 3); eyebrow repeats the name (item 4).
- Landing tagline at 390 (LEGAL-DV nit b, 2026-10-27): 62 ch at 13/18 ≈ 390 px > 358 column, wraps with a one-word orphan "holds." → maxWidth ≈ 300 or two balanced ≈ 31-ch lines (designer to pick).
