import { CatalogId, findCatalogExercise } from "@tanren/shared"
import { Option, Schema } from "effect"
import { useLocalSearchParams, useRouter } from "expo-router"
import { ScrollView } from "react-native"
import { CatalogDetail, CatalogHero } from "../../src/library/CatalogDetail"
import { AppBar, EmptyState, IconButton, Page, space, useBreakpoint } from "../../src/ui"

/** Detail of one catalog entry; at desktop the hero and meta move to the aside. */
export default function CatalogEntryScreen() {
  const router = useRouter()
  const wide = useBreakpoint() === "desktop"
  const { catalogId } = useLocalSearchParams<{ catalogId: string }>()
  // A direct load has no history to go back to: fall back to the list.
  const back = () => (router.canGoBack() ? router.back() : router.replace("/train?view=library"))
  const entry = Schema.decodeUnknownOption(CatalogId)(catalogId).pipe(
    Option.flatMap(findCatalogExercise),
  )
  const aside = Option.match(entry, {
    onNone: () => undefined,
    onSome: (found) =>
      wide ? (
        <ScrollView contentContainerStyle={{ paddingVertical: space.lg }}>
          <CatalogHero entry={found} />
        </ScrollView>
      ) : undefined,
  })
  return (
    <Page
      {...(aside === undefined ? {} : { aside })}
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
        onSome: (found) => <CatalogDetail key={found.catalogId} entry={found} hero={!wide} />,
      })}
    </Page>
  )
}
