# Landing page (signed-out web) — design

Source: plan Amendment 13 (owner 2026-10-26 22:25) · ADR-0021 (routing) · Forge system
(`ui-direction-final.md`), ui-polish principles, page frame per `ui-desktop.md` §1 (`pageMaxWidth` 1360).
Normative for LAND-1 (page), ILL-1 (illustrations), LAND-2 (wiring), LAND-R (designer review).
Every size below is a token from `apps/mobile/src/ui/tokens.ts` or an arithmetic result of one.

## 1. Where it renders
Web only, in `app/_layout.tsx`, when `useAuthGate(pathname) === "sign-in"` (ADR-0021): the Stack stays
mounted under `display: "none"`, `<Landing />` is the visible child of `ThemeProvider`. Scheme follows
the device (ThemeProvider already does). No AppBar, no tab bar, no `APP_NAV`: a stranger sees no chrome.
Component files (LAND-1): `apps/mobile/src/components/landing/Landing.tsx` (screen),
`landingCopy.ts` (+ `landingCopy.test.ts`: every string, pure), `landingImages.ts` (image map, see §5),
`LandingFeature.tsx` (one card). Case-collision check: `ls apps/mobile/src/components | tr A-Z a-z |
sort | uniq -d` printed nothing (2026-10-26); the new dir `landing/` has no sibling `Landing*`.

## 2. Structure and copy (`landingCopy.ts`, exported as `LANDING`)
| key | text |
| --- | --- |
| `eyebrow` | `鍛錬 · TANREN` |
| `meaning` | `tanren: forging. Disciplined training, repeated until it holds.` |
| `headline` | `Log the set. Forge the habit.` |
| `promise` | `A gym logger built for the floor: prefilled weight and reps, big ± steppers, one tap per set, fully offline. Your own Claude reads the history and writes next week's plan.` |
| `cta` | `Sign in` |
| `ctaNote` | `Magic link by email. No password.` |
| `features[0]` | icon `zap` · `Two taps per set` · `Weight and reps come prefilled from last time. Tap ±, tap Log set. The rest timer starts itself, online or not.` |
| `features[1]` | icon `timer` · `Programs that run themselves` · `Guided days like Core 30: seven exercises, fifteen minutes, timed holds and counted reps, rest built in.` |
| `features[2]` | icon `list` · `A feed of what you did` · `Every session as a card: duration, volume, sets, PRs and the muscles you hit, newest first.` |
| `features[3]` | icon `calendar` · `Claude plans the week` · `Connect your own Claude through MCP. It reads your history and writes the plan into the app. The app itself never calls an AI.` |
| `closing` | `Ready to train?` |
| `footer` | `鍛錬 Tanren` / `tanren.me` |
Rules: no numbers that are not true, no testimonials, no store badges. Icons are existing `IconName`s
(`grep -o '^  [a-zA-Z]*:' apps/mobile/src/ui/iconPaths.ts`: zap, timer, list, calendar all present).

## 3. Layout

### 3.1 Phone, 390 (content 390 − 2·`gutter.phone` 16 = 358; `Page` caps at `contentMaxWidth` 600 → 358)
```
[mark 48][TANREN title]            48 row, gap 12 (space.md)
鍛錬 · TANREN  (label, muted)      16
Log the set. Forge the habit.      display 34/38, 2 lines = 76
promise (subhead, muted)           15/20, 4 lines = 80
[ Sign in ]  primary lg            56 (sizes.controlLg), width 358
Magic link by email. No password.  caption 13/18 = 18, muted, centred
┌───────── hero.webp ─────────┐    358 × 358 (square, transparent)
└─────────────────────────────┘
┌ Card ───────────────────────┐    4 × LandingFeature, gap 16 (space.lg)
│ [img 104] title (headline)  │    inner 358 − 2·16 = 326 = 104 + 12 + 210 text
│           body (subhead)    │    height max(104, 22 + 4 + 3·20 = 86) + 32 = 136
└─────────────────────────────┘
Ready to train?  (display)         38
[ Sign in ]  primary lg            56
Magic link by email. No password.  18
[mark 24] 鍛錬 Tanren · tanren.me  caption row 24
```
Vertical: `Page scroll sectionGap={space.xl}` (24) between sections; inside the hero `gap: space.md`
(12); the CTA block `gap: space.sm` (8). Height: 16 + hero (48+12+16+12+76+12+80+12+56+8+18+12+358 = 720)
+ 24 + cards (4·136 + 3·16 = 592) + 24 + CTA (38+8+56+8+18 = 128) + 24 + footer 24 + 16 = **1568**.
PASS band for `docH` at 390: 1450–1700 (fonts and wrap tolerance).
As built (LAND-1/3): `meaning` sits as a centred caption under the footer row (footer 24 → 24 + 4 + 36, two lines at 390).

### 3.2 Desktop, 1280 (`Page scroll wide`: page 1216, inner 1216 − 2·`gutter.desktop` 32 = 1152)
```
┌────────────── 564 ───────────────┐ 24 ┌────────────── 564 ───────────────┐
│ [mark 48] TANREN                 │    │                                  │
│ 鍛錬 · TANREN                    │    │        hero.webp 480 × 480       │
│ Log the set. Forge the habit.    │    │        (centred in 564)          │
│ promise (subhead) ≤ 3 lines      │    │                                  │
│ [ Sign in ] lg, width 240        │    │                                  │
│ caption                          │    │                                  │
└──────────────────────────────────┘    └──────────────────────────────────┘
┌ Card 564 ──────────────────┐ 24 ┌ Card 564 ──────────────────┐   2 × 2 grid, row gap 24
│ [img 176] title / body     │    │ [img 176] title / body     │   inner 532 = 176 + 16 + 340
└────────────────────────────┘    └────────────────────────────┘   height 176 + 32 = 208
Ready to train?   [ Sign in ] 240   caption                        centred column
[mark 24] 鍛錬 Tanren · tanren.me                                   centred
```
Hero: `<Columns split="6/6" main={text} side={image} />` (src/ui, gap `space.xl` 24 → 564 + 24 + 564
= 1152 ✓; `ColumnsView.tsx:60` `alignItems: "flex-start"`, so the text column top-aligns with the image).
Grid: a `View` row, `flexWrap: "wrap"`, `gap: space.xl`, each card `flexBasis: "48%"`, `flexGrow: 1`
(2·564 + 24 = 1152 ✓). Button width at desktop `alignSelf: "flex-start"`, `minWidth: 240`.
Height: 32 + max(hero text 48+12+16+12+38+12+60+12+56+8+18 = 292, image 480) = 480 + 24 + 2·208 + 24
= 440 + 24 + 128 + 24 + 24 + 32 = **1176**. PASS band for `docH` at 1280: 1080–1300.
`display` stays 34 px at desktop: `Text` is the only font-size path and `src/ui` belongs to the
desktop pair this round; the 480 illustration carries the scale (recorded, not a defect).

### 3.3 Tablet 600–899
`Page` without desktop: 600 column, phone stack, hero image 600 − 2·24 = 552 → cap the image at
`sizes.illustrationXl` 240 · 2 = 480 (`maxWidth: 480, alignSelf: "center"`). Not measured this round.

## 4. Primitives and tokens (all from `src/ui`, none added)
| element | primitive / props |
| --- | --- |
| frame | `Page scroll wide sectionGap={space.xl}` (no `header`, no `aside`) |
| mark | `Image` of `assets/brand/mark.png` (dark) / `mark-paper.png` (light) exactly as `app/sign-in.tsx:130–138`; 48 hero, 24 footer, `borderRadius: radius.md` |
| wordmark | `Text variant="title"` `letterSpacing: 4` (`WORDMARK_TRACKING` in sign-in; copy the literal) |
| eyebrow | `Text variant="label" tone="muted"` |
| headline | `Text variant="display" accessibilityRole="header"` |
| promise / card body | `Text variant="subhead" tone="muted"` |
| card title | `Text variant="headline"` with `Icon name size={sizes.iconSm} color={colors.accent}` before it, row gap `space.sm` |
| CTA | `Button label={LANDING.cta} variant="primary" size="lg" onPress={() => router.replace("/sign-in")}` (`ButtonSize` is `"md" \| "lg" \| "xl"`, controls.ts:75) |
| caption | `Text variant="caption" tone="muted"` |
| feature card | `Card` (padding default `CARD_PADDING` = `space.lg` 16, radius from Card), not pressable |
| image slot | `Image` `resizeMode="contain"`, `accessible={false}`, `accessibilityIgnoresInvertColors`; placeholder: `View` `backgroundColor: colors.surface`, `borderRadius: radius.lg`, same size |
Colours only through `useTheme().colors`; no hex in `components/landing`.
Motion: none beyond `Button`'s own hover/press (`interaction.ts`). `useReducedMotion` not needed.

## 5. Illustrations (ILL-1 generates, LAND-2 wires)
Model `gpt-image-1.5`, `POST /v1/images/generations`, `size 1024x1024`, `quality "high"`,
`output_format "png"`, `background "transparent"` — the exact body `scripts/generateLogo.ts:165–180`
sends (`gpt-image-1` is refused on this account). Key via `node --env-file-if-exists=.env.images`;
never printed; API errors through `redactSecrets` (`src/illustrations/imagePrompt.ts:296`).
Raw PNGs → `apps/mobile/assets/landing/raw/` (add to `.gitignore` next to line 27); webp outputs →
`apps/mobile/assets/landing/<id>.webp` with sharp `.resize(size, size, { fit: "contain", background:
{ r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 82, alphaQuality: 90 })` (pattern `shrinkImages.ts:37–39`,
alpha kept). Cost ≈ $0.20 per image, 5 ≈ $1.00 per attempt; existing files skipped on re-run.

One colour set for both schemes (decided; alternative of two variants per motif rejected for budget
and file count): strokes mid slate `#64748B` (contrast 4.7 on `#FFFFFF`, 4.0 on `#0F1113`), one amber
accent `#F59E0B` (the mark's amber). `STYLE` prefix for every prompt:
> Minimal Japanese sumi-e brush illustration: a few bold tapered ink strokes with dry-brush ends, flat
> solid fills in muted slate (#64748B), exactly ONE accent stroke in amber (#F59E0B), nothing else
> coloured. Transparent background, no backdrop shape, no floor, no shadow, no gradient, no texture, no
> outline, no text, no letters, no logo. Square, centred, generous margin (about 12 percent), 2D vector look.

| id / file | motif (appended to STYLE) | webp px | shown 390 / 1280 | budget |
| --- | --- | --- | --- | --- |
| `hero` | `One athlete at the top of a barbell deadlift, bar at hip height, seen in three-quarter view, body in slate strokes; the barbell is the single amber stroke.` | 1024 | 358 / 480 | ≤ 450 KB |
| `log` | `A stack of three round weight plates seen slightly from above, two slate and the top one amber, with a bold plus sign drawn as two brush strokes floating above them.` | 512 | 104 / 176 | ≤ 150 KB |
| `program` | `One athlete holding a plank in side view, slate strokes, under a three-quarter circular amber arc like a timer ring above the body.` | 512 | 104 / 176 | ≤ 150 KB |
| `feed` | `Three stacked rounded rectangles drawn as brush outlines, offset like cards in a pile, the front card carrying one short amber horizontal stroke.` | 512 | 104 / 176 | ≤ 150 KB |
| `plan` | `Seven small squares in a row drawn as rough brush outlines, like a week, the fourth square filled solid amber, a single slate check stroke above it.` | 512 | 104 / 176 | ≤ 150 KB |
Total budget: `du -sh apps/mobile/assets/landing` ≤ 1.5 MB (expected ≈ 1.0 MB). Metro already bundles
webp requires (`src/illustrations/images.ts`).

`landingImages.ts` (LAND-1 writes the stub, LAND-2 fills it; ILL-1 never touches it):
```ts
export type LandingImageId = "hero" | "log" | "program" | "feed" | "plan"
export const LANDING_IMAGES: { readonly [K in LandingImageId]: Option.Option<ImageSourcePropType> }
// LAND-1: every entry Option.none()  →  LAND-2: Option.some(require("../../../assets/landing/hero.webp")) …
```

## 6. Accessibility
- Headline and `closing`: `accessibilityRole="header"`; feature titles plain `headline` text.
- Both Sign-in buttons: 56 px tall (≥ 44), label "Sign in", `accessibilityLabel` "Sign in with a magic link".
- Illustrations decorative: `accessible={false}` + `accessibilityIgnoresInvertColors`; the copy carries meaning.
- Contrast: `textMuted` on `bg` 5.9 (light) / 8.5 (dark); `onAccent` on `accent` per Forge tokens.
- Focus ring: Button's existing web focus style (`interaction.ts`); landing adds none.
- Root `View` `testID="landing"` (RNW → `data-testid`, as `page-frame` already relies on).

## 7. Verification (LAND-1 captures; LAND-R scores)
Capture set `UI-LAND-{390,1280}-{light,dark}.png` in `docs/design/screens/`, each with `Data state:`
fresh agent-browser session (`--session LAND-1`, no stored owner, no local sets, `EXPO_PUBLIC_DEV_USER_ID`
unset in the export), `Scheme:` via `set media`, `Commit:` HEAD, `Routes:` `/`.
Probes (`docs/design/ui-measure.js`, `docs/design/ui-columns.js`), run per scheme:
| measure | PASS |
| --- | --- |
| `small` (buttons < 44 tall) | `[]` |
| `docH` (= the `Page scroll` ScrollView content height, max `scrollHeight` of scrollable divs; document `scrollHeight` is only the viewport) | 390: 1450–1700 · 1280: 1080–1300 |
| `[data-testid=page-frame]` width | 390: 390 · 1280: 1216 (left 32 ± 1) |
| `ui-columns.js` `cols` at 1280 | two rects, widths 564 ± 2, equal `top` |
| `[role=navigation]` | absent on every gated route |
| `[data-testid=landing]` present | `/`, `/today`, `/feed`, `/library`, `/settings`, `/progress`, `/programs` signed out |
| `/sign-in` | the sign-in form, `[data-testid=landing]` absent; `/auth/callback` unchanged |
| text histogram | only ramp sizes 34/38, 28/30, 17/22, 15/20, 13/18, 12/16 |
LAND-R scores each section (hero, features, CTA, footer) 1–5 at 390 and 1280 against ui-polish §1:
PASS = no section < 3 and every probe row green; two fix rounds at most.

## VERIFY (engineer, against installed types)
- `display: "none"` on the Stack wrapper keeps Expo Router navigation working for `router.replace`
  from outside the navigator (ADR-0021 §3). Fallback: `position: "absolute", width: 1, height: 1,
  opacity: 0, overflow: "hidden"` + `aria-hidden` (ui-measure skips both).
- `Image` from `react-native` renders a transparent webp on web without a background flash.
