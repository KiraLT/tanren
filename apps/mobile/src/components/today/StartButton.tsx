import { Option } from "effect"
import { useFocusEffect } from "expo-router"
import { useCallback, useContext, useEffect, useRef, useState } from "react"
import { useStartWorkout } from "../../hooks/useStartWorkout"
import { AppBarNoticeContext, Button } from "../../ui"
import { START_FAILED_TITLE } from "./freeWorkoutCopy"

/**
 * The AppBar's Start pill (navigation-v2.md §2 Merge, §3): Train's trailing slot and the desktop
 * AppBar. `sm` = 36-px pill in a 44-px touch area, the same height as the slot's spacer, so the
 * bar keeps its height. Disabled while Today loads. A failed free-workout start keeps the pill,
 * relabelled "Try again", and reports the failure to the bar, which shows it as a danger caption
 * under its row (NAV-3d); Home's Up-next card shows the full Banner. Leaving the screen, a new
 * Start target or unmounting clears both, so a failure never outlives the attempt it reports.
 */
export function StartButton() {
  const { label, disabled, start, target } = useStartWorkout()
  const report = useContext(AppBarNoticeContext)
  const [failed, setFailed] = useState(false)
  // False once the screen blurs or the pill unmounts: a late `start()` result is then dropped,
  // so it cannot caption a bar the pill has left.
  const live = useRef(true)
  const clear = useCallback(() => {
    setFailed(false)
    report(Option.none())
  }, [report])
  // Tabs stay mounted: blur (Train → Home) and unmount both dismiss the failure.
  useFocusEffect(
    useCallback(() => {
      // biome-ignore lint/plugin/noMutation: React ref write, not a data mutation
      live.current = true
      return () => {
        // biome-ignore lint/plugin/noMutation: React ref write, not a data mutation
        live.current = false
        clear()
      }
    }, [clear]),
  )
  useEffect(
    () => () => {
      // biome-ignore lint/plugin/noMutation: React ref write, not a data mutation
      live.current = false
      clear()
    },
    [clear],
  )
  // A workout started elsewhere changes the target ("Start" → "Continue"): the failure is stale.
  useEffect(clear, [target._tag, clear])
  return (
    <Button
      label={failed ? "Try again" : label}
      size="sm"
      variant="primary"
      disabled={disabled}
      {...(failed ? { accessibilityLabel: `${START_FAILED_TITLE}. Try again` } : {})}
      onPress={() => {
        clear()
        start().then((ok) => {
          if (!live.current) {
            return
          }
          setFailed(!ok)
          report(ok ? Option.none() : Option.some(START_FAILED_TITLE))
        })
      }}
    />
  )
}
