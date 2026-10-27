import { Array as Arr, DateTime, Effect, Exit, Option } from "effect"
import { useRouter } from "expo-router"
import { useEffect, useState } from "react"
import { Pressable, View } from "react-native"
import { dayMinutes } from "../player/programDays"
import { useStoreVersion } from "../player/usePrograms"
import { type ActiveProgram, ProgramRepo } from "../services/ProgramRepo"
import { runtime } from "../services/runtime"
import {
  Button,
  ListGroup,
  radius,
  rhythm,
  sizes,
  space,
  Text,
  usePressableInteraction,
  useTheme,
} from "../ui"

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

interface DueRowProps {
  readonly entry: ActiveProgram
  readonly onOpen: () => void
  readonly onStart: () => void
}

/**
 * A `ListRow`-shaped row with two sibling targets: the title column opens the day preview, the
 * "Start" pill opens the player. Not a `ListRow` with `onPress`: that wraps `trailing` in its own
 * Pressable, and web would render a button inside a button.
 */
function DueRow({ entry, onOpen, onStart }: DueRowProps) {
  const { colors } = useTheme()
  const { hovered, handlers, focusStyle } = usePressableInteraction()
  return (
    <View
      style={{
        minHeight: sizes.tap + 2 * space.sm,
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        paddingHorizontal: space.lg,
        paddingVertical: space.sm,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${entry.program.name}, ${dueSubtitle(entry)}, opens the day preview`}
        onPress={onOpen}
        {...handlers}
        style={({ pressed }) => [
          {
            flex: 1,
            minHeight: sizes.tap,
            justifyContent: "center",
            gap: 2,
            borderRadius: radius.sm,
            ...(hovered || pressed ? { backgroundColor: colors.surfaceRaised } : {}),
          },
          focusStyle,
        ]}
      >
        <Text variant="headline">{entry.program.name}</Text>
        <Text variant="subhead" tone="muted">
          {dueSubtitle(entry)}
        </Text>
      </Pressable>
      <Button
        size="sm"
        variant="primary"
        label="Start"
        accessibilityLabel={`Start ${entry.program.name}`}
        onPress={onStart}
      />
    </View>
  )
}

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
          <DueRow
            key={entry.enrollment.id}
            entry={entry}
            onOpen={() =>
              // biome-ignore lint/plugin/noMutation: Expo Router's navigation call, not an array push
              router.push({
                pathname: "/programs/[programId]/day/[n]",
                params: {
                  programId: entry.enrollment.programId,
                  n: String(entry.enrollment.currentDay),
                },
              })
            }
            onStart={() =>
              // biome-ignore lint/plugin/noMutation: Expo Router's navigation call, not an array push
              router.push({
                pathname: "/programs/play",
                params: { enrollmentId: entry.enrollment.id },
              })
            }
          />
        ))}
      </ListGroup>
    </View>
  )
}
