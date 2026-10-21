# Forge — the final visual direction (UI-C, 2026-10-21)

Owner pick (11:48): A as light theme, C as dark theme, D's big round primary and ± layout, cards; both A and C
"lack design elements like lines, icons"; illustrations without background, also on the log-set page; muscle map
"looks ugly, maybe generate". Refinement (11:55): ± as borderless icon-only controls.
Mockups (session scratchpad `ui-c/`): `forge-{today,library,programs}-{light,dark}.html` → PNGs
`UI-C-forge-*-390.png`, `UI-C-forge-steppers-{light,dark}.png` (borderless vs outlined), `UI-C-contact-sheet.png`.
`gen.py` renders them; the illustration background was cut to alpha by a pixel pass (`*-alpha.png`), the dark
variant is a CSS `invert(1) hue-rotate(180deg)` simulation — see §7.

Supersedes `ui-directions.md` (comparison set) and the UI-1 token list in `docs/tasks/v3-design.md`; keeps
`ui-audit.md` §2 numbers except where §3 below says "change".

## 1. Principles (what makes it one system)
- Same layout in both themes; only the palette and the glow differ. One accent object per screen (the primary
  pill); the active tab and progress marks share the accent, nothing else does.
- Hierarchy by the display face: Barlow Condensed 800 for the numeral, screen title and exercise name; everything
  else is the platform font at ui-audit §2.1 sizes. At most two weights ≥ 600 per region.
- Structure encodes information: hairlines separate groups (app bar / exercise head / weight / reps), cards hold
  lists (set list, day list), rings and segment bars show progress (ring = program, 6 segments = exercises, dots =
  sets), numbered discs on rows (done = success disc with check, now = accent disc, todo = outlined disc).
- Every row and chip has a leading glyph from one 24-grid stroke set; no decorative dividers, no all-caps eyebrows.
- Illustration on every page that names an exercise (Today exercise page, Library list and detail, player, program
  rows): the owner forgets exercises by name.

## 2. Colour tokens (`apps/mobile/src/ui/colors.ts`; contrast on `bg`/`surface` noted, VERIFY in `colors.test.ts`)
| token | light (A) | dark (C) |
| --- | --- | --- |
| `bg` | `#FFFFFF` | `#0F1113` |
| `surface` (cards, grouped lists, pressed stepper) | `#F6F6F7` | `#181B1F` |
| `surfaceRaised` (sheets, popovers, muscle-map body fill) | `#FFFFFF` | `#23272D` |
| `border` (hairlines, todo discs, ring track, progress track) | `#E6E6E8` | `#2C3137` |
| `text` | `#141416` | `#F2F3F5` |
| `textMuted` | `#5F5F66` (5.9:1 on bg, 5.4:1 on surface) | `#A3A8B0` (≈ 8:1 / 7:1) |
| `accent` (primary pill, active tab, now-marks, meta icons) | `#C2410C` ember (unchanged; white on it 5.0:1) | `#FFB020` amber |
| `onAccent` | `#FFFFFF` | `#141210` (≈ 10:1) |
| `accentSoft` | `#FCE9E0` (unchanged) | `#3A2A10` |
| `success` / `successSoft` | `#1E7F3C` / `#E3F3E8` (unchanged) | `#4ADE80` / `#15301F` (unchanged) |
| `danger` / `dangerSoft` | unchanged | unchanged |
| `glow` **new** (primary pill `boxShadow`, numeral `textShadow`) | `transparent` | `rgba(255,176,32,0.35)` |
| `overlay` | unchanged | unchanged |

The "At Home / Gym" chips: `on` = `text` fill with `bg` label in light, `accent` fill with `onAccent` in dark (the
mockup); muscle-map highlight = `accent`, body = `surfaceRaised` + `border` stroke. Status pill "Available at Home"
= `success` text on `surface`, check glyph leading.

## 3. Type (`tokens.ts` `type`; `fonts` is a new export)
Font pair: **Barlow Condensed** (display, bundled, 2 static files `BarlowCondensed-Bold.ttf` 700 and
`BarlowCondensed-ExtraBold.ttf` 800, ≈ 60 KB each, OFL) + the **platform font** for body (SF on iOS, the system
stack on web — Inter is not bundled: it is near-identical to SF, and the splash hold stays short).
Loading plan: `expo-font` (new dependency, Expo SDK package, runs in Expo Go; the only way to bundle a face) with
`useFonts` in `app/_layout.tsx` + `SplashScreen.preventAutoHideAsync` until loaded; web static export gets the
`@font-face` from the expo-font web plugin (VERIFY: `expo export --platform web` emits the font files and
`@font-face`; otherwise add the two `@font-face` rules to `app/+html.tsx`). Fallback while loading / if loading
fails: `fontWeight: "800"` system font — layouts must not depend on the condensed width (see numeral note).
`export const fonts = { display: "BarlowCondensed-ExtraBold", displayBold: "BarlowCondensed-Bold" } as const`
(VERIFY the family name `expo-font` registers; on web it is the key given to `useFonts`).

| variant | size/line | weight | family | use |
| --- | --- | --- | --- | --- |
| `numeral` | **72/76** (change vs audit 56: condensed glyphs are ≈ 0.6 em wide, "107.5" ≈ 180 px at 72; VERIFY by measuring, fall back to 64) | 800 | display | stepper value, rest clock, Best-set hero; dark adds `textShadow` glow |
| `display` | **34/38** | 800 | display | exercise name (Today, Library detail), sign-in title |
| `title` | **28/30** | 800 | display | screen titles (AppBar) |
| `title2` | 22/28 | 700 | system | card titles |
| `headline` | 17/22 | 600 | system | row titles, button labels, the "now" row |
| `body` | 17/22 | 400 | system | prose, how-to steps |
| `subhead` | 15/20 | 400 | system | secondary lines, meta row, "Last set …" |
| `caption` | 13/18 | 500 | system | section labels ("This week"), pills, "Set 2 of 5", rest line |
| `label` | 12/16 | 500 | system | tab labels, stepper unit ("Weight · kg"), disc numbers |

`fontVariant: ["tabular-nums"]` on `numeral`, set-row values and timers (VERIFY Barlow Condensed has `tnum`; if
not, the numeral container gets `minWidth: 170` so the ± do not jump).

## 4. Spacing, radius, elevation (`tokens.ts`)
- `space` unchanged; `gutter = { phone: 16, tablet: 24, desktop: 32 }`; `breakpoints` unchanged.
- `radius = { sm: 8, md: 12, lg: 16, full: 999 }`: cards and grouped lists **`lg` 16** (A's 8 and C's 24 meet
  in the middle; `borderCurve: "continuous"`), chips/pills/steppers/primary `full`, `md` for inputs and sheets,
  `sm` for tiny tiles.
- `stroke = { hairline: 1, outline: 1.5, icon: 2, iconThin: 1.75 }` (outline 2 → 1.5; inactive tab icons 1.75).
- `elevation`: flat in light; dark primary pill `boxShadow: "0 8px 32px " + colors.glow`, numeral
  `textShadowColor: colors.glow, textShadowRadius: 24`. Overlays unchanged.
- Rhythm as ui-audit §2.2: app bar → hairline → sections; `space.xl` between titled groups; set list card starts
  `space.lg` under the rest line.

## 5. Controls (exact)
- **Stepper (`Stepper.tsx`)**: value column (numeral + `label` unit below, muted) between two **borderless**
  icon-only buttons: hit area 64×64 (`sizes.stepperButton`), glyph ± 30 px at 2.5 stroke in `text`, no border, no
  fill; **pressed** = `surface` circle (radius `full`) behind the glyph + haptic; disabled = `textMuted` at 0.4.
  Hairline above and below each stepper row. Outlined-circle variant (D) is **not** built unless the owner picks
  it from `UI-C-forge-steppers-*.png` — Decision D5 default is borderless.
- **Primary pill (`Button` `variant="primary"`)**: `xl` 64 for Log set, `lg` 56 elsewhere, radius `full`, leading
  24 px glyph (`check` on Log set, `plus` on Add, `zap` on Start), label `headline`, `accent` fill / `onAccent`;
  dark glow. Secondary = `surface` fill, `text` label; `text` variant = no fill.
- **Cards**: `surface`, radius `lg`, padding 16; list cards padding `4 16` with rows `minHeight` 44 (52 on
  Programs) separated by hairlines, never a border per row.
- **Rows (`ListRow`)**: leading 24 px disc or glyph, title `headline`/`subhead`, trailing value `subhead` muted,
  optional `chevron` 20 px. Disc states: done (`success` fill, `bg` check), now (`accent` fill, `onAccent`
  number), todo (`border` 1.5 px outline, muted number).
- **Chips (`ToggleChip`)**: height 32, radius `full`, 1 px `border`, leading 16 px glyph, `caption` label;
  on-state per §2.
- **Tab bar**: standard, 56 + inset, 24 px icons (active stroke 2 + `accent`, inactive 1.75 + `textMuted`),
  `label`. Not floating (C's blur bar dropped: needs `expo-blur` + custom tabBar; revisit after v3).
- **App bar**: 56 min; eyebrow row (20 px progress ring + `caption` muted) above `title`; right slot = `subhead`
  counter + 6-segment bar (4 px, gap 3, `accent`/`border`), or a 24 px `more` glyph; hairline below.
- **Progress marks**: ring (`TimerRing` reused: 20 px / 3 stroke in app bars, 44 / 4 in cards), segment bar (one
  segment per exercise), set dots (8 px, done `success`, now `accent` 16 px wide, todo `border`).

## 6. Icons
Source: **hand-drawn paths in `src/ui/Icon.tsx`** (react-native-svg, already installed, 24 grid, round 2 px
strokes). No new dependency: `lucide-react-native` would add a package for ≈ 25 glyphs, and `@expo/vector-icons`
ships whole font files; the existing component already proves the approach on iOS and RN-web. Geometry may be
copied from Lucide (ISC; add the licence line to the file header). Add `strokeWidth` prop (default 2).
Needed names (existing kept): tabs `zap` (Today), `calendar` (Plan), `grid` (Programs), `book` (Library),
`chart` (Progress); rows/chips `home`, `dumbbell`, `kettlebell`, `band`, `bodyweight` (= `user`), `target`
(muscle), `repeat` (reps), `timer`, `clock` (duration), `flame`, `check`, `plus`, `minus`, `swap`, `chevronRight`,
`chevronLeft`, `more`, `info`, `warning`, `search`, `filter`, `mapPin` (location), `settings`, `logout`, `sun`,
`moon`, `close`, `play`, `pause`, `skip`. Sizes: `iconXs` 16 (chips, discs), `iconSm` 20 (rows, meta),
`iconMd` 24 (tabs, buttons), `iconLg` 28 (empty states), stepper glyph 30.

## 7. Illustrations and the muscle map
- Where: Today exercise page (104 px, left of the name — must be visible with the steppers and Log set at
  390×844: mockup Log set bottom ≈ 560 px), Library list rows (56 px), Library detail hero (176 px), player
  (work screen 120 px, rest screen 56 px beside "next"), Programs program rows (56 px).
- Asset contract for IMG-3: **RGBA with a transparent background**, 512 px square, figure in a mid grey
  (`#8A919B`-ish) with the accent muscles, soft ground shadow allowed (it reads on both themes) — one asset for
  both themes. Today's `*.webp` (cream tile) is replaced; until then `ExerciseIllustration` draws the webp inside a
  `surface` 16 px tile. The mockup's dark figure is a CSS invert; the real asset needs no filter.
- Muscle map: two options. (a) **Generated image**, same prompt family as the illustrations, front+back figure on
  transparent, highlighted muscles in the accent — cheap, consistent with the figures, but the UI cannot recolour
  it per theme (needs the accent baked in: one amber and one ember version, or a neutral red that works on both).
  (b) **Redrawn SVG** (`react-native-svg`, ~12 paths per side, fills from tokens) — themeable, tiny, and tappable
  per region later; costs ≈ 2 h of path drawing. UI needs from either: front/back pair, 120×240 aspect, primary
  muscles at full accent, secondary at 50 %, body in `surfaceRaised` + `border`. Default: (a) now if IMG-3's samples
  look right, (b) as the UI-4 follow-up; the detail hero reserves 72×168 px for it on the right.

## 8. Token deltas vs `apps/mobile/src/ui/tokens.ts` (UI-1 scope)
```ts
export const fonts = { display: "BarlowCondensed-ExtraBold", displayBold: "BarlowCondensed-Bold" } as const // new
export const gutter = { phone: 16, tablet: 24, desktop: 32 } as const
export const radius = { sm: 8, md: 12, lg: 16, full: 999 } as const
export const stroke = { hairline: 1, outline: 1.5, icon: 2, iconThin: 1.75 } as const
export const sizes = { tap: 44, control: 48, controlLg: 56, stepperButton: 64, stepperGlyph: 30, logButton: 64,
  iconXs: 16, iconSm: 20, iconMd: 24, iconLg: 28, ringSm: 20, ringMd: 44, chip: 32,
  illustrationSm: 56, illustrationMd: 104, illustrationLg: 176,
  contentMaxWidth: 600, asideMaxWidth: 480, tabBar: 56, appBar: 56 } as const
export const elevation = { flat: undefined, overlay: (c: string) => `0 8px 24px ${c}`, glow: (c: string) => `0 8px 32px ${c}` } as const
// type: numeral 72/76/800 display · display 34/38/800 display · title 28/30/800 display · title2 22/28/700 ·
// headline 17/22/600 · body 17/22/400 · subhead 15/20/400 · caption 13/18/500 · label 12/16/500
```
Colours: §2 table (light: `surface`, `border`, `text`, `textMuted`, `bg`; dark: all surfaces, `text`, `textMuted`,
`accent`, `onAccent`, `accentSoft`; both: `glow`). `illustration` export: figure `#8A919B`, accent unchanged.

## 9. Not decided / for the owner
1. Steppers: borderless (default, D5) or the outlined circle — compare `UI-C-forge-steppers-light.png`.
2. Muscle map: generated image (a) or redrawn SVG (b); default (a) if IMG-3's figure samples are accepted.
