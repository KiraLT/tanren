import { Array as Arr } from "effect"
import type { ViewStyle } from "react-native"
import type { ColorRoles } from "./colors"
import type { Scheme } from "./theme"
import { elevation, radius, sizes, space, stroke } from "./tokens"

/**
 * The React-Native-free half of the Forge controls (ui-direction-final §5): sizes, variants and
 * state → style tables, so node tests can pin them. The `.tsx` primitives only wire these up.
 */

// Stepper -------------------------------------------------------------------------------------

export type StepperSize = "lg" | "xl"

/** Hit area per size (`xl` = `sizes.stepperButton` 64) and the ± glyph inside it. */
export const stepperSizes: {
  readonly [S in StepperSize]: { readonly hit: number; readonly glyph: number }
} = {
  lg: { hit: sizes.controlLg, glyph: sizes.iconMd },
  xl: { hit: sizes.stepperButton, glyph: sizes.stepperGlyph },
}

/** ± glyph stroke (§5: 2.5, heavier than the 2 px icon default). */
export const STEPPER_GLYPH_STROKE = 2.5

/** Borderless, fill-less ± button; the `surface` circle appears only while pressed (or hovered). */
export const stepButtonStyle = (
  size: StepperSize,
  state: { readonly pressed: boolean; readonly hovered: boolean; readonly disabled: boolean },
  colors: ColorRoles,
): ViewStyle => ({
  width: stepperSizes[size].hit,
  height: stepperSizes[size].hit,
  borderRadius: radius.full,
  borderWidth: 0,
  backgroundColor:
    !state.disabled && (state.pressed || state.hovered) ? colors.surface : "transparent",
  alignItems: "center",
  justifyContent: "center",
  opacity: state.disabled ? 0.4 : 1,
})

export const stepGlyphColor = (disabled: boolean, colors: ColorRoles): string =>
  disabled ? colors.textMuted : colors.text

// Button --------------------------------------------------------------------------------------

/** `ghost` is a deprecated alias of `text` (kept for existing screens; UI-R removes it). */
export type ButtonVariant = "primary" | "secondary" | "destructive" | "text" | "ghost"
export type ButtonSize = "md" | "lg" | "xl"

export const buttonHeights: { readonly [S in ButtonSize]: number } = {
  md: sizes.control,
  lg: sizes.controlLg,
  xl: sizes.logButton,
}

export interface ButtonColors {
  readonly background: keyof ColorRoles | "transparent"
  readonly foreground: keyof ColorRoles
}

export const buttonVariants: { readonly [V in ButtonVariant]: ButtonColors } = {
  primary: { background: "accent", foreground: "onAccent" },
  secondary: { background: "surface", foreground: "text" },
  destructive: { background: "dangerSoft", foreground: "danger" },
  text: { background: "transparent", foreground: "accent" },
  ghost: { background: "transparent", foreground: "accent" },
}

/** Pill (`radius.full`), height per size; the dark primary pill carries the `glow` shadow. */
export const buttonStyle = (
  variant: ButtonVariant,
  size: ButtonSize,
  scheme: Scheme,
  colors: ColorRoles,
): ViewStyle => {
  const spec = buttonVariants[variant]
  return {
    minHeight: buttonHeights[size],
    minWidth: sizes.tap,
    paddingHorizontal: space.xl,
    borderRadius: radius.full,
    backgroundColor: spec.background === "transparent" ? "transparent" : colors[spec.background],
    alignItems: "center",
    justifyContent: "center",
    ...(variant === "primary" && scheme === "dark"
      ? { boxShadow: elevation.glow(colors.glow) }
      : {}),
  }
}

/** Web hover: filled variants dim a touch, the text variants take the `surface` tint. */
export const buttonHoverStyle = (variant: ButtonVariant, colors: ColorRoles): ViewStyle =>
  buttonVariants[variant].background === "transparent"
    ? { backgroundColor: colors.surface }
    : { opacity: 0.92 }

// Card ----------------------------------------------------------------------------------------

/** Flat `surface` card, radius 16: hairline border in light, none in dark (§4). */
export const cardStyle = (
  scheme: Scheme,
  colors: ColorRoles,
  selected: boolean,
  background: string,
): ViewStyle => ({
  borderRadius: radius.lg,
  borderCurve: "continuous",
  backgroundColor: selected ? colors.accentSoft : background,
  borderWidth: selected ? stroke.outline : scheme === "light" ? stroke.hairline : 0,
  borderColor: selected ? colors.accent : colors.border,
})

export const CARD_PADDING = space.lg

// ListRow -------------------------------------------------------------------------------------

export type DiscState = "done" | "now" | "todo"

export const ROW_MIN_HEIGHT = 52

export interface DiscSpec {
  readonly container: ViewStyle
  readonly foreground: keyof ColorRoles
}

/** 24 px disc: done = `success` + check, now = `accent` + number, todo = 1.5 `border` outline. */
export const discStyle = (state: DiscState, colors: ColorRoles): DiscSpec => {
  const base: ViewStyle = {
    width: sizes.iconMd,
    height: sizes.iconMd,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  }
  const specs: { readonly [S in DiscState]: DiscSpec } = {
    done: { container: { ...base, backgroundColor: colors.success }, foreground: "bg" },
    now: { container: { ...base, backgroundColor: colors.accent }, foreground: "onAccent" },
    todo: {
      container: { ...base, borderWidth: stroke.outline, borderColor: colors.border },
      foreground: "textMuted",
    },
  }
  return specs[state]
}

/** Rows lose their own border inside a `ListGroup` (it draws the hairlines between rows). */
export const rowStyle = (grouped: boolean, selected: boolean, colors: ColorRoles): ViewStyle => ({
  minHeight: ROW_MIN_HEIGHT,
  flexDirection: "row",
  alignItems: "center",
  gap: space.md,
  paddingHorizontal: space.lg,
  paddingVertical: space.sm,
  backgroundColor: selected ? colors.accentSoft : "transparent",
  ...(grouped ? {} : { borderBottomWidth: stroke.hairline, borderBottomColor: colors.border }),
})

/** Pressed/hovered row tint: `surfaceRaised` on a `surface` group, `surface` on the page. */
export const rowPressedBackground = (grouped: boolean, colors: ColorRoles): string =>
  grouped ? colors.surfaceRaised : colors.surface

export const listGroupStyle = (colors: ColorRoles): ViewStyle => ({
  borderRadius: radius.lg,
  borderCurve: "continuous",
  backgroundColor: colors.surface,
  paddingVertical: space.xs,
  overflow: "hidden",
})

/** Hairline between grouped rows, inset to the row text edge. */
export const listSeparatorStyle = (colors: ColorRoles): ViewStyle => ({
  height: stroke.hairline,
  marginLeft: space.lg,
  backgroundColor: colors.border,
})

// Chips and pills -----------------------------------------------------------------------------

/** On: `text`/`bg` in light, `accent`/`onAccent` in dark (§2); off: 1 px `border` outline. */
export const chipColors = (
  selected: boolean,
  scheme: Scheme,
  colors: ColorRoles,
): { readonly background: string; readonly border: string; readonly foreground: string } => {
  if (!selected) {
    return { background: "transparent", border: colors.border, foreground: colors.text }
  }
  return scheme === "light"
    ? { background: colors.text, border: colors.text, foreground: colors.bg }
    : { background: colors.accent, border: colors.accent, foreground: colors.onAccent }
}

/** The visible 32 px pill; the Pressable around it is 44 tall so the tap target stays >= 44. */
export const chipStyle = (selected: boolean, scheme: Scheme, colors: ColorRoles): ViewStyle => {
  const c = chipColors(selected, scheme, colors)
  return {
    height: sizes.chip,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.full,
    borderWidth: stroke.hairline,
    borderColor: c.border,
    backgroundColor: c.background,
  }
}

export type PillTone = "neutral" | "accent" | "success" | "danger"

/** Status pills are tone-coloured text (and glyph) on `surface` (§2 "Available at Home"). */
export const pillForeground: { readonly [T in PillTone]: keyof ColorRoles } = {
  neutral: "textMuted",
  accent: "accent",
  success: "success",
  danger: "danger",
}

// Progress marks ------------------------------------------------------------------------------

export type RingSize = "sm" | "md"

/** §5: 20 px / 3 stroke in app bars, 44 px / 4 stroke in cards. */
export const ringSizes: {
  readonly [S in RingSize]: { readonly size: number; readonly stroke: number }
} = {
  sm: { size: sizes.ringSm, stroke: 3 },
  md: { size: sizes.ringMd, stroke: 4 },
}

export const clamp01 = (value: number): number =>
  Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value))

/** Circle radius, circumference and the dash offset that leaves `progress` of the arc drawn. */
export const ringGeometry = (size: number, strokeWidth: number, progress: number) => {
  const r = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * r
  return { r, centre: size / 2, circumference, dashOffset: circumference * (1 - clamp01(progress)) }
}

const clampCount = (value: number, max: number): number =>
  Math.min(max, Math.max(0, Math.floor(value)))

/** `0 … n-1`, empty for 0 (`Arr.makeBy` would return one element: it is non-empty by type). */
const positions = (n: number): ReadonlyArray<number> => (n === 0 ? [] : Arr.range(0, n - 1))

/** §5 app-bar segment bar: 4 px tall, 3 px gaps, fully rounded ends. */
export const segmentBar = { height: 4, gap: 3, radius: 2 } as const

/** One boolean per segment: the first `filled` are on (`accent`), the rest off (`border`). */
export const segmentFills = (total: number, filled: number): ReadonlyArray<boolean> => {
  const n = clampCount(total, Number.MAX_SAFE_INTEGER)
  const on = clampCount(filled, n)
  return Arr.map(positions(n), (i) => i < on)
}

/** Set dots: the first `completed` are done, the next one is now, the rest todo. */
export const setDotStates = (total: number, completed: number): ReadonlyArray<DiscState> => {
  const n = clampCount(total, Number.MAX_SAFE_INTEGER)
  const done = clampCount(completed, n)
  return Arr.map(positions(n), (i): DiscState => (i < done ? "done" : i === done ? "now" : "todo"))
}

/** §5: 8 px dots, the current one 16 px wide; done `success`, now `accent`, todo `border`. */
export const setDotStyle = (state: DiscState, colors: ColorRoles): ViewStyle => {
  const fill: { readonly [S in DiscState]: string } = {
    done: colors.success,
    now: colors.accent,
    todo: colors.border,
  }
  return {
    width: state === "now" ? 16 : 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: fill[state],
  }
}

// SegmentedControl ----------------------------------------------------------------------------

/** `inset` aligns the control with the 16 px text edge of the card it sits in (§5, UI-X 6). */
export const segmentedInset = (inset: boolean): ViewStyle =>
  inset ? { marginHorizontal: space.lg } : {}
