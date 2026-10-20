import type { TextStyle } from "react-native"

/** Static design tokens (design §2.2). Colours are not here: they resolve per scheme via `useTheme`. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const

/** Screen edge padding per breakpoint. */
export const gutter = { phone: 16, tablet: 24, desktop: 24 } as const

/** Card/button `md`, stepper `lg`, pill `full`. Pair every non-capsule radius with `borderCurve`. */
export const radius = { sm: 8, md: 12, lg: 20, full: 999 } as const

export const stroke = { hairline: 1, outline: 2 } as const

/** Durations in ms; 0 under reduced motion (`Theme.reducedMotion`). */
export const motion = { fast: 120, base: 200, slow: 320 } as const

export const sizes = {
  tap: 44,
  control: 48,
  controlLg: 56,
  stepperButton: 84,
  logButton: 96,
  iconSm: 20,
  iconMd: 24,
  iconLg: 32,
  contentMaxWidth: 560,
  asideMaxWidth: 480,
} as const

/** Window widths (px); `desktop` equals `WIDE_BREAKPOINT` (two columns). */
export const breakpoints = { tablet: 600, desktop: 900 } as const

/**
 * `boxShadow` values (RN 0.88 types `boxShadow?: ReadonlyArray<BoxShadowValue> | string`, and RNW
 * maps it to CSS). `overlay` takes the scheme's `colors.overlay`, so the shadow follows the theme.
 */
export const elevation = {
  flat: undefined,
  overlay: (overlayColor: string): string => `0 8px 24px ${overlayColor}`,
} as const

export type TypeVariant =
  | "numeral"
  | "display"
  | "title"
  | "headline"
  | "body"
  | "subhead"
  | "caption"

/** The type ramp (design §2.3): size, line height and weight; colour comes from `Text` `tone`. */
export const type: { readonly [K in TypeVariant]: TextStyle } = {
  numeral: { fontSize: 64, lineHeight: 68, fontWeight: "800", fontVariant: ["tabular-nums"] },
  display: { fontSize: 40, lineHeight: 44, fontWeight: "800" },
  title: { fontSize: 28, lineHeight: 32, fontWeight: "700" },
  headline: { fontSize: 20, lineHeight: 26, fontWeight: "600" },
  body: { fontSize: 17, lineHeight: 24, fontWeight: "400" },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: "500" },
  caption: { fontSize: 13, lineHeight: 16, fontWeight: "600" },
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
