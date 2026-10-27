import type { Option } from "effect"
import { useRouter } from "expo-router"
import { View } from "react-native"
import type { OpenSession } from "../../services/TodayRepo"
import { Button, gutter, space, useBreakpoint } from "../../ui"
import { FinishWorkout } from "./FinishWorkout"
import { ADD_EXERCISE_LABEL } from "./freeWorkoutCopy"

interface FreeFooterProps {
  /** Today's unfinished unplanned session (`useToday` Free). */
  readonly session: Option.Option<OpenSession>
}

/**
 * Footer of a free workout (docs/design/free-workout.md §4): a secondary lg "Add exercise" (to the
 * Library) 8 above the existing `FinishWorkout`, which shows only once a set is logged.
 */
export function FreeFooter({ session }: FreeFooterProps) {
  const router = useRouter()
  const breakpoint = useBreakpoint()
  return (
    <View style={{ gap: space.sm }}>
      <Button
        label={ADD_EXERCISE_LABEL}
        accessibilityLabel={ADD_EXERCISE_LABEL}
        variant="secondary"
        size="lg"
        icon="plus"
        onPress={() => router.navigate("/library")}
        style={{ marginHorizontal: gutter[breakpoint], alignSelf: "stretch" }}
      />
      <FinishWorkout session={session} />
    </View>
  )
}
