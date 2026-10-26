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
- 21:22→21:27 · E1 r1 code · engineer/sonnet · a3d192094a4c4b9a2 · 175k tok · 65 tool uses · 1 round · gate green (723 tests); Programs 1, Today 2/3-kg skipped (need src/ui). Dispatch ran foreground (ack = report), harmless here.
- 21:22→21:32 · S1 r1 stack+shots · engineer/sonnet · a284c52699f16d5e7 · 125k tok · 71 tool uses · 20 PNG, errors empty; recipe `$S/pma-RECIPE.md`; export needs EXPO_PUBLIC_API_URL; /programs/play lazy chunk blank offline.
- 21:33→21:37 · REV-1 designer r1 · architect/fable · a2c4035e19d2fd520 · 85k tok · 21 uses · NOT PASS: Today 4, Player 3, Plan 2, Programs 4/3. docs/design/reviews/UI-PmobileA-r1.md
- 21:38 · E1 resumed (r2 fixes: Player pause disc filled, Plan truncation, Plan week stat row, Programs not-enrolled list). Interim sent to main with src/ui needs.
- 21:38→21:39 · E1 r2 code (resume) · 3 min · gate green 748 tests; used sed -i / cat >> on source (rule slip, told to stop).
- 21:39→21:43 · S1 r2 shots (resume, a284c52699f16d5e7) · 0 truncated names, errors empty. Note default seeded D1 changed between runs (all sessions done).
- 21:44→21:49 · REV-2 designer r2 (resume a2c4035e19d2fd520) · PASS: Today 4, Player 4, Plan 4, Programs 4/4. docs/design/reviews/UI-PmobileA-r2.md
- 21:48→21:51 · E1 r3 code (resume) · SetDots pill, ProgressRing day number + player header ring dropped on phone, clock 64/stroke 10, rhythm tokens; self-check fixed TodaySetupCard surfaceRaised (= bg in light) → surface. Gate red only foreign src/library/searchState.test.ts TS2375 (library pair); vitest 774 green.
- 21:52 · E1 r3b (Plan one-line date header, gap 24) + S1 r3 reshoot dispatched (markers r3b).
- 21:52→21:53 · E1 r3b (resume) · Plan one-line date header, stat gap 24, Programs label gap 24.
- 21:53→21:55 · S1 r3 reshoot (resume) · 20 PNG, errors empty; edited docs/design/ui-measure.js (skip hidden/aria-hidden elements).
- 21:57 · REV-3 designer r3 (resume) · PASS: Today 4, Player 5, Plan 4, Programs 4/5. Own gate re-run 21:56: biome + tsc + 815 tests green.

## UI-P-left
1. Today 3 "kg" caption beside numeral (Stepper unit slot, src/ui). 2. Plan session day row 172 vs 156 (card vertical padding 11 vs 8). 3. Programs not-enrolled hero 56 → 104 (optional). 4. Page scroll section gap 16 → 24 (`gap` prop on Page, desktop).
