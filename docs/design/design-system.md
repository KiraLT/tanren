# Tanren design system (v2)

Status: proposed (Lead delegation, plan Amendment 4) · Owner team: **design** (`docs/tasks/v2-design.md`) · Pairs with ADR-0014 (approach).
Normative for every screen in `apps/mobile`. Other teams (catalog, programs) import only from `apps/mobile/src/ui/index.ts` (§4 barrel), never from `src/components/theme.ts` (deleted in D5).

## 1. Direction

Strava-like, made ours: a logger you read at arm's length between sets.
- **Hierarchy by weight, not decoration.** One family (platform system font), a six-step ramp, and the *numbers* are the hero: weights, reps and the rest clock are the largest, heaviest things on screen (`numeral`, tabular). Everything else is quiet sentence case. No all-caps labels, no letter-spaced eyebrows, no middle-dot meta strings in UI chrome (`planFormat` data strings are exempt).
- **One accent** (ember orange) used for the single most important state per screen: the next set, today, the primary button. Never for decoration, never two accented things side by side.
- **Flat.** Cards are a surface tint with a hairline border, no shadow. Only overlays (Banner-as-toast, sheets) cast a shadow. Lists are grouped rows with hairlines, not stacks of cards.
- **Calm neutrals, two schemes.** Light and dark follow the system setting (`useColorScheme`); no in-app toggle in v2. Dark is a true dark grey, not tinted black.
- **Generous whitespace**: 16 px gutters on phone, 24 on tablet/desktop, `space.lg` between sections, `space.sm` inside groups.
- **Motion answers the user.** Press feedback (120 ms), state changes (200 ms), the rest ring (1 Hz steps). No entrance animations. Reduced motion → durations 0.

## 2. Tokens (`src/ui/tokens.ts`, `src/ui/colors.ts`)

Static tokens are module constants (import anywhere). Colours resolve per scheme through `useTheme()` (§3); a static file never imports a colour.

> **Superseded values (UI-1a, 2026-10-21).** The token values below are the v2 set. The normative values are
> now the "Forge" direction, `docs/design/ui-direction-final.md` §2 (colours, incl. the new `glow` role),
> §3 (type ramp with `title2`/`label`, `fonts` export, Barlow Condensed 700/800 bundled via `expo-font` in
> `app/_layout.tsx`, display face on `numeral`/`display`/`title`) and §4/§8 (spacing, radius `lg` 16,
> `gutter.desktop` 32, `stroke`, `sizes`, `elevation.glow`); `tokens.ts` and `colors.ts` implement them and
> `colors.test.ts` / `theme.test.ts` pin them. Role names and the rules in this section still apply.

### 2.1 Colour roles — `ColorRoles` (same keys in both palettes)

| role | light | dark | use |
| --- | --- | --- | --- |
| `bg` | `#FFFFFF` | `#121214` | page |
| `surface` | `#F4F4F5` | `#1C1C1F` | cards, rows, inputs |
| `surfaceRaised` | `#FFFFFF` | `#26262B` | stepper buttons, selected row, tab bar |
| `border` | `#E4E4E7` | `#34343A` | hairlines (1 px), outlines |
| `text` | `#18181B` | `#F4F4F5` | primary text, numerals |
| `textMuted` | `#52525B` | `#A1A1AA` | secondary text (≥ 4.5:1 on `bg` and `surface`) |
| `accent` | `#D9480F` | `#FF7A1A` | primary button, next set, today |
| `onAccent` | `#FFFFFF` | `#121214` | text on `accent` (5.0:1 light, 10:1 dark) |
| `accentSoft` | `#FCE9E0` | `#3A2316` | accent tint for selected/today backgrounds |
| `success` | `#1E7F3C` | `#4ADE80` | done |
| `successSoft` | `#E3F3E8` | `#15301F` | done row background |
| `danger` | `#B3261E` | `#FF6B6B` | missed, errors, destructive |
| `dangerSoft` | `#FBE7E5` | `#3A1A19` | error banner background |
| `focus` | `#1D4ED8` | `#93C5FD` | web keyboard focus ring (2 px) |
| `overlay` | `rgba(0,0,0,0.18)` | `rgba(0,0,0,0.6)` | banner shadow, scrim |

Semantic status mapping (Plan, Programs): `done → success/successSoft`, `today → accent/accentSoft`, `missed → danger/dangerSoft`, `upcoming → textMuted/border`. Exposed as `statusTone: Record<"done"|"today"|"missed"|"upcoming", Tone>` in `tokens.ts` (`Tone = "neutral" | "accent" | "success" | "danger"`).
Illustration colours (static, same in both schemes, §7): `illustration = { figure: "#71717A", accent: "#F0632A" }`.

### 2.2 Scales

```ts
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const
export const gutter = { phone: 16, tablet: 24, desktop: 24 } as const          // screen edge padding
export const radius = { sm: 8, md: 12, lg: 20, full: 999 } as const           // card/button md, stepper lg, pill full
export const stroke = { hairline: 1, outline: 2 } as const
export const motion = { fast: 120, base: 200, slow: 320 } as const            // ms; 0 under reduced motion
export const sizes = { tap: 44, control: 48, controlLg: 56, stepperButton: 84, logButton: 96,
  iconSm: 20, iconMd: 24, iconLg: 32, contentMaxWidth: 560, asideMaxWidth: 480 } as const
export const breakpoints = { tablet: 600, desktop: 900 } as const             // desktop === WIDE_BREAKPOINT (two-column)
export const elevation = { flat: undefined, overlay: "0 8px 24px <overlay>" } as const // boxShadow strings; VERIFY `boxShadow` in RN 0.88 types, else `shadow*` props on native + boxShadow on web
```
Pair every non-capsule radius with `borderCurve: "continuous"` (VERIFY type exists; omit if not).

### 2.3 Type ramp — `type` (`TextStyle` without colour)

| variant | size/line | weight | notes |
| --- | --- | --- | --- |
| `numeral` | 64/68 | 800 | `fontVariant: ["tabular-nums"]`; stepper value, rest clock |
| `display` | 40/44 | 800 | exercise name on Today, sign-in title |
| `title` | 28/32 | 700 | screen titles (AppBar on desktop, inline on phone), plan name |
| `headline` | 20/26 | 600 | card titles, set rows, button labels |
| `body` | 17/24 | 400 | prose, inputs |
| `subhead` | 15/20 | 500 | secondary lines, dates |
| `caption` | 13/16 | 600 | pills, units, tab labels |

Font: platform system (`fontFamily` unset → SF Pro on iOS, Roboto on Android; on web RNW's default stack). `allowFontScaling` stays on; rows use `minHeight`, never fixed heights, so Dynamic Type can grow them. Line length ≤ 70 ch (`contentMaxWidth` 560 enforces it).

## 3. Theme provider (`src/ui/ThemeProvider.tsx`)

```ts
export type Scheme = "light" | "dark"
export interface Theme { readonly scheme: Scheme; readonly colors: ColorRoles; readonly reducedMotion: boolean }
export function ThemeProvider(props: { readonly children: ReactNode; readonly scheme?: Scheme }): JSX.Element // scheme prop = test/story override; default useColorScheme() ?? "light"
export function useTheme(): Theme                     // React.use(ThemeContext); throws never: default theme when no provider (tests)
export function useStyles<T extends StyleSheet.NamedStyles<T>>(factory: (t: Theme) => T): T  // useMemo(StyleSheet.create(factory(theme)), [theme]); factory is a module constant
export function useReducedMotion(): boolean           // AccessibilityInfo.isReduceMotionEnabled + "reduceMotionChanged" (exists in RNW 0.21 and RN)
```
`app/_layout.tsx` wraps the `Stack` in `ThemeProvider`; `StatusBar style` follows `scheme`. Web root background: `Page` paints `colors.bg` full-bleed (the `<body>` default is white; VERIFY whether `expo export` lets us set `backgroundColor` in `app.json` `web`, else `Page` root covers the viewport).

## 4. Component inventory (`src/ui/*.tsx`, barrel `src/ui/index.ts`)

Contract for every primitive: typed `readonly` props, `variant`/`size`/state props only (content via `children`), `style?: StyleProp<ViewStyle>` merged last, pressed feedback on every pressable, `accessibilityLabel` on every control (ui-check targets labels), `testID` not needed. No Effect, no `class`, no `let`.

| component | props (defaults) | variants / states | notes |
| --- | --- | --- | --- |
| `Page` | `children`, `aside?`, `scroll?=false`, `padded?=true`, `header?: ReactNode` | aside shown only at `desktop`; `scroll` wraps in `ScrollView` with `contentContainerStyle` padding + `contentInsetAdjustmentBehavior="automatic"` | replaces `components/Screen.tsx`; `SafeAreaView edges=["top"]`; centred column `contentMaxWidth`, row `560+24+480`; aside `role="complementary"` |
| `AppBar` | `title`, `subtitle?`, `leading?`, `trailing?`, `nav?: ReadonlyArray<{ href, label, active }>` | phone/tablet: title row 56 high; desktop: `nav` links inline, title left | `title` has `accessibilityRole="header"`; `nav` rendered only at `desktop` (D5); hidden tab bar there |
| `Text` | `variant="body"`, `tone="default"` (`default|muted|accent|success|danger|onAccent`), `selectable?`, RN `TextProps` | — | the only way to set font size outside `src/ui` |
| `Card` | `children`, `onPress?`, `selected?=false`, `tone?="neutral"`, `padding?=space.lg` | `selected` → `accent` outline 2 px + `accentSoft` bg; pressed → opacity .85 | flat: `surface` bg, hairline `border`, `radius.md`, no shadow; pressable only when `onPress` |
| `Button` | `label`, `accessibilityLabel?=label`, `onPress`, `variant="secondary"`, `size="md"` (`md 48|lg 56|xl 96`), `icon?: IconName`, `loading?`, `disabled?` | `primary` accent/onAccent · `secondary` surfaceRaised + outline border · `ghost` transparent, accent text · `destructive` dangerSoft bg, danger text; disabled .4; loading → `ActivityIndicator`, label kept for a11y | `headline` label, `radius.md`; replaces `BigButton` |
| `IconButton` | `icon`, `accessibilityLabel`, `onPress`, `size="md"` (`md 44|lg 56`), `variant="ghost"` (`ghost|filled`), `disabled?` | pressed → `surface` bg | 44 px minimum hit area always |
| `Icon` | `name: IconName`, `size=sizes.iconMd`, `color?` (default `text`) | — | react-native-svg paths, 24×24 grid, 2 px round strokes. `IconName` = `chevronLeft \| chevronRight \| chevronDown \| check \| plus \| minus \| close \| play \| pause \| skip \| timer \| calendar \| dumbbell \| list \| grid \| search \| swap \| info \| warning \| flame \| user` |
| `Stepper` | `label`, `valueText`, `unit`, `onDecrement`, `onIncrement`, `disabled?`, `size="xl"` (`lg 56|xl 84` buttons) | pressed → accent bg; `adjustable` role on the value, labels `Decrease/Increase <label>` (unchanged) | value `numeral`, unit `caption muted`; API unchanged from `components/Stepper.tsx` so D2 is a restyle |
| `StatusPill` | `label`, `tone` | `neutral` border/textMuted · `accent` accentSoft/accent · `success` successSoft/success · `danger` dangerSoft/danger | `caption`, `radius.full`, height 24, no outline stroke on soft tones |
| `ListRow` | `title`, `subtitle?`, `leading?`, `trailing?`, `onPress?`, `selected?`, `accessibilityLabel?` | hairline bottom border; selected → `accentSoft`; pressed → `surface` | `minHeight 56`; grouped lists live in a `Card padding={0}` or directly on `bg` |
| `SegmentedControl` | `options: ReadonlyArray<{ value: string; label: string }>`, `value`, `onChange`, `accessibilityLabel` | selected segment `surfaceRaised` + `text`, others `textMuted`; container `surface`, `radius.md` | `accessibilityRole="tablist"`/`tab` + `selected` state; horizontal `ScrollView` when > 4 options. Native `@expo/ui` SegmentedControl not used (web parity) |
| `TimerRing` | `progress: number` (0..1 remaining), `size=220`, `strokeWidth=12`, `tone="accent"`, `children` | track `border`, arc `accent`/`success`; no animation (progress updates ≤ 1 Hz from the hook) | react-native-svg `Circle` with `strokeDasharray`, round caps, `accessibilityRole="timer"` on the wrapper; label supplied by the caller |
| `EmptyState` | `icon?`, `title`, `body`, `action?: { label; onPress }` | — | centred, `title` headline + body muted + one `Button secondary`; also the Failed state (`icon="warning"`) |
| `Banner` | `tone="info"` (`info|success|danger`), `title`, `body?`, `action?`, `onDismiss?` | info `surface`, success `successSoft`, danger `dangerSoft`; `accessibilityRole="alert"` | inline by default; a screen may position it absolutely at the bottom as a toast (`elevation.overlay`). No global toast provider in v2 |
| `Skeleton` | `width`, `height`, `radius=radius.sm` | opacity pulse .5↔1 over `motion.slow`×3 via `Animated.loop`; static under reduced motion | loading states show the screen's skeleton, never a bare spinner; keep `accessibilityLabel="Loading …"` on the container |

Not built (deferred, say why): `Toast` provider (Banner covers v2), `Sheet` (no picker flows yet), `NativeTabs` (unstable; one JS `Tabs` code path is proven at three widths by agent-browser; SF-Symbol/Material icon pairs untested in Expo Go — spike question), `@expo/ui` controls (web parity).

## 5. Responsive rules (`src/hooks/layoutMode.ts` extended)

```ts
export type Breakpoint = "phone" | "tablet" | "desktop"
export const breakpointFor = (width: number): Breakpoint => width >= 900 ? "desktop" : width >= 600 ? "tablet" : "phone"
export const layoutModeFor = (width: number): LayoutMode => breakpointFor(width) === "desktop" ? "two-column" : "single" // unchanged behaviour
export const useBreakpoint = (): Breakpoint => breakpointFor(useWindowDimensions().width)
```
| | phone < 600 | tablet 600–899 | desktop ≥ 900 |
| --- | --- | --- | --- |
| columns | one, full width | one, centred `contentMaxWidth` 560, gutter 24 | two: main 560 fixed + aside ≤ 480 (existing) |
| navigation | bottom tabs (`Tabs`, themed) | bottom tabs | tab bar hidden; `AppBar nav` links (D5) |
| Today | pager page = window width | page = 560; pager `width = min(window, 560)` (existing) | aside: sets + rest ring |
| Plan | day rows, date column 64 | date column 96, cards show blocks | aside: selected session |
| hover/focus (web) | — | — | hover → `surface` tint on rows/cards (VERIFY RNW `Pressable` `hovered` in style fn; else `onHoverIn/Out` state); focus ring `focus` 2 px (`:focus-visible` via `outlineStyle`/`outlineColor`, VERIFY on RNW 0.21) |

Touch targets ≥ 44 everywhere (`sizes.tap`); primary Today controls keep 84/96. Text never scrolls horizontally; `numeral` uses `adjustsFontSizeToFit` with `numberOfLines={1}`.

## 6. Accessibility

Labels on every pressable (sentence case, state in the label: "Log set 2: 82.5 kilograms, 5 reps"); `accessibilityRole` on headers, timers, tabs, alerts; `accessibilityState` for `disabled|selected|busy`. Contrast: all text roles ≥ 4.5:1 on `bg`/`surface` (checked in D1 with a contrast table in the report), `onAccent` ≥ 4.5:1, non-text UI ≥ 3:1. Reduced motion: `useReducedMotion()` zeroes `motion.*` and stops `Skeleton` pulse. Keyboard (web): tab order follows reading order, visible focus ring, `Enter` on inputs submits (sign-in already does).

## 7. SVG illustration style guide (exercise catalog)

Used by the catalog team to generate ≈ 250 files in parallel; every rule here is checkable by a script.

- File: `<illustrationId>.svg`, `illustrationId` = kebab-case ASCII `[a-z0-9-]+` (e.g. `barbell-back-squat`), one figure per file, ≤ 6 KB, UTF-8, no XML prolog, no `<style>`, `<text>`, `<image>`, gradients, filters, masks, scripts or `id` attributes. Root exactly `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" fill="none" stroke-linecap="round" stroke-linejoin="round">`.
- Palette (two colours only, literal hex, both schemes share the file): figure and equipment stroke `#71717A` (`illustration.figure`); working muscle group stroke `#F0632A` (`illustration.accent`), optionally filled `fill="#F0632A" fill-opacity="0.18"`. Nothing else, no black, no white.
- Strokes: `stroke-width="2.5"` for the figure and equipment outlines, `stroke-width="4"` for the accented muscle region only. Every path is stroke-only except the accent fill above.
- Figure (side view by default; front view only when the movement is symmetric and the side view hides it — e.g. lateral raise): simplified line figure, 6 heads tall ≈ 180 px, head a circle `r="14"`, limbs single polylines through joints, no hands/feet detail (round caps end the limb), no face. Standing reference (front view, used to scale every pose): head centre `(120,40)`; shoulders `y=62` from `x=92` to `x=148`; torso rectangle narrows to hips `y=118`, `x=102`–`138`; knees `y=160`; ankles `y=206`; upper arm 36, forearm 34; thigh 44, shank 46. Keep the figure inside `x 24–216, y 20–220`; ground line is implied, never drawn.
- Equipment glyphs (neutral stroke): barbell = one line + two plates (`rect` 12×30, `rx="3"`); dumbbell = bar 24 long + two plates 8×20 `rx="2"`; kettlebell = circle r 12 + handle arc; bench = flat line with two legs 24 high; cable = thin line (`stroke-width="1.5"`) to a corner anchor; bodyweight = no glyph. Floor contact of equipment sits at `y ≤ 214`.
- Muscle accent: the **working muscle group** (from the catalog's `muscleGroup` field) is drawn once as a closed path over the figure segment (quads = thigh region, lats = back of torso, abs = front torso, etc.), stroke 4, optional soft fill. One accent region per file.
- Validation (catalog team runs before commit): file size, root attrs, allowed elements `svg|g|path|circle|rect|line|polyline|ellipse`, allowed colours, stroke widths ∈ {1.5, 2.5, 4}. Render check: 48 px and 160 px in both schemes.

### 7.1 Reference examples (reproduce exactly; these are the acceptance fixtures)

**`barbell-back-squat.svg`** — side view, bottom position, bar on upper back, quads accented.
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" fill="none" stroke-linecap="round" stroke-linejoin="round">
  <g stroke="#71717A" stroke-width="2.5">
    <circle cx="146" cy="58" r="14"/>
    <polyline points="138,70 122,98 104,136"/>            <!-- torso, leaning forward -->
    <polyline points="122,98 150,104 150,126"/>           <!-- arm up to the bar -->
    <polyline points="104,136 150,146 134,208"/>          <!-- back leg: hip, knee, ankle -->
    <polyline points="120,74 98,74"/>                     <!-- bar across the shoulders -->
    <rect x="86" y="59" width="12" height="30" rx="3"/>   <!-- plate -->
  </g>
  <path d="M104 136 L150 146 L146 160 L112 152 Z" stroke="#F0632A" stroke-width="4" fill="#F0632A" fill-opacity="0.18"/> <!-- quads -->
</svg>
```
**`dumbbell-row.svg`** — side view, hinged over, free hand on a bench, lats accented.
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" fill="none" stroke-linecap="round" stroke-linejoin="round">
  <g stroke="#71717A" stroke-width="2.5">
    <circle cx="64" cy="92" r="14"/>
    <polyline points="78,100 130,104 162,124"/>           <!-- torso, nearly horizontal -->
    <polyline points="162,124 150,168 156,208"/>          <!-- leg -->
    <polyline points="96,104 72,132 74,148"/>             <!-- supporting arm to the bench -->
    <polyline points="96,104 112,134 110,150"/>           <!-- rowing arm, dumbbell pulled up -->
    <line x1="44" y1="148" x2="104" y2="148"/>            <!-- bench top -->
    <polyline points="52,148 52,172"/><polyline points="96,148 96,172"/>
    <line x1="98" y1="158" x2="122" y2="158"/>            <!-- dumbbell bar -->
    <rect x="90" y="148" width="8" height="20" rx="2"/><rect x="122" y="148" width="8" height="20" rx="2"/>
  </g>
  <path d="M100 100 L144 108 L140 120 L104 114 Z" stroke="#F0632A" stroke-width="4" fill="#F0632A" fill-opacity="0.18"/> <!-- lats -->
</svg>
```
**`plank.svg`** — side view, forearm plank, abs accented, no equipment.
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" fill="none" stroke-linecap="round" stroke-linejoin="round">
  <g stroke="#71717A" stroke-width="2.5">
    <circle cx="48" cy="118" r="14"/>
    <polyline points="62,124 118,132 212,170"/>           <!-- straight body: shoulder, hip, toes -->
    <polyline points="62,124 54,164 86,164"/>             <!-- forearm on the floor -->
  </g>
  <path d="M76 126 L116 132 L114 144 L76 138 Z" stroke="#F0632A" stroke-width="4" fill="#F0632A" fill-opacity="0.18"/> <!-- abs -->
</svg>
```

## 8. Decided / open (ADR-0014, Lead 2026-10-21)

- Q1 (decided: catalog architect's call, `docs/design/v2-catalog.md`) how the 250 SVGs are stored and loaded; design guarantees `react-native-svg` (D1) and the two colours above.
- Q2 (decided) five JS tabs in `(tabs)/_layout.tsx`: `today`, `plan`, `programs`, `library`, `progress` with icons `timer`, `calendar`, `play`, `grid`, `flame`; Settings (`app/settings.tsx`, root Stack) opens from a gear `IconButton` in the Progress AppBar (`docs/design/v2-extras.md` §2). Desktop `AppBar nav` shows the same five links.
- Q3 (open) `NativeTabs` on iOS: spike later (icons need SF + Material pairs; web view exists in 58.0.24; not proven).
