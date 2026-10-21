# v3 — design pass: sizes, spacing, hierarchy (owner verdict 2026-10-21 11:20)
Source: owner, "you need improve design a lot. Sizes, spacing are out." · Status: planned (UI-A 11:18–11:45) · Baseline: working tree after v3-equipment
Spec: `docs/design/ui-audit.md` (normative: §2 target scale, §3 per-screen fixes, §5 measurement) · design-system.md §1/§3/§4 stay; §2 numbers are superseded by ui-audit §2.

## Decisions
- D1 No UI library or styling plugin; fix is tokens + layout in `src/ui` (ui-audit §1.3) — accepted (Lead delegation)
- D2 Ramp = platform ramp (HIG sizes, two new variants `title2`, `label`), `numeral` 56, stepper 64, log button 64 — accepted (Lead delegation)
- D3 Today phone order: controls first, set list below (ui-audit §3.1/§4) — accepted (Lead delegation); owner may override by message
- D4 Font stays the platform system font; accent stays ember orange — accepted (Lead delegation); open question for the owner (§Open)

## Charter (one team: design)
Mission: every screen measures to ui-audit §2 and reads as one system: one accent object per screen, hierarchy by weight, grouped lists, rows ≥ 44, numbers never clipped.
Owned paths: `apps/mobile/src/ui/**` (UI-1 only), screens/components per task row; `docs/design/ui-audit.md`, this sheet. Read-only: `packages/**`, `apps/worker/**`, `apps/mobile/src/services/**`, `src/store/**`, `src/player/playerMachine*.ts`.
Runtime proof: exported web build on an isolated stack (ui-check §Isolated stack): `CI=1 pnpm -F @tanren/mobile export:web --output-dir $S/<task>-dist`, `wrangler dev -c wrangler.web.jsonc --port <A> --inspector-port <A+500> --assets $S/<task>-dist`; ports: UI-2 8830, UI-3 8832, UI-4 8834, UI-X 8836 (check free with `ps -ef | grep "port <p>"` + curl first). Signed-out demo is enough (Today, Library, Programs, Settings, Progress all render signed out). Measure with `docs/design/ui-measure.js` (ui-audit §5).
Budget: sonnet by default; opus only for UI-2 (layout re-order of the logging screen) and UI-R. ≤ 3 engineers in parallel. Each engineer loads `expo-mobile` + `frontend-design:frontend-design` (+ `dataviz` for UI-4) and screenshots at 390/1280 light+dark before reporting.
Forbidden: never run a command under `permissions.ask`: `git push|reset|checkout`, `rm -r*`, `wrangler deploy|login|secret|d1 execute`, `eas *`, Cloudflare MCP `execute`; `pnpm db:reset` is fine. Do not read `.env*`. Kill only PIDs in your own pid files; re-check your port with `ps -ef | grep "port <p>"` before reporting.
Report: role format + the `ab eval` JSON for each screen you own at 390 dark and 1280 light + screenshot paths + `pnpm check` tail.

## Tasks
| id | title | role / model | depends on | files (exclusive) | spec | time box | status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| UI-1 | Tokens + primitives: ramp (§2.1, add `title2`, `label`), `sizes`/`radius`/`gutter` (§2.2), `Text` variants, `Button` heights 48/56/64, `Stepper` 64 + 1 px border + inline unit, `ListRow` minHeight 52 + hairline grouping, `Card` padding 16, `AppBar` 56 bar + hairline + right-aligned pills + `nav` prop, `SegmentedControl` inset, tab bar 56 + `label`, dark `accentSoft`; update design-system.md §2 to point at ui-audit §2; commit `docs/design/ui-measure.js` | engineer / sonnet | — | `apps/mobile/src/ui/**` (all), `app/(tabs)/_layout.tsx`, `docs/design/design-system.md` §2, `docs/design/ui-measure.js` | ui-audit §2, §3.7 | 40 min | todo |
| UI-2 | Today + player: re-order per §3.1/§4 (controls first, set list as grouped list below, Log set 64 visible at 390×844), set rows `headline`/`subhead`, program card secondary below, `RestTimerBar` to ramp, player header without nav + `Finish workout` 56 | engineer / **opus** | UI-1 merged | `src/components/{ExercisePage,ExercisePager,SetList,TodayReady,TodaySetupCard,RestTimerBar,PlannedSessionCard}.tsx`, `app/(tabs)/today.tsx`, `src/player/components/PlayerView.tsx`, `app/programs/**` (player route) | ui-audit §3.1, §3.6, §4 | 60 min (opus: ≈ 120 turns; say "turn cap" if hit) | todo |
| UI-3 | Library + Settings: detail order (name first, 160 px hero row, desktop aside), sticky "Add to today's session", list rows/filter bar to ramp; Settings grouped lists, segmented inset 16, destructive text row, presets as rows, location editor rows | engineer / sonnet | UI-1 merged | `src/library/{CatalogDetail,CatalogList,CatalogFilterBar,ExerciseIllustration}.tsx`, `app/(tabs)/library.tsx`, `app/library/**`, `src/components/settings/**.tsx`, `app/settings.tsx`, `app/settings/**` | ui-audit §3.3, §3.4 | 50 min | todo |
| UI-4 | Programs + Progress + Plan: DayCard/EnrolCard per §3.2 (title2, grouped rows 44, Start = 56 primary, day list below on phone), Progress rows per §3.5, charts per `dataviz` (2 px gaps, 4 px rounded ends, 8 px markers, one hue + accent current, hover tooltip on web), Best-set tile `numeral`; Plan week rows to ramp | engineer / sonnet + `dataviz` | UI-1 merged | `app/(tabs)/{programs,progress,plan}.tsx`, `app/progress/**`, `src/player/components/ProgramHome.tsx`, `src/components/progress/**`, `src/components/{PlanWeek,PlanDayRow}.tsx` | ui-audit §3.2, §3.5; dataviz §marks | 50 min | todo |
| UI-R | Review: token drift (`grep -rn "fontSize\|lineHeight\|fontWeight\|borderRadius: [0-9]" apps/mobile/src apps/mobile/app --include=*.tsx | grep -v src/ui` must be empty), one accent object per screen, no fixed heights on rows, `pnpm check` | reviewer / opus | UI-2, UI-3, UI-4 | read-only | ui-audit §2, §3 | 25 min | todo |
| UI-X | Proof: export once, run `ui-measure.js` on today, library/goblet-squat, programs, settings, progress at 390×844, 768×1024, 1280×800, light + dark; screenshots to the scratchpad; write the table into this sheet's Log; fail criteria in §Done | qa / sonnet | UI-R clean | this sheet (Log) only | ui-audit §5 | 25 min | todo |

Order: UI-1 → {UI-2, UI-3, UI-4} in parallel → UI-R → UI-X. UI-2/3/4 may be briefed while UI-1 runs (spec is frozen) but must start from the tree with UI-1 merged: they use `title2`/`label` and the new `sizes`.

## Frozen contracts (UI-1 output; the others consume)
- `TypeVariant = "numeral" | "display" | "title" | "title2" | "headline" | "body" | "subhead" | "caption" | "label"` with the §2.1 values; `Text` `variant` prop unchanged otherwise.
- `sizes = { tap: 44, control: 48, controlLg: 56, stepperButton: 64, logButton: 64, iconSm: 20, iconMd: 24, iconLg: 28, contentMaxWidth: 600, asideMaxWidth: 480, tabBar: 56, appBar: 56 }`; `radius.lg = 16`; `gutter.desktop = 32`.
- `Button` `size: "md" | "lg" | "xl"` → 48/56/64; `variant: "primary" | "secondary" | "destructive" | "text"` (`text` **new**: no fill, `headline` label, for the Settings sign-out row; VERIFY current variant set in `Button.tsx` and add only what is missing).
- `Stepper` renders unit inline after the value (`label` variant, muted); props unchanged.
- `ListRow` groups: a parent `View` with `surface` background, `radius.md`, hairline `border` between rows (the row itself has no border). VERIFY `ListRow` prop names before relying on `trailing`/`subtitle`.
- `AppBar` gains `nav?: boolean` (default true); `false` hides the desktop nav pills (player).
- Colours: dark `accentSoft` `#2E1C10` (VERIFY 4.5:1 for `accent` text on it in `colors.test.ts`; else keep `#3A2316`).

## Assumes (cited)
- The Today controls/set-list order is a layout change only; `TodayRepo`/`logSet` contracts untouched (ExercisePage.tsx:30–75, `SetEntry` props). Source: read in UI-A.
- Signed-out Today renders the pager with prefilled sets (ui-audit §3.1 measurement on the exported build, 11:21). Source: UI-A `ab eval`.
- `agent-browser` `set viewport` applies to the next `open` (measurements identical when set after `open` in UI-A's first run): set viewport and media **before** `open`. Source: UI-A Log.

## Done-criteria (UI-X measures; any miss routes back to the owning task)
1. `small` list empty on every screen at every viewport (no tappable element < 44 px).
2. Every `fontSize/lineHeight/fontWeight` histogram key is a §2.1 ramp row (56/60/800, 34/41/800, 28/34/700, 22/28/700, 17/22/600, 17/22/400, 15/20/400, 13/18/500, 12/16/500).
3. Today 390×844: `Log set` bottom ≤ 844 − 56 − inset; weight value "107.5" not clipped (`scrollWidth === clientWidth` on the numeral node; seed a 107.5 kg exercise or type it).
4. Programs 390: `Start` is `lg` (56) with the accent background; day rows ≥ 44.
5. Library detail 390: the exercise name's `top` < 200.
6. Settings 390: segmented control left edge = card text left edge (16 px inset); `Sign out` is a text row, not a filled slab.
7. Progress desktop: bar gap ≥ 2 px, markers ≥ 8 px (read `r`/`width` on the SVG nodes).
8. `pnpm check` green; reviewer's drift grep empty.

## Skill rules to add to `.claude/skills/expo-mobile` (Lead applies after UI-R)
- From `expo-design-system`: one token file (`src/ui/tokens.ts`), never a second system; 4-pt grid, named steps only; "Everything's a Card" tell → grouped lists with hairlines; rows use `minHeight`, never fixed heights; every Pressable has a pressed style; `gap` over margin; promote a view only when it repeats on 2+ screens; screenshot-and-critique (hierarchy, proximity, repetition, alignment) before reporting a screen.
- From `expo-native-ui`: `boxShadow` strings only; `borderCurve: "continuous"` with every non-capsule radius; `fontVariant: ["tabular-nums"]` on counters; `contentInsetAdjustmentBehavior="automatic"`.
- From `frontend-design`: one bold element per screen, no all-caps eyebrows, no decorative dividers/numbering, structure encodes information.
- From `dataviz` (Progress): thin marks, 4 px rounded data ends on the baseline, 2 px gaps, markers ≥ 8 px, text in text tokens never series colour, one axis, legend only for ≥ 2 series.

## Open (for the owner; defaults applied under D4)
1. Accent: keep ember orange (`#D9480F` / `#FF7A1A`) or another hue? Default: keep.
2. Font: platform system font (SF on iPhone, system stack on web) or bundle one face (e.g. Inter) so web matches the phone? Default: system; bundling is a 20-min follow-up task.
3. Today phone: set list below the controls (D3) or keep it above? Default: below.

## Log
- 11:18 UI-A start (architect). Skills read: frontend-design, expo-design-system, expo-native-ui, dataviz. Web: 3 searches + 3 fetches (Apple/M3 pages JS-only → VERIFY marks).
- 11:19 Export to `$S/UI-A-dist`; served on 8820 (`wrangler.web.jsonc --assets`). First `ab eval` pass after `open` gave identical numbers at 390 and 1280 → viewport must be set before `open`.
- 11:21 Measurements (390×844 dark): Log set top 828/h 96, tab bar top 785; numeral "100" 128 px wide in a 166 px column; text histogram 15/500 ×21, 20/600 ×13, 13/600 ×13, 64/800 ×8, 40/800 ×4, 28/700 ×1; all tappables ≥ 44. Settings: cards radius 12, rows 65–67 px, segmented inset 4 px. Desktop content column 1064 px at left 108.
- 11:25 Server stopped, port 8820 re-checked free. Docs written: `docs/design/ui-audit.md`, `docs/design/ui-measure.js`, this sheet.
