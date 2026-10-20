import type { IllustrationId } from "@tanren/shared"
import { Option } from "effect"
import { View } from "react-native"
import { SvgXml } from "react-native-svg"
import { illustration, radius, useTheme } from "../ui"
import { illustrationXml, placeholderSvg } from "./illustration"
import { ILLUSTRATIONS } from "./illustrationMap"

export interface ExerciseIllustrationProps {
  readonly id: IllustrationId
  readonly size: number
}

/** The entry's drawing (v2-catalog.md §5), or a neutral placeholder while it is not drawn yet. */
export function ExerciseIllustration({ id, size }: ExerciseIllustrationProps) {
  const { colors } = useTheme()
  const drawn = illustrationXml(ILLUSTRATIONS, id)
  const xml = Option.getOrElse(drawn, () => placeholderSvg(illustration.figure))
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={
        Option.isSome(drawn) ? "Exercise illustration" : "Illustration placeholder"
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
      <SvgXml xml={xml} width={size} height={size} />
    </View>
  )
}
