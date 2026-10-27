# Weight entry v2 briefs (WT-D → Lead, 2026-10-27 20:07)

Design `docs/design/weight-entry.md` (§ numbers below). No D1 change, no MCP change (D2: the step
override is device-local, store migration **v9** after v8). Permissions line for every brief: write
only the files listed; no `git`, no `pkill`, no cloud calls; start expo by pid file per
`apps/mobile/CLAUDE.md` Commands. Load `expo-mobile` + `effect-conventions`.
Order: WT-1 → WT-R → commit. No WT-0 (no migration outside the device store).

## WT-1 — Tap to type + step per exercise (engineer / opus, time box 20 min)

Files: `apps/mobile/src/ui/Stepper.tsx`, `apps/mobile/src/components/stepMath.ts` + `stepMath.test.ts`,
`apps/mobile/src/services/StepRepo.ts` (new) + `StepRepo.test.ts` (new), `apps/mobile/src/hooks/useStep.ts`
(new), `apps/mobile/src/store/migrations.ts` + `migrations.test.ts` (v9 only, append), `apps/mobile/src/services/runtime.ts`
(add the layer), `apps/mobile/src/components/ExercisePage.tsx`, `apps/mobile/src/player/components/PlayerView.tsx`.
Facts (grep 20:04): `stepWeight(current, direction)` uses `WEIGHT_STEP_KG = 2.5` (`stepMath.ts`), callers
`ExercisePage.tsx` `onDecrement/onIncrement` and `PlayerView.tsx` `onAdjust({...draft, weightKg: stepWeight(...)})`;
`Stepper` numeral slot is a `View accessibilityRole="adjustable"` (`Stepper.tsx`) — becomes the button of §1;
`findCatalogExercise(id): Option<CatalogExercise>` and `isLoaded` in `packages/shared/src/catalog/index.ts`,
`CatalogExercise.equipment` ≤ 3 literals; `LOADED_EQUIPMENT` in `catalog/loaded.ts`; `MIGRATIONS = [v1..v8]`
(`migrations.ts`); `ToggleChip` props `label, selected, onPress, compact, hitSlop` (`ui/ToggleChip.tsx`);
`gutter.phone = 16` (`ui/tokens.ts`); `type.numeral` 72/76. Player key: `roundId` in `player/cues.ts` (§3).
Do: §1 (`onCommit`, `inputMode`, native Done button, Escape cancel), §1 parsers, §2 `stepKgFor` +
`stepWeight(..., stepKg)` + `StepRepo` + `useStep` + the Step chip row, §3 both surfaces.
Tests: `stepKgFor` registry test (every `LOADED_EQUIPMENT` literal in exactly one row; barbell 2.5, dumbbell 2,
cable 5, `[]` 2.5); parsers (`"22,5"`→22.5, `"22.6"`→22.5, `"900"`→500, `""`→prev, `"abc"`→prev, reps `"0"`→1,
seconds `"7"`→5); `effectiveStep` precedence (override wins over equipment); `StepRepo` set/get/clear via
the memory store harness; existing `stepMath.test.ts` "steps by 2.5 kg" assertions `82.5`/`77.5` keep their values
(third argument defaults to 2.5).
Done when (one checkbox per §4 row): [ ] Idle — numeral has role button + label "Weight 20 kilograms, tap to edit"
(snapshot); [ ] Editing — tap value → field focused with text selected; [ ] Invalid draft — type `abc`, Enter →
previous value shown; [ ] Step default — barbell exercise: `+` → +2.5, chip reads "Step 2.5 kg"; cable exercise:
`+` → +5; [ ] Step override — pick 1.25 on the barbell → `+` → 21.25, chip "Step 1.25 kg · custom", survives reload,
pick 2.5 → row cleared. ui-check flow at 390 dark (signed-in store, seed per `docs/design/reviews/UI-NUTRI-e2e.md`):
Today → exercise page → tap value → type `22.5` → Enter → "22.5 kg" → `+` → "25 kg" (barbell); the player's weighted
item does the same; shots `UI-WT-1-idle.png`, `UI-WT-1-editing.png`, `UI-WT-1-step.png` to the review gallery;
`pnpm check` green, output in the report. VERIFY in the report: RNW `TextInput` `inputMode` prop name against installed
`react-native-web` types; pressing `+` while editing blurs → commits before stepping (one line); keyboard overlap on
the owner's phone is noted as "not verifiable headless".

## WT-R — Review WT-1 (reviewer / sonnet, time box 8 min)

Scope: WT-1's files against `docs/design/weight-entry.md` §1–§4 and `.claude/rules/react.md`. Blocking: a `throw`,
`let`, `as`, an all-caps label, a < 44 target on the Step button or chips, an override that leaks into sync
(`grep -n exercise_step apps/mobile/src/services/sync*`), a parser that accepts NaN, a shipped migration edited
(v1–v8 diff must be empty). Should: the `adjustable` role left on a tappable numeral; a default-step chip that
writes a row instead of `clear`. Report in the reviewer format with `pnpm check` output.
