# UI-NUTRI r1 — designer verdict on the nutrition screens (N-MD, 2026-10-27 15:50)

Scored against `docs/design/nutrition.md` §6 as amended by the team decisions (2×2 hero tiles, `StatRow plain` week
card, 24 px strip indent, "Burned: no data" kept, commas) and `docs/design/ui-polish.md` (fill the page, one rhythm,
no orphan elements). Shots: `docs/design/screens/UI-NUTRI-{N1,N2,N3}-*`. No `daily_health` rows in the seed, so the
burned bar never rendered; its colour is judged from `apps/mobile/src/ui/colors.ts`.

## Verdict

| screen | 390 light | 390 dark | 1280 light | 1280 dark | verdict |
| --- | --- | --- | --- | --- | --- |
| N1 Today strip | 4 | 4 | 4 | 4 | PASS |
| N2 Health Ready | 3 | 3 | 3 | 3 | FIX (F1–F4; F5 copy) |
| N3 Health Off | 4 | 4 | 4 | 4 | PASS |

N1: 72 px strip, 16 under the AppBar, three lines at caption with the accent "2,101 kcal left" tabular on the right;
rows 2–3 align under the label (24 px indent) in both schemes; no ellipsis at 358 or 632. Nothing to change.
N3: `EmptyState` [16,77,358,240] / [64,77,1152,240] matches the other Off/Empty routes (UI-D frame rule); the
secondary "Set goal" pill is the primitive's only action style — consistent with Library/Feed empties, accepted.
N2: hero, protein card, insights, week card and food log are on-spec and read as one system. The 7-day chart is the
screen's weak point in every cell: two accent pills float in a 120 px void with no track, no legend and no heading
(ui-polish "does not fill the page"), the empty days are invisible, and at 1280 the 18 px bars sit in 87 px columns.

## Answers to the engineers' questions

- Burned bar in `colors.border`: too faint in BOTH schemes. On `bg` the contrast is #E6E6E8 / #FFFFFF ≈ 1.3:1 (light)
  and #2C3137 / #0F1113 ≈ 1.5:1 (dark); a data mark needs ≥ 3:1 (WCAG 1.4.11). Use `colors.textMuted`
  (light #5F5F66 ≈ 5.9:1, dark #A3A8B0 ≈ 8:1). `border` stays the track/hairline role it has everywhere else.
- Legend: yes, once two tones share a column. One `label muted` row above the bars (F3); it also gives the section
  the heading it lacks (every other Health section is a titled card).

## Fix list (ranked; one engineer round)

| # | file · component | change |
| --- | --- | --- |
| F1 | `src/components/health/DayBars.tsx` burned bar | `backgroundColor: colors.border` → `colors.textMuted` (light #5F5F66, dark #A3A8B0). Eaten stays `colors.accent` (#C2410C / #FFB020). Update the doc comment "(border tone)" → "(muted tone)". |
| F2 | `DayBars.tsx` column track | Behind each column's bar pair draw a track `View` of `BAR_AREA` (120) × (2·barWidth + 4) px, `backgroundColor: colors.surface` (light #F6F6F7, dark #181B1F), `borderRadius: radius.sm`, `position: "absolute", bottom: 0`; bars render on top, so "upcoming" and "no data" read as empty columns, not nothing. Track on `bg`: #F6F6F7 / #FFFFFF and #181B1F / #0F1113 — a faint column like the `SegmentBar` track, not a data mark. |
| F3 | `DayBars.tsx` legend row | Above the bars, a row `flexDirection: "row", gap: space.md, justifyContent: "flex-end"`, height 16: two items of (8 px dot `borderRadius: 4`, `colors.accent` / `colors.textMuted`) + `space.xs` + `Text variant="label" tone="muted"` "Eaten" / "Burned". Section height 140 → 16 + `space.sm` 8 + 140 = 164 at 390 (hero 157+72 → chart top 277+24 = 301, protein card 482 instead of 458). Legend width ≤ 2·(8 + 4 + 48) + 16 = 136 ≤ 358 ✓. Mark the row `accessibilityElementsHidden` — each column already speaks "eaten … burned …". |
| F4 | `DayBars.tsx` + `app/health/index.tsx` bar width | Add `readonly barWidth?: 18 \| 28` (default 18); index passes `barWidth={desktop ? 28 : 18}` (`desktop` is already in scope, `useBreakpoint() === "desktop"`). 1280: column (658 − 48)/7 = 87 ≥ 2·28 + 4 = 60 ✓; 390: 44 ≥ 40 ✓. |
| F5 | `packages/shared/src/nutrition.ts` insight copy (`averaged`) | "Protein averaged 122 g, target 155: plan …" → "Protein averaged 122 g of 155 g: plan a protein source per meal" (unit on both numbers; `nutritionText.test.ts` / the shared insight test that pins this string changes with it — grep `averaged`). |

Out of scope, notes for the Lead: `IconButton` has no `tone="danger"` (food-log trash renders in `text`); the
neutral glyph is acceptable in Forge and I would not add the prop for this alone. `EmptyState` offers only a
secondary action; fine here. The `HealthHero` "Burned: no data" `label` line under the tiles is an orphan at 1280
(158 px tiles, a 12 px caption, then 32 px of air) but earns its place once Garmin data shows "as of HH:MM"; leave it.

Re-measure after the fix: DayBars `[16,301,358,140]` at 390 (legend at 277), burned-bar `backgroundColor` equals
`textMuted` in both schemes, and the 1280 column shows 28 px bars; re-shoot N2 at 390 and 1280 in both schemes.

## r2 (15:57) — N2 Health Ready re-scored against F1–F4

Re-shot `docs/design/screens/UI-NUTRI-N2-health-{390,1280}-{light,dark}.png` opened; engineer's measurements read
against the r1 numbers: 390 section [16,277,358,164] (legend 16 at 277, chart row [16,301,358,140], protein card
top 482) and 1280 section [64,197,658,164] with 28 px bars, 60 px tracks — all as F3/F4 computed. Computed colours:
burned #5F5F66 / #A3A8B0 (= `textMuted`, F1), track #F6F6F7 / #181B1F (= `surface`, F2), eaten #C2410C / #FFB020.

| screen | 390 light | 390 dark | 1280 light | 1280 dark | verdict |
| --- | --- | --- | --- | --- | --- |
| N2 Health Ready | 4 | 4 | 4 | 4 | PASS |

The seven surface tracks turn the void into a chart in both schemes; upcoming days now read as empty columns, the
"Eaten / Burned" legend sits right-aligned on the track row at `label muted` and gives the section its heading, and
the 28 px bars fill the 87 px desktop columns. Nothing left on the chart. Still true and still accepted: the burned
bar itself is unseen (seed has no `daily_health`; colour proven by computed style), the "Burned: no data" label under
the hero is a small orphan at 1280 that earns its place once Garmin writes "as of HH:MM". F5 (copy in
`packages/shared/src/nutrition.ts`) is with the Lead and does not affect the verdict.
