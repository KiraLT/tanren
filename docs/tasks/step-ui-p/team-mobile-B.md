# Team sheet: pair mobile-B (UI-P polish, phone: Library · Library detail · Progress · Progress detail · Settings · Location)

Started 21:41 (wall clock), hard timeout 23:11. Spec: `docs/design/ui-polish.md` §1–§5 · sheet block `docs/tasks/v3-design.md` "UI-P". Report ≤ 40 lines.
Owned: `apps/mobile/src/library/**`, `src/components/progress/**`, `src/components/settings/**` except `settings/integrations/**` (strava), `app/(tabs)/library.tsx`, `app/library/[catalogId].tsx`, `app/settings.tsx` (strava adds ONE Integrations row: keep it), `app/settings/**` except `app/settings/integrations*`.
Not mine: `app/(tabs)/progress.tsx`, `app/progress/**` (feed team, FEED-5), `src/ui/**` (desktop), Today/Player/Plan/Programs (mobile-A).

## Assumes (cross-team)
- Foundation primitives are in the tree via the `src/ui` barrel (StatRow, Text clock/numeralLg/tabular, SetDots pill, ProgressRing children, Stepper xxl, ListRow leading={null}+thumb, ListGroup inset, ToggleChip hitSlop, rhythm tokens, sizes.illustrationXl). Another primitive = message to Lead, wrap locally.
- Desktop (>= 900) branches of my screens must not change in this pair.
- Seeded local worker state: `apps/worker/.wrangler/state` copied to scratch (history for Progress; Gym + Home locations for Settings). Recipe from mobile-A: `$S/pma-RECIPE.md` (adapt: prefix `pmb-`, ports W 8831 / A 8832, inspector 9331 / 9332).
- Commits are the Lead's; per round I message `main` with round, score, screenshot names, blocking items, complete file list.

## Primitive requests to desktop (via Lead)
(none yet)

## Tasks
| id | task | model | depends | box | status |
|---|---|---|---|---|---|
| E1 | r1 code: Library 1-3 (filters -> muscle row + Filters chip, rows 64/inset 84, count row), Progress 1 (rows 64 inset 84 tabular date), Progress detail 1-2 (map 160 + Best-set tile on 358 row, tooltip one line), Settings 1 (8/24 rhythm) | engineer/sonnet | - | 20 | todo |
| S1 | r1 stack + shots 390 light+dark, ui-measure JSON, self-check | same engineer (continuation inside E1 box) | E1 code | incl. | todo |
| REV-1 | designer r1 | architect/fable | S1 | 10 | todo |
| E2/REV-2 | r2: Progress detail 3-4, Settings 2, Location 1-2, Library detail 1 + r1 fixes | | REV-1 | 30 | todo |
| E3/REV-3 | r3 leftovers | | REV-2 | 30 | todo |

## Decisions
(none yet)

## Integration checklist
- [ ] (filled as needs appear)

## Log
- 21:43→21:57 · E1+S1 r1 · engineer/sonnet · a0678a69b6191175a · 200k tok · 114 tool uses · 1 round · Library 1-3, Progress detail 1-2, Settings 1, Location done; Progress divider inset blocked (app/progress/index.tsx = feed). Dispatch ack was the report (foreground-like; box was 14.5 min so harmless).
- 21:58 · TL self-check of PNGs found 3 defects (At Gym+All double-selected, dark map-tile box, stale pre-FEED-5 progress shots) -> resumed a0678a69b6191175a, 10 min box.
## Decisions
- FilterSheet: RN Modal (slide, own backdrop) because @expo/ui is not installed; `FilterSheet.tsx` added in src/library (Lead to ratify).
- Settings gaps were already 8/24; switched to rhythm tokens.
- 21:58→22:02 · r1 self-check fixes · engineer a0678a69b6191175a · 45 uses · done (At Gym chip moved, dark map tile, FEED-5 reshoot, sheet scroll).
- 22:03→22:06 · REV-1 · architect/fable · a7459d79a352607d6 · 102k tok · 36 uses · NOT PASS (Library 4, Progress 4, Settings 4; LD 3, PD 3, Location 3).
- 22:08→22:24 · E2+S2 r2 · engineer/sonnet · acc95e8dae7d08363 · 239k tok · 149 uses · all 7 items; +/feed Back fallback and desktop 1RM-card check (22:25→22:27); gate 887 tests green.
- 22:27→22:32 · REV-2 · architect/fable · a1434786581e93efa · 98k tok · 30 uses · PASS: library 4, library-detail 4, progress 4, progress-detail 4, settings 4, location 4.
## UI-P-left
- dark surfaceRaised tile behind illustrations until IMG-7 re-tint (ratified by Lead).
- ListRow titleLines/subtitleLines + tabular title (src/ui) -> would remove clampSubtitle (33 chars, width-fragile) and the empty-title hack in ExerciseDetail; two 74-px Library rows (two-line titles).
- ToggleChip compact/vertical-margin option (the -6 CHIP_PULL is in LocationEditor, FilterSheet, CatalogFilterBar).
- Volume/1RM cards 4 px shorter in dark than light; Location dark 2 px higher below the name field.
- Optional polish: clamp subtitle at the last ", " / " · " instead of a character; clock glyph on the Last-done row.
- Feed team: AppBar title on /progress/[exerciseId] says "Progress" (Stack.Screen title = name).
## Decisions (final)
- FilterSheet = RN Modal (ratified by Lead). MuscleMapImage got optional `backdrop` prop (out-of-set file, ratified). apps/mobile/CLAUDE.md phone-layout paragraph for mobile-B written (Lead ratifies).
