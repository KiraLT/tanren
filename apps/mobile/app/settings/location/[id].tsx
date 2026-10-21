import { Option } from "effect"
import { useLocalSearchParams, useRouter } from "expo-router"
import { LocationEditor } from "../../../src/components/settings/LocationEditor"
import { useProfile } from "../../../src/hooks/useProfile"
import { AppBar, EmptyState, IconButton, Page } from "../../../src/ui"

/** Root-Stack route: edit one location of the profile (Settings > Equipment & locations). */
export default function LocationScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const profile = useProfile()
  // A direct load has no history to go back to.
  const back = () => (router.canGoBack() ? router.back() : router.replace("/settings"))
  const location = Option.flatMap(profile, (found) =>
    Option.fromNullishOr(found.locations.find((candidate) => candidate.id === id)),
  )
  const active = Option.exists(profile, (found) => Option.contains(found.activeLocationId, id))
  return (
    <Page
      scroll
      header={
        <AppBar
          title={Option.match(location, { onNone: () => "Location", onSome: (l) => l.name })}
          leading={<IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={back} />}
        />
      }
    >
      {Option.match(location, {
        onNone: () => <EmptyState title="Location not found" body="It may have been deleted." />,
        onSome: (found) => <LocationEditor location={found} active={active} onDeleted={back} />,
      })}
    </Page>
  )
}
