import type { CatalogId } from "@tanren/shared"
import { Option } from "effect"
import { Image, View } from "react-native"
import { IMAGES } from "../illustrations/images"
import { Icon, radius, useGrouped, useTheme } from "../ui"
import { illustrationImage } from "./illustration"

/** v2-catalog.md §7: the detail illustration was 240 px; callers pass `sizes.illustration*`. */
export const DEFAULT_ILLUSTRATION_SIZE = 240

/** The fallback glyph's share of the tile edge. */
const FALLBACK_GLYPH_RATIO = 0.4

export interface ExerciseIllustrationProps {
  /** A bare id or an `Option` (exercises without a catalog entry pass `None`). */
  readonly catalogId: CatalogId | Option.Option<CatalogId>
  /** Edge length in px (square); defaults to `DEFAULT_ILLUSTRATION_SIZE`. */
  readonly size?: number
  /**
   * `true` puts a `surface` tile behind an image. Default `false`: the transparent (IMG-4) figure
   * sits on the page, with a `surfaceRaised` backdrop in dark only so the slate figure reads.
   */
  readonly framed?: boolean
}

/**
 * The entry's gpt-image-1 illustration (`pnpm images:map`). The one fallback, for no catalog id or
 * an id without a file: a `surface` tile (`surfaceRaised` inside a `ListGroup`) with the `dumbbell` glyph in `textMuted`.
 */
export function ExerciseIllustration({
  catalogId,
  size = DEFAULT_ILLUSTRATION_SIZE,
  framed = false,
}: ExerciseIllustrationProps) {
  const { colors, scheme } = useTheme()
  const grouped = useGrouped()
  const id = Option.isOption(catalogId) ? catalogId : Option.some(catalogId)
  const image = Option.flatMap(id, (value) => illustrationImage(IMAGES, value))
  // Inside a `ListGroup` (also `surface`) the fallback tile is raised so it does not vanish.
  const tile = grouped ? colors.surfaceRaised : colors.surface
  const backdrop =
    framed || Option.isNone(image)
      ? Option.some(tile)
      : scheme === "dark"
        ? Option.some(colors.surfaceRaised)
        : Option.none()
  const tiled = Option.isSome(backdrop)
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={
        Option.isSome(image) ? "Exercise illustration" : "Illustration placeholder"
      }
      style={{
        width: size,
        height: size,
        borderRadius: tiled ? radius.md : 0,
        borderCurve: "continuous",
        backgroundColor: Option.getOrElse(backdrop, () => "transparent"),
        overflow: "hidden",
        alignSelf: "center",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {Option.match(image, {
        onSome: (source) => (
          <Image source={source} style={{ width: size, height: size }} resizeMode="cover" />
        ),
        onNone: () => (
          <Icon
            name="dumbbell"
            size={Math.round(size * FALLBACK_GLYPH_RATIO)}
            color={colors.textMuted}
          />
        ),
      })}
    </View>
  )
}
