import type { Activity } from "@tanren/shared"
import { Array as Arr, Match, Option } from "effect"
import { useRouter } from "expo-router"
import { useState } from "react"
import { View } from "react-native"
import type { StartWorkout } from "../../hooks/useStartWorkout"
import { type TodayState, useFreeWorkoutActions } from "../../hooks/useToday"
import { dayMinutes } from "../../player/programDays"
import type { ActiveProgram } from "../../services/ProgramRepo"
import { Banner, Button, Card, Skeleton, space, Text } from "../../ui"
import { formatVolume } from "../volumeFormat"
import {
  CANCEL_FAILED_TITLE,
  CANCEL_WORKOUT_LABEL,
  FREE_WORKOUT_TITLE,
  START_FAILED_TITLE,
  START_WORKOUT_LABEL,
  WORKOUT_STARTED_BODY,
  WORKOUT_STARTED_TITLE,
} from "./freeWorkoutCopy"
import { todayEmptyCopy } from "./todayEmptyCopy"
import { doneLine, exerciseNames, sessionMeta } from "./upNext"

export interface UpNextCardProps {
  readonly state: TodayState
  readonly due: ReadonlyArray<ActiveProgram>
  readonly action: StartWorkout
  /** Today's finished workouts (`useDoneToday`): the "Done today" row while `action` is `Done`. */
  readonly done: ReadonlyArray<Activity>
}

interface CardBodyProps {
  readonly eyebrow: string
  readonly title: string
  readonly lines: ReadonlyArray<string>
  readonly primary: { readonly label: string; readonly onPress: () => void }
  readonly secondary?: { readonly label: string; readonly onPress: () => void }
}

/**
 * Up-next layout (navigation-v2.md §7): eyebrow, title2 title, ≤ 2 one-line meta lines, then the
 * full-width 48-px primary pill (and an optional secondary under it).
 */
function UpNextBody({ eyebrow, title, lines, primary, secondary }: CardBodyProps) {
  return (
    <Card>
      <View style={{ gap: space.sm }}>
        <View style={{ gap: space.xs }}>
          <Text variant="caption" tone="muted">
            {eyebrow}
          </Text>
          <Text variant="title2" headingLevel={2} numberOfLines={2}>
            {title}
          </Text>
          {Arr.map(lines, (line) => (
            <Text key={line} variant="subhead" tone="muted" numberOfLines={1}>
              {line}
            </Text>
          ))}
        </View>
        <Button label={primary.label} size="md" variant="primary" onPress={primary.onPress} />
        {secondary === undefined ? null : (
          <Button label={secondary.label} size="md" variant="raised" onPress={secondary.onPress} />
        )}
      </View>
    </Card>
  )
}

/** "Day 12 of 30 · ≈ 15 min" under the program's name. */
const programLine = ({ program, day }: ActiveProgram): string =>
  Option.match(day, {
    onNone: () => `${program.days.length} days`,
    onSome: (next) => `Day ${next.dayNumber} of ${program.days.length} · ≈ ${dayMinutes(next)} min`,
  })

/**
 * Home's first card (navigation-v2.md §6): what to do now with the one Start pill. Planned
 * session (up next / in progress) · open free workout · due program day · the free-workout start
 * card · a skeleton while loading · a danger Banner when Today failed to load.
 */
export function UpNextCard({ state, due, action, done }: UpNextCardProps) {
  const router = useRouter()
  const { cancel } = useFreeWorkoutActions()
  const [failed, setFailed] = useState<"none" | "start" | "cancel">("none")
  const onStart = () => {
    setFailed("none")
    action.start().then((ok) => setFailed(ok ? "none" : "start"))
  }
  const onCancel = () => {
    setFailed("none")
    cancel().then((ok) => setFailed(ok ? "none" : "cancel"))
  }
  const banner =
    failed === "none" ? null : (
      <Banner
        tone="danger"
        title={failed === "start" ? START_FAILED_TITLE : CANCEL_FAILED_TITLE}
        onDismiss={() => setFailed("none")}
      />
    )
  const planCard = Match.value(state).pipe(
    Match.tagsExhaustive({
      Loading: () => (
        <Card accessibilityLabel="Loading up next">
          <View style={{ gap: space.sm }}>
            <Skeleton width="30%" height={16} />
            <Skeleton width="70%" height={28} />
            <Skeleton width="50%" height={20} />
            <Skeleton width="100%" height={48} />
          </View>
        </Card>
      ),
      Failed: ({ message }) => <Banner tone="danger" title="Could not load today" body={message} />,
      Ready: ({ plannedSession, exercises, session }) => (
        <UpNextBody
          eyebrow={Option.isSome(session) ? "In progress" : "Up next"}
          title={plannedSession.name}
          lines={[sessionMeta(exercises), exerciseNames(exercises)]}
          primary={{ label: action.label, onPress: onStart }}
        />
      ),
      Free: ({ exercises }) =>
        Arr.isReadonlyArrayNonEmpty(exercises) ? (
          <UpNextBody
            eyebrow="In progress"
            title={FREE_WORKOUT_TITLE}
            lines={[sessionMeta(exercises), exerciseNames(exercises)]}
            primary={{ label: action.label, onPress: onStart }}
          />
        ) : (
          <UpNextBody
            eyebrow="In progress"
            title={WORKOUT_STARTED_TITLE}
            lines={[WORKOUT_STARTED_BODY]}
            primary={{ label: action.label, onPress: onStart }}
            secondary={{ label: CANCEL_WORKOUT_LABEL, onPress: onCancel }}
          />
        ),
      Empty: () =>
        Option.match(Arr.head(due), {
          onSome: (entry) => (
            <UpNextBody
              eyebrow="Up next · Program"
              title={entry.program.name}
              lines={[programLine(entry)]}
              primary={{ label: action.label, onPress: onStart }}
            />
          ),
          onNone: () => {
            const copy = todayEmptyCopy(0)
            return (
              <UpNextBody
                eyebrow="Up next"
                title={copy.title}
                lines={[copy.body]}
                primary={{ label: START_WORKOUT_LABEL, onPress: onStart }}
                secondary={{
                  label: "Pick a program",
                  onPress: () => router.navigate("/train?view=programs"),
                }}
              />
            )
          },
        }),
    }),
  )
  // §6 "Done today": the day's summary leads, Start drops to the secondary "Start another".
  const card = Option.match(Arr.head(done), {
    onNone: () => planCard,
    onSome: (latest) =>
      action.target._tag === "Done" ? (
        <UpNextBody
          eyebrow="Done today"
          title={done.length > 1 ? `${latest.title} and ${done.length - 1} more` : latest.title}
          lines={[doneLine(done, formatVolume)]}
          primary={{ label: "See activity", onPress: () => router.navigate("/activity") }}
          secondary={{ label: action.label, onPress: onStart }}
        />
      ) : (
        planCard
      ),
  })
  return (
    <View style={{ gap: space.md }}>
      {banner}
      {card}
    </View>
  )
}
