/** Pure helpers for the rest timer: kept free of React so they are testable in plain Node. */

/** Whole seconds left until `endsAtMs`, rounded up so "0:01" shows until the very end. */
export const remainingSeconds = (endsAtMs: number, nowMs: number): number =>
  Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000))

/** "m:ss": 90 -> "1:30", 5 -> "0:05". Negative or fractional input is clamped and floored. */
export const formatClock = (totalSeconds: number): string => {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}
