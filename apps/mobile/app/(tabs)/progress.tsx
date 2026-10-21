import type { ExerciseId } from "@tanren/shared"
import { Array as Arr, Match, Option } from "effect"
import { useRouter } from "expo-router"
import { type ReactNode, useState } from "react"
import { ScrollView, View } from "react-native"
import { ExerciseDetail } from "../../src/components/progress/ExerciseDetail"
import { ExerciseRow, SessionRow } from "../../src/components/progress/ProgressRows"
import {
  type ExerciseSummary,
  type HistoryState,
  type SessionSummary,
  useExerciseSummaries,
  useSessionSummaries,
} from "../../src/hooks/useHistory"
import {
  AppBar,
  Button,
  EmptyState,
  gutter,
  IconButton,
  ListGroup,
  Page,
  SegmentedControl,
  Skeleton,
  space,
  useBreakpoint,
} from "../../src/ui"

const TABS = [
  { value: "exercises", label: "Exercises" },
  { value: "sessions", label: "Sessions" },
] as const

/** Sessions are read in pages of this size. */
const SESSION_PAGE = 30

function ListSkeleton() {
  return (
    <View accessible accessibilityLabel="Loading progress" style={{ gap: space.sm }}>
      {Arr.map([0, 1, 2, 3, 4], (row) => (
        <Skeleton key={row} width="100%" height={56} />
      ))}
    </View>
  )
}

interface ListStateProps<A> {
  readonly state: HistoryState<ReadonlyArray<A>>
  readonly render: (items: ReadonlyArray<A>) => ReactNode
  readonly onLogFirstSet: () => void
}

/** Loading / failed / empty / list, shared by both tabs. */
function ListState<A>({ state, render, onLogFirstSet }: ListStateProps<A>) {
  return Match.value(state).pipe(
    Match.tagsExhaustive({
      Loading: () => <ListSkeleton />,
      Failed: ({ message }) => (
        <EmptyState icon="warning" title="Could not load progress" body={message} />
      ),
      Ready: ({ value }) =>
        value.length === 0 ? (
          <EmptyState
            title="Log your first set on Today"
            body="Your best sets, volume and records show up here."
            action={{ label: "Go to Today", onPress: onLogFirstSet }}
          />
        ) : (
          render(value)
        ),
    }),
  )
}

/** The selection the aside shows: the user's pick if it still exists, else the newest exercise. */
const effectiveSelection = (
  exercises: ReadonlyArray<ExerciseSummary>,
  picked: Option.Option<ExerciseId>,
): Option.Option<ExerciseId> =>
  Option.orElse(
    Option.filter(picked, (id) => Arr.some(exercises, (summary) => summary.exercise.id === id)),
    () => Option.map(Arr.head(exercises), (summary) => summary.exercise.id),
  )

export default function ProgressScreen() {
  const router = useRouter()
  const desktop = useBreakpoint() === "desktop"
  const [tab, setTab] = useState<"exercises" | "sessions">("exercises")
  const [picked, setPicked] = useState<Option.Option<ExerciseId>>(Option.none())
  const [limit, setLimit] = useState(SESSION_PAGE)
  const exercises = useExerciseSummaries().state
  const sessions = useSessionSummaries(limit).state

  const goToToday = () => router.navigate("/today")
  const selected = effectiveSelection(exercises._tag === "Ready" ? exercises.value : [], picked)
  const openExercise = (id: ExerciseId) =>
    desktop
      ? setPicked(Option.some(id))
      : router.navigate({ pathname: "/progress/[exerciseId]", params: { exerciseId: id } })

  const aside = Option.match(selected, {
    onNone: () => <EmptyState title="Nothing to chart yet" body="Log a set to see its history." />,
    onSome: (id) => (
      <ScrollView contentContainerStyle={{ padding: gutter.desktop, paddingTop: space.lg }}>
        <ExerciseDetail key={id} exerciseId={id} />
      </ScrollView>
    ),
  })

  const exerciseList = (items: ReadonlyArray<ExerciseSummary>) => (
    <ListGroup>
      {Arr.map(items, (summary) => (
        <ExerciseRow
          key={summary.exercise.id}
          summary={summary}
          selected={desktop && Option.exists(selected, (id) => id === summary.exercise.id)}
          onPress={() => openExercise(summary.exercise.id)}
        />
      ))}
    </ListGroup>
  )

  const sessionList = (items: ReadonlyArray<SessionSummary>) => (
    <View style={{ gap: space.lg }}>
      <ListGroup>
        {Arr.map(items, (summary) => (
          <SessionRow key={summary.session.id} summary={summary} />
        ))}
      </ListGroup>
      {items.length >= limit ? (
        <Button
          label="Show more"
          variant="secondary"
          onPress={() => setLimit((current) => current + SESSION_PAGE)}
        />
      ) : null}
    </View>
  )

  return (
    <Page
      scroll
      header={
        <AppBar
          title="Progress"
          trailing={
            <IconButton
              icon="settings"
              accessibilityLabel="Settings"
              onPress={() => router.navigate("/settings")}
            />
          }
        />
      }
      aside={aside}
    >
      <SegmentedControl
        options={TABS}
        value={tab}
        onChange={(value) => setTab(value === "sessions" ? "sessions" : "exercises")}
        accessibilityLabel="Progress view"
      />
      {tab === "exercises" ? (
        <ListState state={exercises} render={exerciseList} onLogFirstSet={goToToday} />
      ) : (
        <ListState state={sessions} render={sessionList} onLogFirstSet={goToToday} />
      )}
    </Page>
  )
}
