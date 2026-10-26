import { gutter, sizes } from "../ui/tokens"

type Breakpoint = "phone" | "tablet" | "desktop"

/** Which clock numeral the ring shows (`Text` variant). */
export type RingClock = "clock" | "numeral" | "numeralLg"

export interface RingSpec {
  /** Ring diameter; `undefined` keeps `TimerRing`'s default (220). */
  readonly size: number | undefined
  readonly clock: RingClock
}

/**
 * Width the player body has: the 600 column minus both gutters (desktop 600 - 64 = 536). The
 * header spans the page, the body is capped at `contentMaxWidth`.
 */
export const playerInnerWidth = (breakpoint: Breakpoint, windowWidth: number): number =>
  Math.min(windowWidth, sizes.contentMaxWidth) - 2 * gutter[breakpoint]

/**
 * Ring and clock per breakpoint (ui-polish Player 4/5): phone keeps the 64 `clock`, tablet the 220
 * ring with `numeral`, desktop grows to `ringXl` 280 with `numeralLg` only when the body holds it.
 */
export const ringSpec = (breakpoint: Breakpoint, windowWidth: number): RingSpec =>
  breakpoint === "phone"
    ? { size: undefined, clock: "clock" }
    : breakpoint === "desktop" && playerInnerWidth(breakpoint, windowWidth) >= sizes.ringXl
      ? { size: sizes.ringXl, clock: "numeralLg" }
      : { size: undefined, clock: "numeral" }
