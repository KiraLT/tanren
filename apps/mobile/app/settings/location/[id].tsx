import { Match } from "effect"
import { useLocalSearchParams, useRouter } from "expo-router"
import { LocationEditor } from "../../../src/components/settings/LocationEditor"
import { lookupLocation } from "../../../src/components/settings/locationsState"
import { useProfileState } from "../../../src/hooks/useProfile"
import { AppBar, EmptyState, IconButton, Page } from "../../../src/ui"

/** Root-Stack route: edit one location of the profile (Settings > Equipment & locations). */
export default function LocationScreen() {
  const router = useRouter()
  // A repeated `?id=` arrives as an array; `lookupLocation` treats it as not found.
  const { id } = useLocalSearchParams<{ id: string | string[] }>()
  const lookup = lookupLocation(useProfileState(), id)
  // A direct load has no history to go back to.
  const back = () => (router.canGoBack() ? router.back() : router.replace("/settings"))
  return (
    <Page
      scroll
      wide
      header={
        <AppBar
          title={lookup._tag === "Found" ? lookup.location.name : "Location"}
          leading={<IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={back} />}
        />
      }
    >
      {Match.valueTags(lookup, {
        Loading: () => null,
        NotFound: () => <EmptyState title="Location not found" body="It may have been deleted." />,
        Found: ({ location, active }) => (
          <LocationEditor location={location} active={active} onDeleted={back} />
        ),
      })}
    </Page>
  )
}
