import { Option } from "effect"
import type { ImageSourcePropType } from "react-native"

/** The five landing illustrations (design `landing.md` §5): one hero, one per feature card. */
export type LandingImageId = "hero" | "log" | "program" | "feed" | "plan"

/**
 * Image source per slot: ILL-1's transparent webps (hero 1024², cards 512²), bundled by Metro.
 * `None` would render the §4 placeholder tile (`LandingImageSlot`).
 */
export const LANDING_IMAGES: {
  readonly [K in LandingImageId]: Option.Option<ImageSourcePropType>
} = {
  hero: Option.some(require("../../../assets/landing/hero.webp")),
  log: Option.some(require("../../../assets/landing/log.webp")),
  program: Option.some(require("../../../assets/landing/program.webp")),
  feed: Option.some(require("../../../assets/landing/feed.webp")),
  plan: Option.some(require("../../../assets/landing/plan.webp")),
}
