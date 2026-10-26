import { Option } from "effect"
import { useFocusEffect } from "expo-router"
import { useCallback, useEffect, useState } from "react"
import { View } from "react-native"
import { useFinishSession } from "../../hooks/useFinishSession"
import type { OpenSession } from "../../services/TodayRepo"
import { Button, gutter, space, Text, useBreakpoint } from "../../ui"
import { canFinish, finishedLine } from "./finishWorkoutText"

interface FinishWorkoutProps {
  /** Today's unfinished session (`useToday` Ready). */
  readonly session: Option.Option<OpenSession>
}

/**
 * End of the Today session view (ADR-0018 decision 2026-10-26): a full-width secondary "Finish
 * workout" button while the open session has a logged set. After the tap Today is back to its
 * pre-first-set view and this slot shows "Workout saved · n sets · duration" until the next set
 * opens a new session or the screen loses focus. Works offline (local store; push follows).
 */
export function FinishWorkout({ session }: FinishWorkoutProps) {
  const breakpoint = useBreakpoint()
  const { finish, pending, error } = useFinishSession()
  const [saved, setSaved] = useState<Option.Option<string>>(Option.none())
  const openId = Option.map(session, (open) => open.session.id)
  const openKey = Option.getOrNull(openId)

  // A new open session (the next set after a finish) dismisses the confirmation.
  useEffect(() => {
    if (openKey !== null) {
      setSaved(Option.none())
    }
  }, [openKey])
  // Leaving Today dismisses it too.
  useFocusEffect(useCallback(() => () => setSaved(Option.none()), []))

  const onPress = () =>
    Option.match(openId, {
      onNone: () => undefined,
      onSome: (id) => {
        finish(id).then((result) => setSaved(Option.map(result, finishedLine)))
      },
    })

  if (!canFinish(session) && Option.isNone(saved) && Option.isNone(error)) {
    return null
  }
  return (
    <View
      style={{
        marginHorizontal: gutter[breakpoint],
        marginBottom: space.md,
        gap: space.sm,
      }}
    >
      {canFinish(session) ? (
        <Button
          label="Finish workout"
          accessibilityLabel="Finish workout"
          variant="secondary"
          size="lg"
          icon="check"
          loading={pending}
          onPress={onPress}
          style={{ alignSelf: "stretch" }}
        />
      ) : null}
      {Option.match(saved, {
        onNone: () => null,
        onSome: (line) => (
          <Text
            variant="subhead"
            tone="success"
            accessibilityRole="text"
            accessibilityLiveRegion="polite"
          >
            {line}
          </Text>
        ),
      })}
      {Option.match(error, {
        onNone: () => null,
        onSome: (text) => (
          <Text variant="caption" tone="danger">
            {`Could not finish the workout: ${text}`}
          </Text>
        ),
      })}
    </View>
  )
}
