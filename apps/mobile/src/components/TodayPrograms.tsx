import { Array as Arr, DateTime, Effect, Exit, Option } from "effect"
import { useRouter } from "expo-router"
import { useEffect, useState } from "react"
import { View } from "react-native"
import { dayMinutes } from "../player/programDays"
import { useStoreVersion } from "../player/usePrograms"
import { type ActiveProgram, ProgramRepo } from "../services/ProgramRepo"
import { runtime } from "../services/runtime"
import { Button, ListGroup, ListRow, rhythm, sizes, space, Text } from "../ui"

/** Active programs whose next day is not yet done today; empty while loading or on a read failure. */
export const useDueToday = (): ReadonlyArray<ActiveProgram> => {
  const [due, setDue] = useState<ReadonlyArray<ActiveProgram>>([])
  const storeVersion = useStoreVersion()
  useEffect(() => {
    const controller = new AbortController()
    runtime
      .runPromiseExit(
        DateTime.now.pipe(Effect.flatMap((now) => ProgramRepo.use((repo) => repo.dueToday(now)))),
        { signal: controller.signal },
      )
      .then((exit) => {
        if (!controller.signal.aborted) {
          setDue(Exit.match(exit, { onFailure: () => [], onSuccess: (entries) => entries }))
        }
      })
    return () => controller.abort()
  }, [storeVersion])
  return due
}

/** "Day 3 · ≈ 15 min" under the program title. */
const dueSubtitle = ({ day }: ActiveProgram): string =>
  Option.match(day, {
    onNone: () => "",
    onSome: (today) => `Day ${today.dayNumber} · ≈ ${dayMinutes(today)} min`,
  })

/**
 * Today's "Programs due": one row per active program with a day left to do, "Start" opens the
 * player. Renders nothing when no program is due.
 */
export function TodayPrograms() {
  const router = useRouter()
  const due = useDueToday()
  if (Arr.isReadonlyArrayEmpty(due)) {
    return null
  }
  return (
    <View style={{ gap: rhythm.labelToGroup }}>
      <Text variant="caption" tone="muted" headingLevel={2} style={{ paddingLeft: space.lg }}>
        Programs due
      </Text>
      <ListGroup>
        {Arr.map(due, (entry) => (
          <ListRow
            key={entry.enrollment.id}
            title={entry.program.name}
            subtitle={dueSubtitle(entry)}
            accessibilityLabel={`${entry.program.name}, ${dueSubtitle(entry)}`}
            trailing={
              <Button
                size="md"
                variant="text"
                // No `sm` size in `src/ui`: a 44-px pill (`sizes.tap`) keeps the row at 60.
                style={{ height: sizes.tap, minHeight: sizes.tap }}
                label="Start"
                accessibilityLabel={`Start ${entry.program.name}`}
                onPress={() =>
                  // biome-ignore lint/plugin/noMutation: Expo Router's navigation call, not an array push
                  router.push({
                    pathname: "/programs/play",
                    params: { enrollmentId: entry.enrollment.id },
                  })
                }
              />
            }
          />
        ))}
      </ListGroup>
    </View>
  )
}
