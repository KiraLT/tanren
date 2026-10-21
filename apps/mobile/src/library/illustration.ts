import { type Option, Record as Rec } from "effect"

/** The webp for a catalog id from `IMAGES` (src/illustrations/images.ts); none = fallback tile. */
export const illustrationImage = <Source>(
  map: Readonly<Record<string, Source>>,
  catalogId: string,
): Option.Option<Source> => Rec.get(map, catalogId)

/**
 * The generated muscle map for a catalog id from `MUSCLE_MAP_IMAGES`
 * (src/illustrations/muscleMapImages.ts); none = the SVG `MuscleMap` fallback. The map is a
 * parameter because that file holds Metro `require`s that Node cannot load.
 */
export const muscleMapImageFor = <Source>(
  map: Readonly<Record<string, Source>>,
  catalogId: string,
): Option.Option<Source> => illustrationImage(map, catalogId)
