import type { TextStyle, ViewStyle } from "react-native"
import type { ColorRoles } from "./colors"
import { chipStyle } from "./controls"
import type { Scheme } from "./theme"
import { type } from "./tokens"

/**
 * `solid` (default): the filled "on" pill of a facet. `outline`: a toggle that sits beside a facet
 * ("At <location>" next to "All"), so its "on" state must not be a second filled pill.
 */
export type ChipVariant = "solid" | "outline"

/** The ramp's 700 step (`title2`): the "on" label weight of the outline chip, no raw literal. */
export const OUTLINE_SELECTED_WEIGHT: TextStyle["fontWeight"] = type.title2.fontWeight

/** Outline chip: transparent fill, 1 px `border`; on = `accent` outline. Same 32 px pill as solid. */
export const outlineChipStyle = (
  selected: boolean,
  scheme: Scheme,
  colors: ColorRoles,
): ViewStyle => ({
  ...chipStyle(false, scheme, colors),
  borderColor: selected ? colors.accent : colors.border,
})

/** Outline chip glyph: `accent` when on, `textMuted` off; the label stays `text`. */
export const outlineGlyphColor = (selected: boolean, colors: ColorRoles): string =>
  selected ? colors.accent : colors.textMuted

/** Outline chip label: the 700 weight when on, the ramp's own weight when off (`undefined`). */
export const outlineLabelStyle = (selected: boolean): TextStyle | undefined =>
  selected ? { fontWeight: OUTLINE_SELECTED_WEIGHT } : undefined
