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
