import { useState } from "react"
import { useStartWorkout } from "../../hooks/useStartWorkout"
import { Button } from "../../ui"
import { START_FAILED_TITLE } from "./freeWorkoutCopy"

/**
 * The AppBar's Start pill (navigation-v2.md §2 Merge, §3): Train's trailing slot and the desktop
 * AppBar. `sm` = 36-px pill in a 44-px touch area, the same height as the slot's spacer, so the
 * bar keeps its height. Disabled while Today loads. A failed free-workout start keeps the pill,
 * relabelled "Try again" with the failure in its accessible name (no Banner fits the 44-px slot;
 * Home's Up-next card shows the full Banner).
 */
export function StartButton() {
  const { label, disabled, start } = useStartWorkout()
  const [failed, setFailed] = useState(false)
  return (
    <Button
      label={failed ? "Try again" : label}
      size="sm"
      variant="primary"
      disabled={disabled}
      {...(failed ? { accessibilityLabel: `${START_FAILED_TITLE}. Try again` } : {})}
      onPress={() => {
        setFailed(false)
        start().then((ok) => setFailed(!ok))
      }}
    />
  )
}
