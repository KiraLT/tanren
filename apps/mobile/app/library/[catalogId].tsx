import { CatalogId, findCatalogExercise } from "@tanren/shared"
import { Option, Schema } from "effect"
import { useLocalSearchParams, useRouter } from "expo-router"
import { CatalogDetail } from "../../src/library/CatalogDetail"
import { AppBar, EmptyState, IconButton, Page } from "../../src/ui"

/** Phone detail of one catalog entry (at desktop the Library tab shows it in its aside). */
export default function CatalogEntryScreen() {
  const router = useRouter()
  const { catalogId } = useLocalSearchParams<{ catalogId: string }>()
  // A direct load has no history to go back to: fall back to the list.
  const back = () => (router.canGoBack() ? router.back() : router.replace("/library"))
  const entry = Schema.decodeUnknownOption(CatalogId)(catalogId).pipe(
    Option.flatMap(findCatalogExercise),
  )
  return (
    <Page
      scroll
      header={
        <AppBar
          title="Library"
          leading={<IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={back} />}
        />
      }
    >
      {Option.match(entry, {
        onNone: () => (
          <EmptyState
            title="Exercise not found"
            body="This link does not point to a library exercise."
          />
        ),
        onSome: (found) => <CatalogDetail key={found.catalogId} entry={found} />,
      })}
    </Page>
  )
}
