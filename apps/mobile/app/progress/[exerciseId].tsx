import { ExerciseId } from "@tanren/shared"
import { Option, Schema } from "effect"
import { useLocalSearchParams, useRouter } from "expo-router"
import { ExerciseDetail } from "../../src/components/progress/ExerciseDetail"
import { AppBar, EmptyState, IconButton, Page } from "../../src/ui"

export default function ExerciseProgressScreen() {
  const router = useRouter()
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>()
  // A direct load has no history to go back to: fall back to the list.
  const back = () => (router.canGoBack() ? router.back() : router.replace("/progress"))
  const id = Schema.decodeUnknownOption(ExerciseId)(exerciseId)
  return (
    <Page
      scroll
      wide
      header={
        <AppBar
          title="Progress"
          leading={<IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={back} />}
        />
      }
    >
      {Option.match(id, {
        onNone: () => (
          <EmptyState title="Exercise not found" body="This link does not point to an exercise." />
        ),
        onSome: (validId) => <ExerciseDetail exerciseId={validId} layout="split" />,
      })}
    </Page>
  )
}
