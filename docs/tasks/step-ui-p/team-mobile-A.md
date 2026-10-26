# Team sheet: pair mobile-A (UI-P polish, phone: Today · Player · Plan · Programs)

Started 21:20 (wall clock), hard timeout 22:50. Spec: `docs/design/ui-polish.md` §1–§5 · sheet block: `docs/tasks/v3-design.md` "UI-P". Report ≤ 40 lines.
Owned: `apps/mobile/src/components/{TodayReady,TodaySetupCard,todaySetup,todayHeader,ExercisePage,SetList,RestTimerBar,PlanWeek,PlanDayRow,PlannedSessionCard}` (+tests), `src/player/**`, `app/(tabs)/{today,plan,programs}.tsx`, `app/programs/**`. Not `ExercisePager.tsx`, not `src/ui`.

## Assumes (cross-team)
- `desktop` owns `src/ui/**` and ships foundation primitives (new tokens, `Text tabular`, `Chip hitSlop`, `ListRow leading={null}`, stepper sizes). Until the Lead says "foundation landed": existing primitives only.
- Desktop (≥ 900) layouts of my screens must not change in this pair; desktop branches are the desktop pair's.
- Seeded plan week is 19–25 Oct: fake date init script `/private/tmp/claude-501/-Users-lukas-Documents-Personal-tanren/2f72436e-0cd5-4397-8737-fd4699a2ee88/scratchpad/UI-D0-fakedate.js` + `TZ=Pacific/Kiritimati`. Programs enrol offline in a scratch session only.

## Primitive requests to desktop (via Lead)
- (r1) `SetDots`: 10×6 radius-3 pills, current 16×6 accent, done `textMuted`, todo hairline (Today 2) — owner: desktop.
- (r1) `Stepper`: unit as `caption` "kg" right of the numeral on the baseline; reps block height 92 / no hairline (Today 3) — owner: desktop (style-prop padding part done locally).
- (r2) `type.clock` 64/68 tabular (Player 4); `ListRow` height/selected props as needed.

## Tasks
| id | task | model | depends | box | status |
|---|---|---|---|---|---|
| E1 | Round 1 code: Today 1,3(padding),4 · Player 1–3 · Plan 1–2 · Programs 1 (ring day number) | engineer/sonnet | — | 15 | todo |
| S1 | Round 1 stack + shots: seeded isolated stack, export, 390 light+dark PNGs, ui-measure JSON | engineer/sonnet | E1 code (stack prep parallel) | 20 | todo |
| REV-1 | Designer r1 (fable architect) | architect/fable | S1 | 10 | todo |
| E2/S2/REV-2 | Round 2 (Player 4, Plan 3, remaining) | | REV-1 | | todo |
| E3/S3/REV-3 | Round 3 | | REV-2 | | todo |

## Decisions
(none yet)

## Integration checklist
- [ ] (filled as needs appear)

## Log
