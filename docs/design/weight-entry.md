# Weight entry v2: tap to type, steps per exercise (WT-D, 2026-10-27 20:05)

Plan Amendment 34. Forge system (`ui-direction-final.md`: big round ±, D layout). No D1 change, no wire
change, no MCP change (D2 below). Store migration **v9** (after PROG-2's v8, `src/store/migrations.ts`).

## 0. Decisions

- **D1 Direct entry = inline field, both platforms.** Tapping the numeral turns it into a `TextInput`
  in the same slot, ± still around it (option a). Reasons: one tap, no new sheet primitive, the ±
  stay for the owner's "adjustments"; a native picker wheel (c) would hold 2 000 loads (0–500 × 0.25)
  and web has no wheel; a bottom sheet (b) is two taps and hides the exercise. Rejected
  owner idea "native drop-down": a `<select>` of 2 000 options is unusable and does not exist on native.
- **D2 Step override lives on the device** (option i): table `exercise_step`, never synced. Reasons:
  the step is a control preference, not training data (nothing for Claude to read); the owner logs
  on one phone; zero wire change, so no expand → migrate → deploy → contract (Amendment 23). Cost
  accepted: the override is lost on a new device (the equipment default returns). If it must
  roam later, it is one nullable `step_kg` column on `exercise` (D1 0011, `ExerciseFields`,
  `ExercisePatch`, store v10) — not now.
- **D3 Step by equipment** from the catalog entry (`findCatalogExercise(catalogId)` →
  `equipment`), rule table §2. An exercise without a catalog link or not loaded keeps 2.5.

## 1. Direct entry (Stepper primitive, `apps/mobile/src/ui/Stepper.tsx`)

`StepperProps` gains `onCommit?: (raw: string) => void` and `inputMode?: "decimal" | "numeric"`
(default `"decimal"`). When `onCommit` is set the numeral slot is a `Pressable`
(`accessibilityRole="button"`, `accessibilityLabel="{label} {valueText} {unit}, tap to edit"`, e.g.
"Weight 20 kilograms, tap to edit" — `unit` long form passed by the caller: `kilograms`, `reps`,
`seconds`). On press: `editing = true`, the slot renders a `TextInput` with
`style={type.numeral}` (72/76, `tabular-nums`, `textAlign: "center"`, same `glow` colour via
`colors`), `defaultValue={valueText}`, `selectTextOnFocus`, `autoFocus`,
`keyboardType="decimal-pad"` (`"number-pad"` when `inputMode="numeric"`), web `inputMode` likewise,
`returnKeyType="done"`, `onSubmitEditing` and `onBlur` → `onCommit(text)`, `editing = false`;
Escape (web `onKeyPress` key `Escape`) → cancel, previous value. Native only: the caption row shows a
`Button size="sm" label="Done"` (the decimal pad has no return key on iOS) that blurs the field.
Height unchanged: 76 numeral + 4 + 18 caption. The ± keep working while editing (they blur first →
commit, then step). `CompactStepper` (editor, `ProgramFields.tsx`) has the same entry, built 2026-10-27 (H2-D): the value turns into a `number-pad` field in place, both steppers share `src/ui/inlineEdit.ts`, and `programEdit.ts` `enter*` clamp to `RANGES` and snap to the step. On web Enter commits and a ± tap commits first, then steps; on native (the number pad has no return key) + turns into a Done check while editing and a tap outside also commits, and the first ± tap only commits (it dismisses the keyboard).

Keyboard: at 390 × 844 the steppers sit above y = 420 on Today (`ExercisePage` head ≈ 120 +
controls) and in the player draft; the iOS keyboard covers y > 584 → no `KeyboardAvoidingView`
(none exists in the app today; `grep -rn KeyboardAvoidingView apps/mobile` → 0). VERIFY on the
owner's phone (PWA) — web headless cannot show the keyboard.

Parsing (pure, `apps/mobile/src/components/stepMath.ts`): `parseWeight(raw, previous)`,
`parseReps(raw, previous)`, `parseSeconds(raw, previous)` → `number`. `,` accepted as decimal point;
trim; empty or NaN → `previous`; otherwise clamp to range and snap: weight 0–500 to nearest 0.25,
reps 1–100 integer, seconds 5–3600 to nearest 5. Examples: `"22,5"` → 22.5; `"22.6"` → 22.5;
`"900"` → 500; `""` → previous; `"abc"` → previous; reps `"0"` → 1.

## 2. Step per exercise (pure, `stepMath.ts`)

```ts
export const stepKgFor = (equipment: ReadonlyArray<CatalogEquipment>): number
export const stepWeight = (current: number, direction: StepDirection, stepKg = WEIGHT_STEP_KG): number
```
`stepKgFor` takes the first match in this order (an exercise lists ≤ 3 equipment,
`CatalogExercise.ts` `isMaxLength(3)`); every literal of `LOADED_EQUIPMENT` (`catalog/loaded.ts`) is in
exactly one row (registry test, `.claude/rules/tests.md`); non-loaded lists → 2.5:

| Equipment literals | stepKg | Why |
| --- | --- | --- |
| `barbell`, `smithMachine`, `trapBar`, `ezBar`, `landmine` | 2.5 | smallest plate pair 2 × 1.25 |
| `dumbbell` | 2 | the Lead's reading in Amendment 34; most rubber racks run 2 kg to 20; the override covers 2.5 racks |
| `kettlebell` | 4 | 8 / 12 / 16 / 20 / 24 series |
| `plate`, `medicineBall` | 2 | single pieces, light |
| `legPress`, `hackSquat` | 5 | plate-loaded, one 5 kg plate a side is too coarse, 2 × 2.5 = 5 |
| `legExtension`, `legCurl`, `chestPressMachine`, `pecDeck`, `shoulderPressMachine`, `hipAbductorMachine`, `calfRaiseMachine`, `abCrunchMachine`, `latPulldown`, `seatedRowMachine`, `cable`, `assistedPullUpMachine` | 5 | weight-stack pin spacing |

Reps step 1, seconds step 5 (editor `stepWork`/`stepRest` unchanged). The step drives ± only; prefill
stays `HistoryRepo.lastSet(id, { loadedOnly: true })` (programs-player-v2 §2.8).

**Override** — `apps/mobile/src/services/StepRepo.ts` (`Context.Service`, `static layer` over
`LocalStore`), key `StepKey = \`catalog:${CatalogId}\` | \`exercise:${ExerciseId}\`` (catalog when the
exercise is linked, so Today and the player share one override):
```ts
readonly get: (key: StepKey) => Effect<Option<number>, StoreError>
readonly set: (key: StepKey, stepKg: number) => Effect<void, StoreError>   // upsert, updatedAt now
readonly clear: (key: StepKey) => Effect<void, StoreError>
```
v9: `CREATE TABLE IF NOT EXISTS "exercise_step" ("key" TEXT PRIMARY KEY NOT NULL, "stepKg" REAL NOT NULL,
"updatedAt" TEXT NOT NULL)` — device-local like v7/v8 (no `userId`, never pushed). Precedence:
`override ?? stepKgFor(equipment) ?? 2.5` (`effectiveStep(override: Option<number>, equipment)` pure).
Hook `useStep(key, equipment)` in `src/hooks/useStep.ts` (two features) returns `{ stepKg, isOverride, setStep, reset }`.

UI: under the weight stepper's caption a text button **"Step 2.5 kg"** (`Text variant="label"`,
`paddingVertical: 14` → 44 target; reads "Step 5 kg · custom" when `isOverride`). Tap → a
`ToggleChip` row (`compact`) with `1 · 1.25 · 2 · 2.5 · 5 · 10`: 6 × 50 + 5 × 8 = 340 ≤ 358 (page
358 = 390 − 2 × `gutter.phone` 16, `tokens.ts`). Selecting the equipment default calls `clear`,
any other `set`; the row collapses. Sentence case, no all-caps (`.claude/rules/react.md`).

## 3. Where it applies

| Surface | File | Weight step | Entry |
| --- | --- | --- | --- |
| Today exercise page (planned and free workout) | `components/ExercisePage.tsx` | `useStep(keyOf(item.exercise), equipmentOf(item.exercise.catalogId))` | weight + reps |
| Program player, weighted reps item | `player/components/PlayerView.tsx` (`onAdjust` draft) | key `catalog:<roundId>` (cues §2.8 `roundId`, swap-aware) | weight + reps |
| Program editor | `components/programs/ItemCard.tsx` | n/a | every stepper (built 2026-10-27, H2-D) |

`equipmentOf(catalogId: Option<CatalogId>)`: `findCatalogExercise` → `.equipment`, `[]` when None.

## 4. State matrix (per stepper; writer in brackets)

| Row | Condition |
| --- | --- |
| Idle | `editing === false` [initial; set by commit/cancel] — numeral is a button |
| Editing | `editing === true` [Pressable onPress] — field focused, text selected, native Done visible |
| Invalid draft | `editing && parse(text, prev)` would clamp or fall back (pure check on the draft) — numeral `tone="danger"`; commit still applies clamp/previous, no toast |
| Step default | `StepRepo.get(key)` None [no row] — "Step {stepKgFor} kg" |
| Step override | `StepRepo.get(key)` Some [`set` from the chip] — "Step {n} kg · custom"; ± move by n |

## 5. Not decided

Roaming override (D2 names the path). Entry on `CompactStepper`. Lb units (profile has no unit field:
`grep -rn unit packages/shared/src/user.ts` → 0; kg only).
