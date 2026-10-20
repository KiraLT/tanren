import { Option } from "effect"
import { useCallback, useEffect, useState } from "react"
import { remainingSeconds } from "./restClock"

const TICK_MS = 250

/**
 * Countdown for the rest between sets. Plain React (no Effect): the end time is absolute, so a
 * throttled background tab or a late tick never drifts. `remaining` is `None` while idle and
 * the timer stops itself at 0.
 */
export const useRestTimer = (): {
  readonly remaining: Option.Option<number>
  readonly start: (seconds: number) => void
  readonly stop: () => void
} => {
  const [endsAt, setEndsAt] = useState<Option.Option<number>>(Option.none())
  const [now, setNow] = useState(() => Date.now())

  useEffect(
    () =>
      Option.match(endsAt, {
        onNone: () => undefined,
        onSome: (end) => {
          const id = setInterval(() => {
            const tick = Date.now()
            setNow(tick)
            if (tick >= end) {
              setEndsAt(Option.none())
            }
          }, TICK_MS)
          return () => clearInterval(id)
        },
      }),
    [endsAt],
  )

  const start = useCallback((seconds: number) => {
    const tick = Date.now()
    setNow(tick)
    setEndsAt(Option.some(tick + seconds * 1000))
  }, [])
  const stop = useCallback(() => setEndsAt(Option.none()), [])

  return { remaining: Option.map(endsAt, (end) => remainingSeconds(end, now)), start, stop }
}
