# Team catalog — sheet
Charter: `docs/tasks/v2-catalog.md` · Design: `docs/design/v2-catalog.md` · Start 00:34 · Box 100 min → 02:14
Budget: ≤ 3 engineers parallel · 1 reviewer (opus) · ≤ 2 review rounds · ports 8796/8797 only

## Assumes (cross-team, copied from charter)
- programs/F1: `catalog/taxonomy.ts` exports `Slug`, `CatalogId`, `IllustrationId`, `ExerciseKind`, `CatalogEquipment`, `MovementPattern`, `equipmentKindFor`; `exercise.catalogId` in shared, D1, mobile store; barrel `export * from "./catalog"` exists. (verified 00:36)
- programs/F2: `react-native-svg` installed; `app/(tabs)/library.tsx` stub + tab exist. (stub verified 00:36)
- illustrations: `apps/mobile/src/illustrations/generated/index.ts` exports `ILLUSTRATIONS` — absent at 00:36 → C4 imports a local empty map and announces.
- design: `apps/mobile/src/ui/**` primitives exist (verified 00:36: AppBar, Page, Card, ListRow, Button, EmptyState, SegmentedControl, Text, Icon, Banner, tokens).
- mcp-oauth: done and committed (Lead 00:34) → C5 free.

## Lead overrides of the charter (00:34 dispatch)
C0 sonnet 10 min; C1 modules sonnet; C3 + C4 opus; interim to Lead with `illustrationId`s when the first three C1 modules are ready.

## Decisions (for Lead ratification)
- TD1 "Add to today" path: no write path existed in `TodayRepo` (only `today`, `logSet`, `exerciseChoices`). C3 adds
  `TodayRepo.addExercise(exerciseId): Effect<boolean, StoreError>` — appends 3 planned sets (Exact 10 reps, no target
  weight) to today's planned session after the max `order`, dirty, `StoreEvents` emit, under the log lock; no-op `true`
  when already planned today; `false` when no planned session today (UI shows a notice). `plannedSet` is a sync member, LWW.
- TD2 C1 modules run as five engineers × two modules each (fewer handoffs), slices below so names cannot collide.

## C1 slices (exclusive ownership of movements; the validation test catches the rest)
| pair | modules | owns (besides §3 scope) | must contain ids |
| --- | --- | --- | --- |
| A | legs, hips | legs: all squats incl. goblet/smith/front/hack, leg press, lunges, step-ups, split squats, plyometrics (box jump, jump squat, broad jump), leg ext/curls, nordic, GHR, calves, tibialis. hips: all deadlifts (barbell/dumbbell/trap bar/kettlebell), RDL, good morning, hip thrust variants, barbell glute bridge, back extension, cable pull-through, adductor/abductor, copenhagen plank, frog pump | `barbell-back-squat` (FIRST entry of legs, alias "Squat"), `leg-press`, `bulgarian-split-squat`, `standing-calf-raise`; `conventional-deadlift`, `romanian-deadlift`, `hip-thrust`, `hip-abduction-machine` |
| B | chest, back | chest: all presses/flys, pec deck, all push-up variants, `chest-dip` (alias "Dips"). back: rows (incl. t-bar, inverted), pull-ups/chin-ups, pulldowns, pullovers, face pull, straight-arm pulldown | `barbell-bench-press`, `incline-dumbbell-press`, `cable-fly`, `push-up`; `barbell-row`, `pull-up`, `lat-pulldown`, `seated-cable-row` |
| C | shoulders, arms | shoulders: presses, raises, upright rows, shrugs, rear-delt fly/reverse pec deck. arms: curls, triceps (incl. `close-grip-bench-press`, `bench-dip`), forearms | `overhead-press` (name "Overhead Press", aliases incl. "OHP", "Military Press"), `dumbbell-lateral-raise`, `arnold-press`; `dumbbell-curl`, `ez-bar-curl`, `triceps-pushdown`, `skull-crusher` |
| D | core, fullBody | core: every `CORE30_CATALOG_IDS` (timed, `core` primary) + `hanging-leg-raise`, ab wheel, cable crunch, pallof press, woodchopper. fullBody: kettlebell ballistics (swing, clean, snatch, TGU, windmill, halo), olympic lifts + push press/jerk/thruster, carries, all `landmine-*`, sled, battle ropes, burpee | 24 CORE30 ids + `hanging-leg-raise`; `kettlebell-swing`, `power-clean`, `farmers-carry` |
| E | cardio, mobility | cardio: machines + locomotion + jump rope + jumping jacks (distance/timed). mobility: stretches, drills, warm-ups, foam rolling, dead hang (timed) | `treadmill-run`, `rowing-machine`, `assault-bike`, `jump-rope`; `cat-cow`, `worlds-greatest-stretch`, `couch-stretch`, `foam-roll-quads` |

Global alias rule: no name may start with "Squat"; no bare one-word generic aliases (row, curl, press, deadlift, lunge, fly, raise, crunch, plank) except the canonical ones named above.

## Tasks
| id | title | model | depends | status |
| --- | --- | --- | --- | --- |
| C0 | schema + index + searchCatalog + test harness + empty modules | sonnet | — | todo |
| C1-A..E | data modules (pairs above) | sonnet | C0 (A starts ∥ C0) | todo |
| C2 | seed names/aliases, bounds 200–300, catalogId D1 round-trip | sonnet | all C1 | todo |
| C3 | `ExerciseLink` + `TodayRepo.addExercise` + runtime line | opus | — | todo |
| C4 | Library UI + `ExerciseIllustration` + ui-check proof | opus | C0, C3 | todo |
| C5 | `search_exercises` MCP tool | sonnet | C0 | todo |
| REV | reviewer | opus | C4 | todo |

## Log
`HH:MM→HH:MM · task · role/model · agent id · tokens · tool uses · rounds · outcome`

## Integration checklist
- [ ] (none yet)

## Escalations
