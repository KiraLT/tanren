# v4 — Core 30 rep targets: catalog kinds, counted items, reps work screen
Source: owner 2026-10-26 22:14 (plan Amendment 11) · Status: planned · Updated: 2026-10-26 22:20 · Baseline commit: de1bcb5
Design: `docs/design/v2-programs.md` §9 (normative) · ADR-0020 (accepted, Lead delegation) · Forge `ui-direction-final.md` · `ui-polish.md` §3 Player

## Decisions
- ADR-0020: no schema change (`kind: "timed" | "reps"` exists); classification = catalog `kind`; counts 12/16/18/20/22 (recovery 20); `SECONDS_PER_REP` 3 → 2; reps work screen = numeral + "Done" xl 64, no ring, no auto-advance; rest unchanged; sets log `reps = count` (timed: seconds) — accepted (Lead delegation)
- D1 No `perSide`: alternating moves count total reps, all counts even (ADR-0020 §1)
- D2 PROG-3 edits `PlayerView.tsx`, which the desktop pair (step-ui-p mobile-D / desktop sheet) holds now: **PROG-3 starts only after the Lead marks the desktop pair's round on `PlayerView.tsx` and `ProgramHome.tsx` accepted**. PROG-1 and PROG-2 run now (shared + pure files, disjoint).

## Tasks
| id | title | role / model | depends on | files (exclusive) | time box | status |
| --- | --- | --- | --- | --- | --- | --- |
| PROG-1 | Catalog kinds + Core 30 counts: flip 15 ids to `kind: "reps"`, `REPS_BY_WORK_SECONDS`, mode derived from the catalog, `SECONDS_PER_REP = 2`, tests (design §9 tables) | engineer / sonnet | — | `packages/shared/src/catalog/data/core.ts`, `catalog/core30Ids.ts` (comment), `catalog/catalog.test.ts`, `programs/Program.ts`, `programs/Program.test.ts`, `programs/core30.ts`, `programs/core30.test.ts` | 20 min | todo |
| PROG-2 | Player pure layer: `repsOf(item)` helper in `cues.ts`; reps-phase tests for machine, cues and alerts (design §9 "Unchanged" claims proven by tests) | engineer / sonnet | — (builds its own `ProgramDay` fixtures with reps items) | `apps/mobile/src/player/cues.ts`, `cues.test.ts`, `playerMachine.edge.test.ts` | 20 min | todo |
| PROG-3 | Reps work screen in `PlayerView.tsx` (design §9 mockup): numeral `clock` + caption "reps", Done `size="xl"`, `disabled={paused}`, block `minHeight` 220; `apps/mobile/CLAUDE.md` Programs lines | engineer / sonnet | PROG-1, PROG-2, **D2 gate** | `apps/mobile/src/player/components/PlayerView.tsx`, `apps/mobile/CLAUDE.md` (Programs bullet only) | 20 min | todo |
| PROG-R | Review: ADR-0020 rule applied id for id, counts table, `SECONDS_PER_REP` math vs `core30.test` bound, no schema/row change, Forge tokens only (`type.clock`, `sizes.stepperButton` via Button xl), functional rules | reviewer / opus | PROG-3 | read-only | 15 min | todo |
| PROG-X | QA (`ui-check`, session `prog-x`): Programs tab → Enrol → Start; work screen for `dead-bug` shows numeral "12", caption "reps", Done 64 high, no ring; Done → Rest ring with countdown and "Next · Crunch 12 reps" caption; 5 × (Done, ›) reaches `hollow-hold` with the ring and "0:25"; Pause on a reps item → Done disabled (opacity 0.4, `accessibilityState.disabled`); Programs home `DayItems` rows read "12 reps" / "25 s"; Library → Crunch detail Meta reads "Reps". `ui-measure.js` at 390: no control < 44, text sizes ⊂ ramp. Screenshots to the review gallery: `UI-PROG-work-reps-390-light.png`, `UI-PROG-work-reps-390-dark.png`, `UI-PROG-work-timed-390-light.png`, `UI-PROG-home-390-light.png`. Report `Commit:` (HEAD sha) and `Data state:` (dev server, empty store, local enrolment; no sign-in needed) | qa / sonnet | PROG-R clean | none (writes this Log only) | 20 min | todo |

Parallel groups: {PROG-1, PROG-2} now → {PROG-3} after the D2 gate → PROG-R → PROG-X.
Routes touched: `/programs` (tab) and `/programs/play` only; frames, widths and the other routes of
`apps/mobile/CLAUDE.md` "Layout" are unchanged (no new route, no chrome change). Loading / NotFound /
Empty states of `/programs/play` are untouched (PROG-3 edits the Working branch only).

## Frozen contracts (engineers do not change; a needed change is a Lead question)
- `ProgramItem`, `TimedItem`, `RepsItem`, `ProgramDay`, `Program`, `CORE30`, `CORE30_CATALOG_IDS` (24 ids, order) — unchanged shapes (`packages/shared/src/programs/Program.ts`, `catalog/core30Ids.ts`).
- New in `programs/core30.ts`: `export const REPS_BY_WORK_SECONDS: ReadonlyMap<number, number>` = {25→12, 30→16, 35→18, 40→20, 45→22, 75→20}; item mode = `findCatalogExercise(id).kind` (`reps` → `RepsItem`, `timed` | `distance` → `TimedItem`); a missing catalog entry is a data defect (`decodeUnknownSync` already fails the module; keep that).
- `Program.ts`: `SECONDS_PER_REP = 2`.
- New in `cues.ts`: `export const repsOf = (item: ProgramItem): Option.Option<number>` — `Some(reps)` for a reps item, `None` for timed.
- `catalog/data/core.ts`: exactly these 15 ids become `kind: "reps"`: dead-bug, crunch, reverse-crunch, lying-leg-raise, v-up, bicycle-crunch, russian-twist, heel-touch, plank-hip-dip, plank-shoulder-tap, glute-bridge, bird-dog, scissor-kick, sit-up, toe-touch-crunch. All other fields and all other entries unchanged.
- Copy: numeral = the count, caption "reps", button "Done" with icon `check`, `accessibilityLabel` `Done with <name>` (exists), numeral `accessibilityLabel` `<n> reps`.
- Machine, `alertFor`, `ProgramRepo`, rows, `DayItems`: no edits (ADR-0020 §4–6).

## Assumes (cited)
- `Working.endsAtMs` is `Option<number>` and is `None` for a reps item; only `next` advances it (`playerMachine.ts:35-36,120`; `remaining*` → `None` at `:318-322`).
- `Paused.remainingMs` is `None` when the inner phase is a reps item (`playerMachine.ts:50`), so `PlayerView`'s `Option.match(seconds, { onNone })` branch is the reps branch for both Working and Paused (`PlayerView.tsx:129-140`).
- `alertFor` returns `None` for a reps work phase: `deadlineOf` maps `Working` to `s.endsAtMs` (`cues.ts`, `deadlineOf`), and the rest alert text already uses `itemAmount` → "N reps" (`cues.ts`, `alertFor` Working branch).
- `ProgramRepo.loggedCount` returns `reps` for a reps item and `seconds` for a timed one (`ProgramRepo.ts:117-122`), consumed at `:343`.
- `Button` has `size` md 48 / lg 56 / xl 64 and `disabled` (opacity 0.4, `accessibilityState`) (`Button.tsx:24-30,53-61`); `type.clock` = 64/68 display tabular (`tokens.ts:124-130`); `TimerRing` default size 220 (`TimerRing.tsx:38`).
- `DayItems` and the player header already print `itemAmount(item)` ("12 reps" / "25 s") (`ProgramHome.tsx:174-183`, `PlayerView.tsx:114-121`).
- Catalog `kind` consumers are the Library only (`library/searchState.ts`, `CatalogFilterBar.tsx`, `FilterSheet.tsx`, `CatalogDetail.tsx:102,126`; grep `kind` in `apps/mobile/src` excluding `player/`, 22:17); the worker does not read it (`grep -rn '\.kind' apps/worker/src` → nothing).
- `catalog.test.ts:152-163` asserts every CORE30 id is `kind: "timed"`; `core30.test.ts:36-41` asserts only timed items; `Program.test.ts:54-58` asserts `SECONDS_PER_REP` — all three change in PROG-1.
- Day 1 is template A and its first item is `dead-bug` (`core30.ts` TEMPLATE_A[0], `(1 − 1) mod 3 = 0`), so the first work phase after Start is a reps item (PROG-X needs no waiting).

## Briefs (ready to paste)

### PROG-1 — Catalog kinds + Core 30 counts · engineer / sonnet · Time box: 20 min
Read ADR-0020, `docs/design/v2-programs.md` §9, `packages/shared/src/programs/{Program.ts,core30.ts}`, `catalog/data/core.ts`, `catalog/core30Ids.ts`, the three tests named in "Assumes". Load `effect-conventions`.
1. `data/core.ts`: flip exactly the 15 ids in "Frozen contracts" to `kind: "reps"`; touch nothing else.
2. `Program.ts`: `SECONDS_PER_REP = 2`, doc comment updated.
3. `core30.ts`: `REPS_BY_WORK_SECONDS` (exported, frozen values); `itemFor(catalogId, workSeconds, restSeconds)` derives the mode from `findCatalogExercise(catalogId).kind` with an exhaustive `Match` (`reps` → `{ kind: "reps", reps }`, `timed` | `distance` → `{ kind: "timed", seconds }`); a count missing from the map is a defect (`Option.getOrThrowWith` is forbidden — build the wire item as `Option` and let `decodeUnknownSync` reject an invalid shape, or thread `Option` and `Arr.getSomes`; state which). Recovery items use 75 → 20.
4. Tests: `catalog.test.ts` "all 24 CORE30 ids": kind ∈ {timed, reps} and the set of reps ids equals the 15 above; `core30.test.ts`: item kind = catalog kind for every item; every count ∈ {12,16,18,20,22}, even; template A day 1 items in order with modes R R R R R T T; `dayDurationSeconds` 12–18 min on training days (unchanged bound) and day 30 ≥ day 1; `Program.test.ts`: 10 reps = 20 s.
5. `core30Ids.ts` comment: "kind timed or reps per ADR-0020".
Done: `pnpm check` green, output in the report; the report lists `dayDurationSeconds` for days 1, 10, 16, 22, 29, 30 (expected 900, 1020, 1020, 1020, 1050, 1056). No file outside the set.

### PROG-2 — Player pure layer · engineer / sonnet · Time box: 20 min
Read ADR-0020 §4–5, `apps/mobile/src/player/{playerMachine.ts,cues.ts}` and their tests. Load `expo-mobile`.
1. `cues.ts`: add `repsOf` (contract above) next to `itemAmount`.
2. `playerMachine.edge.test.ts`: a day with `[reps 12 / rest 15, timed 25 / rest 60]`, 1 round: after `start` the state is `Working` with `endsAtMs: None`; `tick` +10 min stays on the same phase; `next` → `Resting` with `endsAtMs = nowMs + 15000`; `pause` on the reps phase → `remainingMs: None`; `resume` → still `None`; `remaining(state)` is `None` on the reps phase.
3. `cues.test.ts`: `repsOf`; `alertFor` is `None` on the reps work phase and, once resting, its text is `"Rest over — <Name>, 25 s"`; `nextCaption` from the reps phase is `"Next · <Name> 25 s"`; `itemAmount` of a reps item is `"12 reps"`; `cueFor` Idle → reps Working is `"work"`.
No edits to `playerMachine.ts` (if a test fails there, report it as a finding, do not fix). Done: `pnpm check` green, output in the report.

### PROG-3 — Reps work screen · engineer / sonnet · Time box: 20 min · starts after the Lead's D2 gate
Read ADR-0020 §4, `docs/design/v2-programs.md` §9 mockup, `PlayerView.tsx` (`ringBlock`, `:127-155`), `Button.tsx`, `tokens.ts` (`type.clock`, `space`). Load `expo-mobile`.
1. In `ringBlock`'s `onNone` branch (reps item) render: `<View style={{ minHeight: 220, justifyContent: "center", alignItems: "center", alignSelf: "stretch", gap: space.lg /* 24 */ }}>` containing (a) a column gap 4: `<Text variant="clock" accessibilityLabel={`${n} reps`}>{n}</Text>` and `<Text variant="caption" tone="muted">reps</Text>`, (b) `<Button label="Done" icon="check" variant="primary" size="xl" disabled={paused} onPress={() => send("next")} style={{ alignSelf: "stretch" }} />`. `n` = `Option.flatMap(item, repsOf)` rendered via `Option.match` (fallback: the existing Button alone). Phone and desktop share this branch; verify the desktop ring wrapper (if the desktop pair added one) keeps `minHeight` ≥ its ring size, else match it.
2. Timed branch (`onSome`), header row, transport row, `CompletionSheet`: unchanged.
3. `apps/mobile/CLAUDE.md` Programs bullet: one sentence "reps items (ADR-0020): numeral + Done xl, no ring, `next` on Done; sets log `reps = count`".
Done: `pnpm check` green; a `ui-check` snapshot at 390 on day 1 after Start shows text "12", text "reps", a button "Done with Dead Bug" of height 64 and width 358, and no element with label "… seconds left"; after Pause the Done button has `accessibilityState.disabled = true`; snapshot heights of the transport row's y are equal on the reps item and (after Done, ›, …, 5 ×) on `hollow-hold`. Output of both in the report.

### PROG-R — Review · reviewer / opus · Time box: 15 min
Scope: diff since `de1bcb5` under `packages/shared/src/{catalog,programs}` and `apps/mobile/src/player/**`, `apps/mobile/CLAUDE.md`. Check: the 15-id list matches ADR-0020 exactly (both directions); counts from `REPS_BY_WORK_SECONDS` only; `SECONDS_PER_REP = 2` and the 12–18 bound unchanged; no new schema field, no row/migration change, no edit to `playerMachine.ts`, `ProgramRepo.ts`, `ProgramHome.tsx`; `PlayerView` uses `variant="clock"`, `size="xl"`, no literal sizes besides the documented 220; functional rules (no `let`/`as`/`!`); tests prove each "Unchanged" claim of §9. Report blockers / majors / minors with file:line.

### PROG-X — QA · qa / sonnet · Time box: 20 min
Session `prog-x` per the task table row. Load `ui-check`. Capture light and dark for the reps work screen (scheme toggle per `ui-check`), light for the rest. Publish the four PNGs to the review gallery (memory `tanren-review-gallery`) and report `Commit:` and `Data state:` lines plus every measured value with its expected number.

## Deferred (from forward-reference grep, 22:16: no `OPEN`/`→ step` lines mention programs or reps in `docs/retro/incidents.md`, `docs/handoff.md`, `v4-feed.md`, `v4-strava.md`)
- "reps actually done" (−/+ on Done), per-side cue, speech cues: ADR-0020 "Not decided".
- Desktop reps block sizing (numeral `numeralLg` 96?): after the desktop pair's Player decision lands; PROG-3 only keeps `minHeight` parity.

## VERIFY (engineer, against installed types)
- PROG-1: `Match.discriminatorsExhaustive`/`Match.valueTags` over `ExerciseKind` literals (`"reps" | "timed" | "distance"`) — pattern used in `Program.ts:71`; confirm `distance` handled.
- PROG-3: `Text` accepts `variant="clock"` (used at `PlayerView.tsx:148`) and `accessibilityLabel`; `Button` `style` prop merges `alignSelf: "stretch"` (used at `:137`).
- PROG-X: the `ui-check` scheme toggle name for dark captures (per the `ui-check` skill, not assumed here).

## Log
- 22:13→22:21 · PROG-0 · architect/fable · ADR-0020, design §9, this sheet.
- 22:26 · PROG-2 done → in-review (WIP commit 9d09fcd); PROG-3 still gated on the desktop pair releasing PlayerView.tsx
- 22:29 · PROG-1 done → in-review (WIP e3a5350). Recovery days ≈ 4 min (3 × 40 s counted items + 75 s hold + rests) ratified by the Lead; raise counts later if the owner wants longer.
