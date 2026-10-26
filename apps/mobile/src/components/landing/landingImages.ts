import { Option } from "effect"
import type { ImageSourcePropType } from "react-native"

/** The five landing illustrations (design `landing.md` §5): one hero, one per feature card. */
export type LandingImageId = "hero" | "log" | "program" | "feed" | "plan"

/**
 * Image source per slot. `None` renders the §4 placeholder tile; LAND-2 swaps each entry for
 * `Option.some(require("../../../assets/landing/<id>.webp"))` once ILL-1's files exist.
 */
export const LANDING_IMAGES: {
  readonly [K in LandingImageId]: Option.Option<ImageSourcePropType>
} = {
  hero: Option.none(),
  log: Option.none(),
  program: Option.none(),
  feed: Option.none(),
  plan: Option.none(),
}
