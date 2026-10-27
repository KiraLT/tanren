import type { PlayerProgress } from "./playerMachine"

/**
 * App-bar eyebrow caption: "Exercise 1/7 · Set 1/4" (programs-player-v2 §7.3); "Round 2/3 · "
 * leads only when the day has rounds, "· Set x/y" trails only when the item has sets.
 */
export const eyebrowLabel = (p: PlayerProgress): string =>
  [
    ...(p.rounds > 1 ? [`Round ${p.round}/${p.rounds}`] : []),
    `Exercise ${p.item}/${p.items}`,
    ...(p.sets > 1 ? [`Set ${p.set}/${p.sets}`] : []),
  ].join(" · ")

/**
 * The one app-bar segment-bar rule, on Today and in the player (UI-R 3): segments up to and
 * including the current exercise are lit, so exercise 1 of N shows 1 filled. `position` is 1-based.
 */
export const segmentsFilled = (position: number, total: number): number =>
  Math.max(0, Math.min(total, Math.floor(position)))

/** Day progress for the 20 px eyebrow ring: finished steps (sets) over all of them, clamped to 0..1. */
export const dayFraction = (p: PlayerProgress): number => {
  const total = p.rounds * p.steps
  if (total <= 0) {
    return 0
  }
  const done = (p.round - 1) * p.steps + (p.step - 1)
  return Math.min(1, Math.max(0, done / total))
}
