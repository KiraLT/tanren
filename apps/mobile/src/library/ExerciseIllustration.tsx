import type { CatalogId } from "@tanren/shared"
import { Option } from "effect"
import { Image, View } from "react-native"
import { SvgXml } from "react-native-svg"
import { IMAGES } from "../illustrations/images"
import { illustration, radius, useTheme } from "../ui"
import { illustrationImage, placeholderSvg } from "./illustration"

/** v2-catalog.md §7: the detail illustration was 240 px; callers pass `sizes.illustration*`. */
export const DEFAULT_ILLUSTRATION_SIZE = 240

export interface ExerciseIllustrationProps {
  readonly catalogId: CatalogId
  /** Edge length in px (square); defaults to `DEFAULT_ILLUSTRATION_SIZE`. */
  readonly size?: number
  /** `false` drops the `surface` tile (the detail hero: transparent assets sit on `bg`). */
  readonly framed?: boolean
}

/** The entry's gpt-image-1 illustration (`pnpm images:map`), or a neutral placeholder without one. */
export function ExerciseIllustration({
  catalogId,
  size = DEFAULT_ILLUSTRATION_SIZE,
  framed = true,
}: ExerciseIllustrationProps) {
  const { colors } = useTheme()
  const image = illustrationImage(IMAGES, catalogId)
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={
        Option.isSome(image) ? "Exercise illustration" : "Illustration placeholder"
      }
      style={{
        width: size,
        height: size,
        borderRadius: framed ? radius.md : 0,
        borderCurve: "continuous",
        backgroundColor: framed ? colors.surface : "transparent",
        overflow: "hidden",
        alignSelf: "center",
      }}
    >
      {Option.match(image, {
        onSome: (source) => (
          <Image source={source} style={{ width: size, height: size }} resizeMode="cover" />
        ),
        onNone: () => (
          <SvgXml xml={placeholderSvg(illustration.figure)} width={size} height={size} />
        ),
      })}
    </View>
  )
}
