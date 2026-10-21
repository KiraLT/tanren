import type { PlayerProgress } from "./playerMachine"

/** App-bar eyebrow caption: "Round 2/3 · Exercise 5/7". */
export const eyebrowLabel = (p: PlayerProgress): string =>
  `Round ${p.round}/${p.rounds} · Exercise ${p.item}/${p.items}`

/** Day progress for the 20 px eyebrow ring: finished exercises over all of them, clamped to 0..1. */
export const dayFraction = (p: PlayerProgress): number => {
  const total = p.rounds * p.items
  if (total <= 0) {
    return 0
  }
  const done = (p.round - 1) * p.items + (p.item - 1)
  return Math.min(1, Math.max(0, done / total))
}
