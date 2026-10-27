import { Array as Arr } from "effect"
import type { ViewStyle } from "react-native"
import type { ColorRoles } from "./colors"
import type { Scheme } from "./theme"
import { elevation, radius, sizes, space, stroke } from "./tokens"

/**
 * The React-Native-free half of the Forge controls (ui-direction-final §5): sizes, variants and
 * state → style tables, so node tests can pin them. The `.tsx` primitives only wire these up.
 */

/** One dimming for every disabled control (stepper buttons, rows). */
export const DISABLED_OPACITY = 0.4

// Stepper -------------------------------------------------------------------------------------

export type StepperSize = "lg" | "xl" | "xxl"

/**
 * Hit area per size (`xl` = `sizes.stepperButton` 64) and the ± glyph inside it. `xxl` (72, ui-polish
 * D3) is the desktop size and renders its numeral as `numeralLg` (`stepperNumeral`).
 */
export const stepperSizes: {
  readonly [S in StepperSize]: { readonly hit: number; readonly glyph: number }
} = {
  lg: { hit: sizes.controlLg, glyph: sizes.iconMd },
  xl: { hit: sizes.stepperButton, glyph: sizes.stepperGlyph },
  xxl: { hit: 72, glyph: 34 },
}

/** Ramp step of the stepper value: `numeralLg` at `xxl`, `numeral` otherwise. */
export const stepperNumeral = (size: StepperSize): "numeral" | "numeralLg" =>
  size === "xxl" ? "numeralLg" : "numeral"

/** The line under the value: "Weight · kg", or just "Reps" when the unit repeats the label. */
export const stepperCaption = (label: string, unit: string): string =>
  unit.toLowerCase() === label.toLowerCase() ? label : `${label} · ${unit}`

/** Narrowest window whose value column holds "107.5" at the full 72 px numeral (UI-R 2). */
export const NUMERAL_FULL_WIDTH = 375

/**
 * Web numeral scale (RNW has no fit-to-width): 1 from `NUMERAL_FULL_WIDTH` up, linear below it,
 * so "107.5" stays inside the value column on 320–374 px windows.
 */
export const numeralScale = (windowWidth: number): number =>
  windowWidth >= NUMERAL_FULL_WIDTH ? 1 : Math.max(0, windowWidth) / NUMERAL_FULL_WIDTH

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
  opacity: state.disabled ? DISABLED_OPACITY : 1,
})

export const stepGlyphColor = (disabled: boolean, colors: ColorRoles): string =>
  disabled ? colors.textMuted : colors.text

// Button --------------------------------------------------------------------------------------

export type ButtonVariant = "primary" | "secondary" | "destructive" | "text"
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

/**
 * Flat `surface` card, radius 16: a 1 px hairline in light, a 1 px transparent border in dark (§4),
 * so a card measures the same height in both schemes.
 */
export const cardStyle = (
  scheme: Scheme,
  colors: ColorRoles,
  selected: boolean,
  background: string,
): ViewStyle => ({
  borderRadius: radius.lg,
  borderCurve: "continuous",
  backgroundColor: selected ? colors.accentSoft : background,
  borderWidth: selected ? stroke.outline : stroke.hairline,
  borderColor: selected ? colors.accent : scheme === "light" ? colors.border : "transparent",
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
export const rowStyle = (
  grouped: boolean,
  selected: boolean,
  colors: ColorRoles,
  thumb = false,
): ViewStyle => ({
  minHeight: thumb ? THUMB_ROW_MIN_HEIGHT : ROW_MIN_HEIGHT,
  flexDirection: "row",
  alignItems: "center",
  gap: space.md,
  paddingHorizontal: space.lg,
  paddingVertical: thumb ? space.xs : space.sm,
  backgroundColor: rowBackground(selected, colors),
  ...(grouped ? {} : { borderBottomWidth: stroke.hairline, borderBottomColor: colors.border }),
})

export type RowTone = "default" | "danger"

/** Title ramp of a row: `headline` by default; `body` for dense lists (Library steps). */
export type RowTitleVariant = "headline" | "body" | "subhead"
export const ROW_TITLE_VARIANT: RowTitleVariant = "headline"

/** Background of a row: `accentSoft` when selected, otherwise transparent whatever the tone. */
export const rowBackground = (selected: boolean, colors: ColorRoles): string =>
  selected ? colors.accentSoft : "transparent"

/** Per tone: the title's `Text` tone and the colour role of the leading glyph. */
export const rowTones: {
  readonly [T in RowTone]: {
    readonly title: "default" | "danger"
    readonly icon: keyof ColorRoles
  }
} = {
  default: { title: "default", icon: "textMuted" },
  danger: { title: "danger", icon: "danger" },
}

/**
 * What a pressable row announces: a button (`selected`), or a switch when it carries `checked`
 * (the eat-back row). `aria-checked` is for web: react-native-web reads only `disabled` from
 * `accessibilityState`.
 */
export type RowAccessibility =
  | {
      readonly accessibilityRole: "button"
      readonly accessibilityState: { readonly selected: boolean; readonly disabled: boolean }
    }
  | {
      readonly accessibilityRole: "switch"
      readonly accessibilityState: { readonly checked: boolean; readonly disabled: boolean }
      readonly "aria-checked": boolean
    }

export const rowAccessibility = (
  selected: boolean,
  disabled: boolean,
  checked: boolean | undefined,
): RowAccessibility =>
  checked === undefined
    ? { accessibilityRole: "button", accessibilityState: { selected, disabled } }
    : {
        accessibilityRole: "switch",
        accessibilityState: { checked, disabled },
        "aria-checked": checked,
      }

/** Trailing chevron of a row that opens something: 20 px, `textMuted`. */
export const rowChevron = { glyph: sizes.iconSm, color: "textMuted" } as const satisfies {
  readonly glyph: number
  readonly color: keyof ColorRoles
}

/**
 * Pressed/hovered row tint: `surfaceRaised` on a `surface` group, `surface` on the page. A danger
 * row is always `surfaceRaised` (its background is transparent, never a filled slab).
 */
export const rowPressedBackground = (
  grouped: boolean,
  colors: ColorRoles,
  tone: RowTone = "default",
): string => (grouped || tone === "danger" ? colors.surfaceRaised : colors.surface)

export const listGroupStyle = (colors: ColorRoles): ViewStyle => ({
  borderRadius: radius.lg,
  borderCurve: "continuous",
  backgroundColor: colors.surface,
  paddingVertical: space.xs,
  overflow: "hidden",
})

/**
 * Desktop AppBar with the nav links: leading + title share one slot of this width, so the links
 * start at the same x on every route (the title used to size the slot: 137..275 px across routes).
 * 280 leaves 520 for links + trailing at the 836 px page of a 900 window (links ~350, trailing ~100).
 */
export const APP_BAR_TITLE_SLOT = 280

/**
 * Width of a row's leading icon slot: the 20 px glyph of `ListRow icon`, and the empty slot of
 * `leading={null}`, so both put the title at 16 + 20 + 12 = 48.
 */
export const ROW_ICON_SLOT = sizes.iconSm

/** Where a grouped hairline starts: the row edge, after a 20 icon slot, or after a 56 thumb. */
export type SeparatorInset = "none" | "icon" | "thumb"

/** 16 / 16 + 20 + 12 = 48 / 16 + 56 + 12 = 84 (ui-polish D5): the text start, not the leading art. */
export const separatorInsets: { readonly [I in SeparatorInset]: number } = {
  none: space.lg,
  icon: space.lg + ROW_ICON_SLOT + space.md,
  thumb: space.lg + sizes.illustrationSm + space.md,
}

/** Hairline between grouped rows, inset to the row text edge (default 16). */
export const listSeparatorStyle = (
  colors: ColorRoles,
  inset: SeparatorInset = "none",
): ViewStyle => ({
  height: stroke.hairline,
  marginLeft: separatorInsets[inset],
  backgroundColor: colors.border,
})

/** Row with a 56 thumb: 64 high, vertical padding 4 (the thumb sets the height). */
export const THUMB_ROW_MIN_HEIGHT = 64

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

/** Tap-target overhang of a chip above and below its 32 px pill (32 + 2 x 6 = 44). */
export const CHIP_COMPACT_SLOP = (sizes.tap - sizes.chip) / 2

/**
 * Layout of the Pressable around a chip's 32 px pill. Always `sizes.tap` (44) tall, so the target
 * is real on every platform (react-native-web ignores `hitSlop`). `compact` pulls it by
 * `-CHIP_COMPACT_SLOP` above and below, so in a row it occupies only the pill's 32 and the
 * 6 px overhangs (hit area only) overlap the row gap. Default: no margin, unchanged.
 */
export const chipPressableStyle = (compact: boolean): ViewStyle => ({
  minHeight: sizes.tap,
  justifyContent: "center",
  ...(compact ? { marginVertical: -CHIP_COMPACT_SLOP } : {}),
})

/** `numberOfLines` for a row's title or subtitle: absent (RN default, unlimited) when `undefined`. */
export const rowLinesProps = (lines: number | undefined): { readonly numberOfLines?: number } =>
  lines === undefined ? {} : { numberOfLines: lines }

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

export interface RingSpec {
  readonly size: number
  readonly stroke: number
}

/** Resolved ring box: the size preset, with an optional `stroke` and/or `diameter` override. */
export const ringSpec = (
  size: RingSize,
  overrides: { readonly stroke?: number | undefined; readonly diameter?: number | undefined } = {},
): RingSpec => ({
  size: overrides.diameter ?? ringSizes[size].size,
  stroke: overrides.stroke ?? ringSizes[size].stroke,
})

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

export type SetDotsVariant = "dot" | "pill"

/** Gap between pill marks (ui-polish §3 Today 2). */
export const SET_PILL_GAP = 4

/** Pill marks: 10 x 6, the current one 16 x 6; done `textMuted`, now `accent`, todo `border`. */
export const setPillStyle = (state: DiscState, colors: ColorRoles): ViewStyle => {
  const fill: { readonly [S in DiscState]: string } = {
    done: colors.textMuted,
    now: colors.accent,
    todo: colors.border,
  }
  return {
    width: state === "now" ? 16 : 10,
    height: 6,
    borderRadius: 3,
    backgroundColor: fill[state],
  }
}

// SegmentedControl ----------------------------------------------------------------------------

/** `inset` aligns the control with the 16 px text edge of the card it sits in (§5, UI-X 6). */
export const segmentedInset = (inset: boolean): ViewStyle =>
  inset ? { marginHorizontal: space.lg } : {}

// StatRow -------------------------------------------------------------------------------------

/** Gap between the equal-width slots of a `StatRow`. */
export const STAT_GAP = space.lg

/** Gap between stacked tiles of a `StatRow variant="tile" direction="column"`. */
export const STAT_TILE_STACK_GAP = space.sm

/** Gap between the slots of a `dense` tile row (a 340 block at 900: 3 x 108 instead of 3 x 102). */
export const STAT_GAP_DENSE = space.sm

/**
 * One `StatRow variant="tile"` tile: `surface`, radius 16, 72 high, 16 side padding (12 `dense`),
 * content centred.
 */
export const statTileStyle = (colors: ColorRoles, dense = false): ViewStyle => ({
  height: sizes.statTile,
  backgroundColor: colors.surface,
  borderRadius: radius.lg,
  paddingHorizontal: dense ? space.md : space.lg,
  justifyContent: "center",
  gap: 2,
})

/** Width of one slot of a `StatRow`: `(inner - gaps) / count` (358 inner, 3 slots -> 108.67). */
export const statSlotWidth = (inner: number, count: number): number =>
  count <= 0 ? 0 : Math.max(0, (inner - STAT_GAP * (count - 1)) / count)

/**
 * Narrowest control block (px) that holds a 96 px "107.5" between two 72 px ± buttons: 2 x (72 + 8) +
 * about 215 for the numeral, with slack for four digits. Below it (900 px: 404 - 64 = 340) the
 * stepper stays `xl`, otherwise the numeral runs into the buttons.
 */
export const STEPPER_XXL_MIN_INNER = 440

/** `xxl` when the block is wide enough for the 96 numeral, else `xl`. */
export const stepperSizeFor = (innerWidth: number): StepperSize =>
  innerWidth >= STEPPER_XXL_MIN_INNER ? "xxl" : "xl"

/**
 * The 20 px eyebrow ring of the app bar: `none` without a progress value, `slot` (an empty 20 px
 * box that keeps the label where it is) at 0 where the ring would draw as an empty circle, `ring`
 * once there is progress to show.
 */
export type EyebrowRing = "none" | "slot" | "ring"
export const eyebrowRingState = (progress: number | undefined): EyebrowRing =>
  progress === undefined ? "none" : progress > 0 ? "ring" : "slot"

/**
 * `IconButton variant="filled"` disc: `surface` with a 1 px `border` outline, so it reads on a `bg`
 * page in light (`surface` is only 1.07:1 against it, `surfaceRaised` equals the page there);
 * pressed or hovered it takes `surfaceRaised`.
 */
export const filledDiscStyle = (colors: ColorRoles, raised: boolean): ViewStyle => ({
  backgroundColor: raised ? colors.surfaceRaised : colors.surface,
  borderWidth: stroke.hairline,
  borderColor: colors.border,
})
