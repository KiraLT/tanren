# Team charter: polish round 5 (mobile + desktop leftovers, plan Amendment 7)
Status: dispatched 2026-10-27 ~10:00 · Lead: `docs/tasks/step-2.md` Log · previous round: `team-desktop-r4.md`

Mission: close the polish backlog that r4 and REV-POLISH left: the mobile-A and mobile-B
should-fixes queued in `team-desktop-r4.md` ("queued" section), r4's "left for r5" items, the
feed stat tiles (FEED-8) and the Strava status pill baseline. Three disjoint engineer tasks run
**in parallel** (dispatch them in ONE Agent message; children run concurrently only then), one
code review, then the pair loop: capture at 390 and 1280 → designer (fable) → ≤ 1 fix round.
PASS = no captured screen scores < 4.

Facts at dispatch (grep-verified by the Lead 09:55; a claim without output is a guess):
- HEAD `e34ca1e` clean (only `docs/tasks/step-2.md` modified, Lead's). Production = `e34ca1e`.
  No other code stream is live; EM batch 6 edits `.claude/**` and `docs/retro/**` only.
- `formatVolume` is defined twice: `src/components/planFormat.ts:219` and
  `src/components/progress/progressFormat.ts`; consumers `src/components/exerciseStats.ts`,
  `progress/WeekBars.tsx`, `feed/feedGroups.ts` (+ both tests).
- `LocationChip` lives only in `src/library/CatalogFilterBar.tsx`. `ToggleChip` props today:
  `label, selected, onPress, icon?, hitSlop?, compact?, style?` (no `variant`).
- `RecentSession` in `src/library/catalogFormat.ts` and `src/components/progress/ExerciseDetail.tsx`.
- `SECTION_LABEL_HEIGHT`: no hit anywhere → the constant is to be *added* in
  `src/player/components/ProgramHome.tsx` for the literal REV-POLISH flagged.
- `TOOLTIP_PAD_X = 12` at `progress/chartGeometry.ts:90`; `LABEL_ROW` / `LABEL_WIDTH` have no hit
  in `chartGeometry.ts` → locate in `ChartHover.tsx` / `Sparkline.tsx`, or report "not present".
- `loggedVolumeKg` in `src/components/exerciseStats.ts` (+test). `planFormat.ts:181` documents
  "Planned volume … of the done sessions"; whether the Plan week summary *labels* already read
  "Planned …" is unverified → R5a greps `PlanWeek.tsx` / `app/(tabs)/plan.tsx` first.
- `StatRow` = `src/ui/StatRow.tsx`, used by PlanWeek, ExercisePage, ProgramHome, plan.tsx.
  `feed/ActivityStats.tsx:12–24` renders three bespoke flex tiles via `statTiles(activity)`.
- `StatusPill` = `src/ui/StatusPill.tsx`; pill copy in `settings/integrationsCopy.ts`
  (Blocked/danger, Connected/success, failed); rows in `settings/IntegrationsSection.tsx`.
- Ports: 8897 is held by a stale expo (LAND-2). Use web **8911** / API **8912**; probe
  `ps -ef | grep "port 891"` before the first brief; never :8787/:8790/:8081/:8897.
- Gallery badge prefixes in use: K M A X P D DW W F S LA FW R LW LM L MW → this round uses **Q1–Qn**.
  Fragment example: `docs/design/screens/UI-Pdesktop-r4-rows.html`.

Owned paths (exclusive, per task; the team-lead may re-split by interim):
- R5a: `src/components/{planFormat,planUpNext}.ts(+test)`, `src/components/{PlanWeek,PlanDayRow}.tsx`,
  `app/(tabs)/plan.tsx`, `src/components/progress/progressFormat.ts(+test)`,
  `src/player/components/{ProgramHome,PlayerView}.tsx`, `src/player/playerRing*.ts`,
  `src/ui/tokens.ts`, `src/ui/index.ts`, `docs/design/ui-polish.md` (one wording line, marked).
- R5b: `src/ui/ToggleChip.tsx`, `src/library/**`, `src/components/progress/**` except
  `progressFormat.ts(+test)` (R5a's).
- R5c: `src/components/feed/**`, `src/ui/StatusPill.tsx`, `src/components/settings/{IntegrationsSection.tsx,integrationsCopy.ts,integrationsCopy.test.ts}`,
  `src/components/integrations/**`.
- Team: `docs/design/screens/UI-P5-*` captures + `UI-P5-rows.html`, `docs/design/reviews/UI-P5*.md`,
  this sheet (team sheet below).
Read-only: everything else. Keep out entirely (just deployed, or frozen): `app/_layout.tsx`,
`app/(tabs)/today.tsx`, `src/components/{TodayReady,ExercisePage,ExercisePager,SetList}.tsx`,
`src/components/today/**`, `src/services/**`, `src/player/playerMachine.ts`, `src/player/cues.ts`,
`packages/**`, `apps/worker/**`.
Shared: none with the Lead this round. `apps/mobile/CLAUDE.md` only if a Layout fact changes (Edit, marked `shared with Lead`).

Time box: 65 min (R5a ∥ R5b ∥ R5c 20 → REV-R5 8 → fix 5 → capture 10 → designer 8 → fix 5 →
final capture 5). Hard stop = dispatch `date` + 65: report what passed and what did not; a round
starts only when now + engineer + capture + designer ≤ hard stop − 3 min.

Contracts (frozen): Forge tokens only; no new fonts or deps; `ListRow`/`ToggleChip`/`StatRow` APIs
additive only; `pageMaxWidth` 1360 and the column pins in `columns.ts` unchanged; nothing in
`playerMachine.ts`/`cues.ts`; phone layouts of untouched screens byte-identical.

Lead rulings (apply, do not re-decide):
1. Plan week summary labels read "Planned sets / Planned volume" (REV-POLISH, 23:49). Add logged
   figures (`exerciseStats.loggedVolumeKg`) as a second line/tile only when the week has logged
   sets; the designer judges the form.
2. `ToggleChip variant="outline"` (additive prop) replaces `LocationChip`; delete `LocationChip`.
3. `RecentSession` → the shared `ExerciseHistory["recent"]` element type (`.claude/rules/react.md`);
   grep the shared type name in `packages/shared` first; if absent, report instead of inventing.
4. Ring stroke: tokens `stroke.ring` / `stroke.ringSm` in `tokens.ts` with the current literal
   values (`RING_STROKE` in PlayerView, ui-polish line 99), consumed via `src/ui`.
5. FEED-8: `ActivityStats` tiles become `StatRow`; the three-equal-tiles look stays (designer judges).
6. Strava pill: `StatusPill` baseline-aligned with the row title in `IntegrationsSection` at 390
   (strava team follow-up); prove with a `ui-measure` row probe or a 2× crop in the report.
7. ui-polish §Player: R4b found the button-size wording wrong (`Button xl` = 64 = logButton, `lg` = 56).
   Read lines 45–49, fix the one sentence that contradicts it, quote old → new in the report; if
   nothing contradicts, report "no change" with the quote.

Runtime proof: `ui-check` on the exported build signed in to the seeded worker (seeded month,
Programs enrolled on day 3 via the Programs screen). Captures `UI-P5-<route>-{390,1280}-{light,dark}.png`
into `docs/design/screens/` with one `Commit:` per run, routes: plan, programs, play, library,
progress (+ one exercise detail), feed (+ one activity detail), settings/integrations.
`docs/design/screens/UI-P5-rows.html` gallery fragment (badges Q1–Qn, unique), probe tables from
`ui-columns.js` (frame 32/1216 on every route, overflow 0) and `ui-measure.js` (`small: []`,
`contentH` for Page-scroll screens). Session non-null before each capture batch; pid files
guarded (`P=$(cat f); [ "${P:-0}" -gt 1 ] && kill "$P"`).

Tasks (R5a, R5b, R5c dispatched together in ONE message; file sets above are disjoint):
- R5a · engineer/sonnet · 20 · ruling 1, `formatVolume` dedupe (delete the planFormat copy, move
  its tests to progressFormat.test.ts, re-point consumers), `SECTION_LABEL_HEIGHT` in ProgramHome,
  ruling 4 tokens **first** (≤ 4 min, then interim to the team-lead so R5b can consume), ruling 7.
- R5b · engineer/sonnet · 20 · rulings 2–3; Sparkline tooltip strip: hover shots on the first and
  last marker, keep the strip below the header if it hides the trailing value; `TOOLTIP_PAD_X` /
  label constants from tokens (names from R5a's interim; do this item last); `subtitleMaxChars`
  narrow-width test; ProgressRows subtitle wraps to 2 lines at 900 (fix); designer asks from
  REV-POLISH: clamp at the separator, clock glyph on "Last done", dark/light 2–4 px drift VERIFY.
- R5c · engineer/sonnet · 15 · rulings 5–6.
- REV-R5 · reviewer/opus · 8 · combined diff vs this charter + hard rules; blocking-only fix round
  (resume the owning engineer).
- R5d-shoot · engineer/sonnet · 10 · captures + fragment + probes. R5d-design · architect/fable · 8 ·
  scores per screen (`docs/design/reviews/UI-P5.md`), fix list by SendMessage, ≤ 1 fix round, final capture.
Budget: 3 engineers in parallel, 1 reviewer, 1 designer, ≤ 2 review rounds; reports ≤ 40 lines;
interim to the Lead after R5a/b/c land (file list with markers `shared with <stream>` /
`imports untracked <path>`), and at PASS or hard stop.
Forbidden: dependency changes, root config, files outside owned paths, `git commit|push|reset|checkout`,
`rm -r*`, `wrangler *`, `eas *`, the Cloudflare MCP `execute` tool, the owner's ports.
Done when: root `pnpm check` green (paste the tail; nothing else is live in code) · REV-R5 APPROVE
or its blocking findings fixed · designer PASS on the eight routes at 390 and 1280 · fragment +
`Commit:` line · every file touched listed with markers.
Report: team report format from `.claude/agents/team-lead.md`.

---
## Team sheet (team-lead fills: Assumes · Tasks table · Log · Decisions · Escalations)

Header: dispatch 09:58 · hard stop 11:02 · ports web 8911 / API 8912 (probed free) · team-lead opus.
### Assumes (cross-team)
- Lead: no other code stream live; HEAD e34ca1e; production = e34ca1e; seeded worker for captures (R5d-shoot) runs on API 8912.
- Lead: EM batch 6 edits only .claude/** and docs/retro/**.

### Tasks
| id | title | model | depends | box | status |
| --- | --- | --- | --- | --- | --- |
| R5a | rulings 1,4,7, formatVolume dedupe, SECTION_LABEL_HEIGHT | sonnet | - | 20 | dispatched |
| R5b | rulings 2-3, Sparkline tooltip, subtitle fixes | sonnet | R5a tokens (last item) | 20 | dispatched |
| R5c | rulings 5-6 FEED-8 + Strava pill | sonnet | - | 15 | dispatched |
| REV-R5 | combined review | opus | R5a,b,c | 8 | todo |
| R5d-shoot | captures + fragment + probes | sonnet | REV-R5 fixes | 10 | todo |
| R5d-design | designer scores | fable | R5d-shoot | 8 | todo |

### Log
(HH:MM→HH:MM · task · role/model · agent id · tokens · tool uses · rounds · outcome)
- 09:58 · EM batch 6 deltas (engineer item 14 box order, reviewer Layout proofs, ui-check data states) forwarded: briefs of R5d-shoot carry them; R5a/b/c ran before the forward reached me (their reports lack box proofs; R5d-shoot supplied them)
- 09:59→10:11 · R5a · engineer/sonnet · a7fe903b50a7e8fba · 137k · 16+47 · 2 · done; tokens stroke.ring 10 / ringSm 3 / tooltip {12,20,72}; labels Planned sets/volume; logged tile deferred (no data in PlanWeekView, Lead: PLAN-LOG); ui-polish no change
- 09:59→10:11 · R5b · engineer/sonnet · a1f10aa715e9ac47b · 232k · 112+23 · 2 · done; ToggleChip outline, chipVariant.ts, rowDetail.ts, tooltip tokens, clock glyph; fix1: tooltip pill sized to content, desktop chip outline
- 09:59→10:04 · R5c · engineer/sonnet · a8a9a645426fa0c55 · 166k · 45+16 · 2 · done; StatRow variant plain, StatusPill align; fix1 statValueVariant (headline when > 8 chars)
- 10:11→10:12 · REV-R5 · reviewer/opus · a7748e5f417758155 · 96k · 10 · 1 · APPROVE (should: planFormat<->progressFormat cycle; Lead ruled blocking -> fixed by R5a fix1 via leaf volumeFormat.ts)
- 10:12→10:23 · R5d-shoot · engineer/sonnet · a2ba2707c1dac888c · 168k · 71 · 1 · 42 PNG, Q1-Q42 fragment, Commit 4e74a28 dirty 52 (ran concurrently with REV-R5 to fit the hard stop)
- 10:24→10:27 · R5d-design · architect/fable · a0424b5f869d21b55 · 93k · 28 · 1 · PASS (all 4): docs/design/reviews/UI-P5.md
- 10:24→10:27 · fix1 (R5a cycle + controls.ts drift, R5b tooltip/chip, R5c tile) · resumed a7fe903.. a1f10aa.. a8a9a64.. · gate green 954 tests
- 10:28 · fix2 dispatched; AppBar/IconButton need Lead grant (escalated 10:28, no reply by 10:42)
- 10:28→10:29 · fix2 · resumed a1f10aa.. (R5b clampSubtitle at separators) + a8a9a64.. (R5c Apple Health row no longer dimmed: ListRow dims whole row incl. pill, ListRow read-only) · 957 tests
- 10:28→10:33 · R5d-shoot r2 · resumed a2ba2707c1dac888c · Commit be3261a dirty 51 · all fixes verified, drift 0 px
- 10:34→10:37 · R5d-design r2 · fresh ad23ebaa1d331cf18 · fable · PASS 4/4; fix: Duration font stepping makes tiles uneven -> formatDurationCompact
- 10:37→10:38 · fix3 · resumed a8a9a64.. · formatDurationCompact ("1h 10m"), 961 tests
- 10:38→10:40 · R5d-shoot r3 · resumed a2ba2707c1dac888c · feed+activity re-shot, Commit be3261a dirty 82; all tile values 22 px (16/17 cards probed), no clipped leaf
- 10:41 · root `pnpm check` exit 0: 159 files, 1992 tests (SF-1 and logo streams' files in the tree, no reds)

### Decisions
- Lead rulings 10:20 applied: PLAN-LOG deferred; controls.ts granted (cardStyle 1 px transparent border in dark, `granted by Lead 10:20`); ui-polish no change (checked §Player 1-5: line 47 "pause controlLg 56 -> stepperButton 64" concerns the pause disc; no `Button xl` sentence; xl 64 / lg 56 are recorded in apps/mobile/CLAUDE.md); TimerRing/StatRow(plain)/StatusPill(align)/RecentSession ratified; cycle fixed by leaf components/volumeFormat.ts (progressFormat re-exports).
- Ran REV-R5 concurrently with R5d-shoot (fits the hard stop; fixes re-shot in r2/r3).
- Apple Health row: `disabled` dropped in ProviderList (ListRow dims the whole row incl. the pill; ListRow is read-only for us). Designer accepted. Option for the Lead: ListRow `dimLeading` prop.
- Feed Duration tile: formatDurationCompact ("1h 10m"); statValueVariant stays as safety net (> 8 chars -> headline).
- Sparkline strip below the header (+32 px card, empty when not hovered); pill content-sized and clamped. chartGeometry.test.ts keeps the deep `../../ui/tokens` import (barrel pulls react-native into vitest).
- apps/mobile/CLAUDE.md: "Polish round 5" paragraph added after Desktop round 4 + the stale "Feed/Activity tiles are not StatRow" line fixed (shared with Lead).
- R5a TOKENS: src/ui/tokens.ts (exported via src/ui/index.ts): `stroke.ring` = 10 (phone Player ring; PlayerView consumes it, RING_STROKE deleted), `stroke.ringSm` = 3 (20 px ring; ringStrokeFor in TimerRing.tsx consumes it); `tooltip = { padX: 12, labelRow: 20, labelWidth: 72 }` (values of TOOLTIP_PAD_X in chartGeometry.ts and LABEL_ROW/LABEL_WIDTH in Sparkline.tsx, which R5b may now replace by `tooltip.*`).
### Escalations
- OPEN 10:28: src/ui/AppBar.tsx (eyebrow ring renders empty at 0 %, 1280) and src/ui/IconButton.tsx (filled disc surface-on-surface in light: invisible play disc at 1280). Outside our paths; no grant received; not touched. Fix owner R5a a7fe903b50a7e8fba (5 min) + `play` re-shoot via a2ba2707c1dac888c (3 min).
- PLAN-LOG (Lead's follow-up): loggedSets in PlanWeekView (services frozen).
### Integration checklist
