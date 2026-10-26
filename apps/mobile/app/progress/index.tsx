import type { ExerciseId } from "@tanren/shared"
import { Array as Arr, Match, Option } from "effect"
import { useRouter } from "expo-router"
import { type ReactNode, useState } from "react"
import { ScrollView, View } from "react-native"
import { ExerciseDetail } from "../../src/components/progress/ExerciseDetail"
import { ExerciseRow } from "../../src/components/progress/ProgressRows"
import {
  type ExerciseSummary,
  type HistoryState,
  useExerciseSummaries,
} from "../../src/hooks/useHistory"
import {
  AppBar,
  EmptyState,
  gutter,
  IconButton,
  ListGroup,
  Page,
  Skeleton,
  space,
  useBreakpoint,
} from "../../src/ui"

function ListSkeleton() {
  return (
    <View accessible accessibilityLabel="Loading progress" style={{ gap: space.sm }}>
      {Arr.map([0, 1, 2, 3, 4], (row) => (
        <Skeleton key={row} width="100%" height={56} />
      ))}
    </View>
  )
}

interface ListStateProps {
  readonly state: HistoryState<ReadonlyArray<ExerciseSummary>>
  readonly render: (items: ReadonlyArray<ExerciseSummary>) => ReactNode
  readonly onLogFirstSet: () => void
}

/** Loading / failed / empty / list. */
function ListState({ state, render, onLogFirstSet }: ListStateProps) {
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

/** Progress: the exercise list (and, at desktop, the selected exercise's detail). A stack route off the Feed. */
export default function ProgressScreen() {
  const router = useRouter()
  const desktop = useBreakpoint() === "desktop"
  const [picked, setPicked] = useState<Option.Option<ExerciseId>>(Option.none())
  const exercises = useExerciseSummaries().state

  const goToToday = () => router.navigate("/today")
  const back = () => (router.canGoBack() ? router.back() : router.replace("/feed"))
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

  return (
    <Page
      scroll
      header={
        <AppBar
          title="Progress"
          leading={<IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={back} />}
        />
      }
      aside={exercises._tag === "Ready" && exercises.value.length > 0 ? aside : undefined}
      split="5/7"
    >
      <ListState state={exercises} render={exerciseList} onLogFirstSet={goToToday} />
    </Page>
  )
}
