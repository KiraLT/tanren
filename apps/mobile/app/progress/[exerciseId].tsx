import { ExerciseId } from "@tanren/shared"
import { Option, Schema } from "effect"
import { useLocalSearchParams, useRouter } from "expo-router"
import { ExerciseDetailView, isDetailReady } from "../../src/components/progress/ExerciseDetail"
import { useExerciseHistory } from "../../src/hooks/useHistory"
import { AppBar, EmptyState, IconButton, Page } from "../../src/ui"

/** The route's page for a valid id: wide (two columns) only once the exercise is loaded. */
function ExerciseProgressPage({
  exerciseId,
  back,
}: {
  readonly exerciseId: ExerciseId
  readonly back: () => void
}) {
  const { state } = useExerciseHistory(exerciseId)
  // The exercise's name once loaded; "Progress" while loading, failed or unknown.
  const title =
    state._tag === "Ready"
      ? Option.match(state.value, { onNone: () => "Progress", onSome: (h) => h.exercise.name })
      : "Progress"
  return (
    <Page
      scroll
      wide={isDetailReady(state)}
      header={
        <AppBar
          title={title}
          leading={<IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={back} />}
        />
      }
    >
      <ExerciseDetailView state={state} layout="split" />
    </Page>
  )
}

export default function ExerciseProgressScreen() {
  const router = useRouter()
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>()
  // A direct load has no history to go back to: fall back to the list.
  const back = () => (router.canGoBack() ? router.back() : router.replace("/progress"))
  const id = Schema.decodeUnknownOption(ExerciseId)(exerciseId)
  return Option.match(id, {
    onNone: () => (
      <Page
        scroll
        header={
          <AppBar
            title="Progress"
            leading={<IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={back} />}
          />
        }
      >
        <EmptyState title="Exercise not found" body="This link does not point to an exercise." />
      </Page>
    ),
    onSome: (validId) => <ExerciseProgressPage exerciseId={validId} back={back} />,
  })
}
