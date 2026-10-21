import type { CatalogId, MuscleGroup } from "@tanren/shared"
import { Option } from "effect"
import { Image, View } from "react-native"
import { MuscleMap } from "../illustrations/muscleMap/MuscleMap"
import { MUSCLE_MAP_IMAGES } from "../illustrations/muscleMapImages"
import { radius, useTheme } from "../ui"
import { muscleMapImageFor } from "./illustration"

export interface MuscleMapImageProps {
  /** A bare id or an `Option` (exercises without a catalog entry pass `None`). */
  readonly catalogId: CatalogId | Option.Option<CatalogId>
  /** Edge length in px: the generated maps are square (front and back figure side by side). */
  readonly size: number
  /** Fallback highlights, used when the id has no generated map. */
  readonly primary: ReadonlyArray<MuscleGroup>
  readonly secondary: ReadonlyArray<MuscleGroup>
}

/**
 * The entry's generated muscle map (gpt-image-1, `assets/musclemaps`, transparent, both figures),
 * or for no id / an id without a file the SVG `MuscleMap` (front view) with the same muscles.
 * Dark gets a `surfaceRaised` backdrop like `ExerciseIllustration` so the slate figures read.
 */
export function MuscleMapImage({ catalogId, size, primary, secondary }: MuscleMapImageProps) {
  const { colors, scheme } = useTheme()
  const id = Option.isOption(catalogId) ? catalogId : Option.some(catalogId)
  const image = Option.flatMap(id, (value) => muscleMapImageFor(MUSCLE_MAP_IMAGES, value))
  const backdrop = scheme === "dark" && Option.isSome(image)
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Muscle map"
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        borderCurve: "continuous",
        borderRadius: backdrop ? radius.md : 0,
        backgroundColor: backdrop ? colors.surfaceRaised : "transparent",
      }}
    >
      {Option.match(image, {
        onSome: (source) => (
          <Image source={source} style={{ width: size, height: size }} resizeMode="contain" />
        ),
        onNone: () => (
          <MuscleMap primary={primary} secondary={secondary} size={size} view="front" />
        ),
      })}
    </View>
  )
}
