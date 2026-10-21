import type { CatalogId } from "@tanren/shared"
import { Option } from "effect"
import { Image, View } from "react-native"
import { SvgXml } from "react-native-svg"
import { IMAGES } from "../illustrations/images"
import { illustration, radius, useTheme } from "../ui"
import { illustrationImage, placeholderSvg } from "./illustration"

export interface ExerciseIllustrationProps {
  readonly catalogId: CatalogId
  readonly size: number
}

/** The entry's gpt-image-1 illustration (`pnpm images:map`), or a neutral placeholder without one. */
export function ExerciseIllustration({ catalogId, size }: ExerciseIllustrationProps) {
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
        borderRadius: radius.md,
        borderCurve: "continuous",
        backgroundColor: colors.surface,
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
