import type { TextStyle } from "react-native"

/** Static design tokens (ui-direction-final §3–§4, §8). Colours resolve per scheme via `useTheme`. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const

/** Screen edge padding per breakpoint. */
export const gutter = { phone: 16, tablet: 24, desktop: 32 } as const

/**
 * Cards and grouped lists `lg` (16), inputs and sheets `md`, tiny tiles `sm`, chips/pills/steppers
 * and the primary button `full`. Pair every non-capsule radius with `borderCurve: "continuous"`.
 */
export const radius = { sm: 8, md: 12, lg: 16, full: 999 } as const

/** Hairlines, outlines (todo discs, chips), icon strokes (inactive tab icons `iconThin`). */
export const stroke = { hairline: 1, outline: 1.5, icon: 2, iconThin: 1.75 } as const

/** Durations in ms; 0 under reduced motion (`Theme.reducedMotion`). */
export const motion = { fast: 120, base: 200, slow: 320 } as const

export const sizes = {
  tap: 44,
  control: 48,
  controlLg: 56,
  stepperButton: 64,
  stepperGlyph: 30,
  logButton: 64,
  iconXs: 16,
  iconSm: 20,
  iconMd: 24,
  iconLg: 28,
  ringSm: 20,
  ringMd: 44,
  chip: 32,
  illustrationSm: 56,
  illustrationMd: 104,
  illustrationLg: 176,
  contentMaxWidth: 600,
  asideMaxWidth: 480,
  tabBar: 56,
  appBar: 56,
} as const

/** Window widths (px); `desktop` equals `WIDE_BREAKPOINT` (two columns). */
export const breakpoints = { tablet: 600, desktop: 900 } as const

/**
 * `boxShadow` values (RN 0.88 types `boxShadow?: ReadonlyArray<BoxShadowValue> | string`, and RNW
 * maps it to CSS). Each takes a scheme colour (`colors.overlay`, `colors.glow`), so the shadow
 * follows the theme; light's `glow` is `transparent`, which renders flat.
 */
export const elevation = {
  flat: undefined,
  overlay: (overlayColor: string): string => `0 8px 24px ${overlayColor}`,
  glow: (glowColor: string): string => `0 8px 32px ${glowColor}`,
} as const

/** Radius of the dark numeral's `textShadow` glow (`textShadowColor: colors.glow`). */
export const glowRadius = 24

/**
 * Font families. `display`/`displayBold` are the bundled Barlow Condensed faces, registered by
 * `useFonts` in `app/_layout.tsx` under exactly these keys (expo-font uses the key as the family
 * name on native and in the web `@font-face`). Body text uses the platform font: no family set.
 */
export const fonts = {
  display: "BarlowCondensed-ExtraBold",
  displayBold: "BarlowCondensed-Bold",
} as const

export type TypeVariant =
  | "numeral"
  | "display"
  | "title"
  | "title2"
  | "headline"
  | "body"
  | "subhead"
  | "caption"
  | "label"

/**
 * The type ramp (ui-direction-final §3): size, line height, weight and family; colour comes from
 * `Text` `tone`. The display face carries `fontWeight` too, so the system fallback (font not yet
 * loaded or failed) still renders heavy; layouts must not depend on the condensed width.
 */
export const type: { readonly [K in TypeVariant]: TextStyle } = {
  numeral: {
    fontFamily: fonts.display,
    fontSize: 72,
    lineHeight: 76,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  display: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, fontWeight: "800" },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 30, fontWeight: "800" },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: "700" },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
  body: { fontSize: 17, lineHeight: 22, fontWeight: "400" },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: "400" },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  label: { fontSize: 12, lineHeight: 16, fontWeight: "500" },
}

export type Tone = "neutral" | "accent" | "success" | "danger"

export type PlanStatus = "done" | "today" | "missed" | "upcoming"

/** Plan/Programs status → tone: done success, today accent, missed danger, upcoming neutral. */
export const statusTone: { readonly [S in PlanStatus]: Tone } = {
  done: "success",
  today: "accent",
  missed: "danger",
  upcoming: "neutral",
}
