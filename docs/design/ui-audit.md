# UI audit and target scale (v3-design)

Status: accepted (Lead delegation) · Author: architect (UI-A, 2026-10-21 11:18–11:45) · Sheet: `docs/tasks/v3-design.md`
Supersedes the numbers in `docs/design/design-system.md` §2.2–2.3 and the `sizes` block; the rest of that doc (direction, colour roles, provider, primitives API) stays normative. ADR-0014 unchanged (approach), this doc amends its values.

Owner's verdict (11:20): "Sizes, spacing are out. It does not look like well designed app." Measured below; every number comes from `ab eval` on the exported web build (`UI-A-dist`, port 8820, 390×844 dark and 1280×800 light) or from the token file.

## 1. Research: what we can lean on

### 1.1 Installed skills (loaded and read)

| skill | verdict | what we adopt |
| --- | --- | --- |
| `expo:expo-design-system` | **useful** — the audit method and the named "native slop" tells match our defects exactly | one token file; 4-pt grid; "Everything's a Card" → grouped lists with hairlines; `minHeight` never fixed heights (Dynamic Type); pressed state on every Pressable; `gap` over margin; promote a view only when it repeats on 2+ screens; the mirror-the-platform-ramp rule (largeTitle 34, title 22, headline 17/600, body 17, subhead 15, caption 12) |
| `frontend-design:frontend-design` | **useful for critique**, not for numbers | "spend boldness in one place" (one accent object per screen); no all-caps eyebrows, no decorative dividers; structure encodes information; screenshot-and-critique pass before done |
| `expo:expo-native-ui` | **partly** — iOS-only APIs (`Color` from expo-router, SF Symbols, `@expo/ui`) do not render on RN-web, our second platform | `borderCurve: "continuous"`, `boxShadow` strings only, `tabular-nums` on counters, nav-header titles, `contentInsetAdjustmentBehavior="automatic"` |
| `expo:expo-overview` | not needed (routing only; our routes are set) | — |
| `dataviz` | **useful** for Progress | thin marks, 4 px rounded data ends anchored to the baseline, 2 px surface gap between bars, markers ≥ 8 px, line 2 px, recessive grid, text in text tokens never the series colour, one axis, legend only for ≥ 2 series, hover tooltip on web |

### 1.2 Web (3 searches, 3 fetches; Apple and Material pages are JS-rendered and returned only titles)

- Apple HIG text styles (Large/default size), as reproduced by the HIG summaries found ([medium summary](https://medium.com/@klaived/ios-human-interface-guidelines-be9a56a3cfcb), [typography page](https://developer.apple.com/design/human-interface-guidelines/typography.md), and the `expo-design-system` ramp): Large Title 34/41 bold · Title 1 28/34 · Title 2 22/28 · Title 3 20/25 · Headline 17/22 semibold · Body 17/22 regular · Subhead 15/20 regular · Footnote 13/18 regular · Caption 12/16. Minimum text 11 pt; hit target 44×44 pt. `VERIFY:` leading values against developer.apple.com in the engineer's browser (fetch was blocked for the agent).
- Material 3 ([type-scale tokens](https://m3.material.io/styles/typography/type-scale-tokens), [Compose Typography](https://developer.android.com/reference/kotlin/androidx/compose/material3/Typography)): body-large 16/24, title-large 22/28, headline-small 24/32, label-large 14/20; touch target 48 dp; 8 dp grid (4 dp for fine spacing). `VERIFY:` same caveat.
- Fitness-app pattern pieces ([stormotion](https://stormotion.io/blog/fitness-app-ux/), [zfort](https://www.zfort.com/blog/How-to-Design-a-Fitness-App-UX-UI-Best-Practices-for-Engagement-and-Retention), [madegooddesigns](https://madegooddesigns.com/fitness-app-design/)): key figures readable at arm's length; contrast goes to the one important action, everything else muted; primary buttons "comfortably above 44–48", spaced so a sweaty mis-tap does not hit a neighbour; 3–5 tabs. No source gave radius/tab-bar/breakpoint numbers; those below are HIG/M3 defaults plus our measurements.

### 1.3 Verdict for the owner

No plugin or library materially helps. `@expo/ui` (SwiftUI/Compose) does not render on React-Native-web, which is half our surface; NativeWind/Tamagui/Restyle would be a second token system next to `src/ui` (the design-system skill's first rule is "never introduce a second system"); no Expo UI kit ships Strava-class metrics we could not type ourselves in `tokens.ts`. What the research gives us is the *platform ramp and target minimums*, and the two skills give a repeatable audit and chart method. The fix is a token-and-layout fix we do ourselves: ~9 token values, 6 primitives, and the information order on three screens. The `expo-design-system` and `dataviz` rules in §1.1 are worth copying into `.claude/skills/expo-mobile` (list in `docs/tasks/v3-design.md` §Skill rules).

## 2. Target scale (normative; replaces design-system §2.2–2.3 numbers)

### 2.1 Type ramp — `type` in `tokens.ts`

| variant | size/line | weight | use (exact) |
| --- | --- | --- | --- |
| `numeral` | 56/60 | 800, tabular | stepper value, rest clock, Best-set hero. Was 64/68: "107.5" needs ~200 px; at 56 ≈ 170 px |
| `display` | 34/41 | 800 | exercise name on Today, sign-in title, Library detail name (was 40/44) |
| `title` | 28/34 | 700 | screen titles (AppBar) (was 28/32) |
| `title2` | 22/28 | 700 | **new**: card titles (Programs DayCard "Day 2 · Foundation", Progress detail name, "How to") |
| `headline` | 17/22 | 600 | list-row titles, set rows, button labels, Settings row titles (was 20/26 — every row read as a heading) |
| `body` | 17/22 | 400 | prose, inputs, how-to steps (was 17/24) |
| `subhead` | 15/20 | **400** | secondary lines, dates, helper text (was 500: 21 of 60 text nodes on Today were 15/500 → "all semi-bold") |
| `caption` | 13/18 | 500 | section labels, pills, units, chart axis (was 13/16/600) |
| `label` | 12/16 | 500 | **new**: tab-bar labels, stepper unit under numeral |

Rules: weight carries hierarchy, so at most two weights ≥ 600 per screen region; secondary text is 400 and `tone="muted"`, never bold-and-muted. Line length ≤ 70 ch. `allowFontScaling` stays on; rows use `minHeight`.

### 2.2 Spacing, radii, elevation, controls

```ts
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const   // unchanged
export const gutter = { phone: 16, tablet: 24, desktop: 32 } as const                        // desktop 24 → 32
export const radius = { sm: 8, md: 12, lg: 16, full: 999 } as const                          // lg 20 → 16 (stepper, sheets)
export const sizes = { tap: 44, control: 48, controlLg: 56, stepperButton: 64, logButton: 64,
  iconSm: 20, iconMd: 24, iconLg: 28, contentMaxWidth: 600, asideMaxWidth: 480, tabBar: 56, appBar: 56 } as const
export const breakpoints = { tablet: 600, desktop: 900 } as const                            // unchanged
```
- Rhythm: section gap `space.xl` (24) between titled groups; `space.sm` (8) between a section label and its group; `space.md` (12) between cards in a stack; `space.xs` (4) between a row's title and subtitle. Page `contentContainerStyle` gap = `space.xl` (was `space.lg`).
- Card padding 16 all sides; grouped-list rows 16 h / 12 v, `minHeight` 52 (one line) — a one-line row reads 52, a two-line row 64; hairline between rows, no per-row border. Lists of rows are *grouped* (one surface, hairlines), never stacks of cards.
- Buttons: `md` 48 (secondary actions, filter chips), `lg` 56 (the one primary action per screen), `xl` 64 (Log set only). Icon buttons 44. Stepper ± 64, `radius.lg`, surface fill (`surfaceRaised` dark / `surface` light), **1 px** border (was 2 px: reads as a wireframe on white).
- Elevation: flat; only overlays cast `0 8px 24px overlay`. Unchanged.
- Tab bar: 56 content + bottom inset, icon 24, label `label` 12/16, active = accent icon+label. App bar: 56 min, title `title`, hairline bottom on desktop; desktop nav pills right-aligned inside the bar, not beside the title.
- Breakpoints: phone < 600 one column, gutter 16; tablet 600–899 one column, gutter 24, content max 600 centred; desktop ≥ 900 two columns 600 + 24 + 480 centred, gutter 32.
- Touch: every tappable row/control ≥ 44 px high (measured today: all ≥ 44; keep it).

## 3. Per-screen defects (ranked by visual impact; measured)

### 3.1 Today (phone) — rank 1
- **Primary action off-screen.** 390×844 signed-out: steppers at y 584/720, `Log set` (96 px) at y 828; tab bar top 785 → the Log button is under the tab bar; signed in (X1b-today-390-Dark) the 5-row set card (5×56 = 280 px) pushes it further. Fix (UI-2): order = compact header (44) → exercise `display` + "Set 3 of 5" → Weight stepper → Reps stepper → `Log set` (64) → set list *below*, as a grouped list; target: Log button fully visible at 390×844 with the set list's first row visible beneath it.
- **Numeral clipped.** `numeral` 64/800 in a column of 358 − 2×84 − 2×12 = 166 px; "100" measures 128 px, "107.5" ≈ 200 px → renders "10…". Fix (UI-1 tokens): stepper buttons 64, numeral 56 → column 206 px, "107.5" ≈ 170 px. Unit moves inline after the value (`label`, muted, baseline-aligned), not under it (saves 20 px per stepper).
- **Heaviness.** 60 text nodes: 15/500 ×21, 20/600 ×13, 13/600 ×13, 64/800 ×8, 40/800 ×4 — nothing is regular weight. Fix: ramp §2.1 (set rows `headline` 17/600 + `subhead` 15/400).
- **Desktop (1280 light)**: stepper buttons white with 2 px grey border look like wireframes; `Log set` 512×96 is a slab; title "Today / Lower A" and nav pills share one 44 px row with no bar. Fix: UI-1 (border 1 px, surface fill, button 64) + AppBar bar with hairline.

### 3.2 Programs (phone) — rank 2
- DayCard: `Core 30 · Day 2 of 30` 13/600 muted → `Day 2 · Foundation` **28/700** (a screen title inside a card) → seven exercise rows at **28 px pitch** (15/500) → `Start` **96 px outlined grey** (secondary style for the single primary action) → 300 px of empty page. Fix (UI-4): card title `title2` 22; rows as a grouped list, `minHeight` 44, name `body` 17/400, duration `subhead` muted tabular right; `Start` = `lg` 56 **primary accent**; on phone the day list (desktop aside) appears below the card as a grouped list so the page is not empty.
- Status pills `caption` 13/600 ("Upcoming") on a 25 px capsule: fine; keep, weight 500.

### 3.3 Library detail — rank 3
- Muscle map 240 px + illustration 240 px stacked *before* the name: at 390 the name "Goblet Squat" lands at y ≈ 620, under the fold for the thing the user tapped. Fix (UI-3): name `display` + muscles `subhead` + equipment `caption` first; then one hero row: illustration (160×160, `radius.md`) left, muscle map (≤ 160 tall) right; desktop: illustration+map in the 480 aside, text in the 600 column. "How to" steps `body` 17/400 with the step number `caption` muted in a 24 px column.
- "Add to today's session" 56 primary at the bottom: correct; make it sticky above the tab bar on phone (`lg`, gutter, 12 px above inset).

### 3.4 Settings — rank 4
- Each section is a card of 65 px two-line rows; the segmented control sits 4 px from the card edge while text sits 16 px → misaligned; `Sign out` is a 44 px filled red slab inside a card (iOS pattern: a plain destructive text row). Equipment: three 48 px chips "Add gym / Add home / Add bodyweight" wrap to two lines at 390.
- Fix (UI-3): sections stay grouped lists (`caption` 13/500 label, 8 px, group, 24 px to next); row title `headline` 17/600, subtitle `subhead` 15/400; segmented control inset 16 with the helper line under it `subhead` muted; `Sign out` = destructive **text row** (danger tone, 52 min) with "Data on this device is kept." as its subtitle; location presets as a single 48 px row per preset ("Gym · 24 items", trailing "Add") instead of chips.

### 3.5 Progress — rank 5
- Rows 65 px at 20/600 + 15/500 + 13/600 date: readable, but every element is bold. Fix (UI-4): `headline` 17/600 title, `subhead` 15/400 "127.5 kg × 5 · e1RM 148.8 kg", date `caption` 13/500 muted tabular.
- Charts (desktop detail): bars 48 px wide, no gap rule, square ends; sparkline markers ≈ 6 px. Fix per `dataviz`: bar width from geometry with a 2 px gap, 4 px rounded top, baseline hairline `border`, the current week accent and the rest `textMuted` at 40 % — one hue; markers 8 px with a 2 px `bg` ring; "This week 1,175 kg" is the only direct label; axis text `caption` muted. Best-set tile: `numeral` 56 + unit `label`.

### 3.6 Player (desktop) — minor
- The tab nav pills render inside the full-screen player's header (Today/Plan/Programs…): a full-screen activity has no tab nav. Fix (UI-2): `AppBar` prop `nav={false}` for `player` routes. Ring + `numeral` 0:16 + 56 px pause: keep; `Finish workout` becomes `lg` 56 secondary (it is 48 today) and the ± chevrons 44 px icon buttons stay.

### 3.7 Cross-cutting
- Four button heights on one tab (44/48/56/96) and two stepper radii (20) vs cards (12): §2.2 collapses to 44/48/56/64 and 8/12/16.
- Desktop AppBar: title and nav pills in one row with no bar surface: make it a 56 px bar, hairline bottom, pills right-aligned, `caption` 13/500 labels, active pill `accentSoft`.
- Dark `accentSoft` `#3A2316` under the current set reads muddy next to `#FF7A1A`: UI-1 changes dark `accentSoft` to `#2E1C10` (VERIFY contrast of accent text on it ≥ 4.5:1 with `colors.test.ts`).

## 4. Before/after (Today, 390)

```
BEFORE                                 AFTER
Today / Lower A              [user]    Today · Lower A              [user]   (44 bar)
[ Core 30 · Day 2 card              ]  ‹  1 of 4  ›                           (44 row)
‹        1 of 6        ›               Back Squat                              (display 34)
Back Squat (40)                        Set 3 of 5                              (subhead 15/400 muted)
Set 3 of 5                             Weight
[ ✓ 107.5 kg × 5 / RPE 8           ]   [–]   107.5 kg   [+]                  (64 / numeral 56 / 64)
[ ✓ 127.5 kg × 5                   ]   Reps
[ 3  107.5 kg × 5 · RPE 8 (accent) ]   [–]      5 reps  [+]
[ 4 …                              ]   [        Log set 3           ]         (64, accent)
[ 5 …                              ]   ✓ 107.5 × 5   ✓ 127.5 × 5   3 ▸ 107.5 × 5   (grouped list, 52 rows)
Weight                                 [ Core 30 · Day 2 · Start ]            (secondary card, below)
[–]  10…  [+]   (clipped)              ─ tab bar 56 ─
```

## 5. Measurement recipe (done-criteria use it)

```
ab() { agent-browser --session <task> "$@"; }
ab set viewport 390 844; ab set media dark; ab open http://localhost:<A>/today; sleep 2
ab eval "$(cat docs/design/ui-measure.js)"     # → {text: {"17px/22px/600": n, …}, buttons: [[label,w,h,top]…], small: [...], docH}
```
`docs/design/ui-measure.js` (UI-1 commits it) is the script used in this audit: a histogram of `fontSize/lineHeight/fontWeight` over leaf text nodes, every `[role=button]|a[href]|[role=tab]` bounding box, the list of those < 44 px high, and `scrollHeight`. A screen passes when `small` is empty, every histogram key is one of the §2.1 ramp rows, and the screen's stated element positions hold (e.g. Today: `Log set` `top + height ≤ 844 − 56 − inset`).
