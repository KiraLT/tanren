import { useLocalSearchParams, useRouter } from "expo-router"
import { View } from "react-native"
import { ExportRows } from "../../../src/components/integrations/ExportRows"
import { GarminCard } from "../../../src/components/integrations/GarminCard"
import { AboutIntegrations } from "../../../src/components/integrations/ProviderList"
import { LoadFailedBanner, StatusBanner } from "../../../src/components/integrations/StatusBanner"
import { StravaCard } from "../../../src/components/integrations/StravaCard"
import { BLOCKED_COPY } from "../../../src/components/settings/integrationsCopy"
import { useGarminDetail, useStravaDetail } from "../../../src/hooks/useIntegrations"
import { AppBar, Columns, EmptyState, IconButton, Page, Skeleton, space } from "../../../src/ui"

function StravaDetailScreen({ back }: { readonly back: () => void }) {
  const { state, action, connect, disconnect, retryExport, retry } = useStravaDetail()
  const header = (
    <AppBar
      title="Strava"
      leading={<IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={back} />}
    />
  )
  if (state._tag !== "Ready") {
    return (
      <Page scroll header={header}>
        {state._tag === "Loading" ? (
          <View style={{ gap: space.lg }}>
            <Skeleton width="100%" height={180} />
            <Skeleton width="100%" height={120} />
          </View>
        ) : (
          <LoadFailedBanner reason={state.reason} onRetry={retry} />
        )}
      </Page>
    )
  }
  const { strava, zone, rows, blocked } = state.value
  return (
    <Page scroll wide header={header}>
      <Columns
        split="5/7"
        main={
          <View style={{ gap: space.lg }}>
            {blocked ? <StatusBanner tone="danger" title={BLOCKED_COPY} /> : null}
            <StravaCard
              strava={strava}
              zone={zone}
              action={action}
              onConnect={connect}
              onDisconnect={disconnect}
            />
          </View>
        }
        side={<ExportRows rows={rows} action={action} onRetry={retryExport} />}
      />
    </Page>
  )
}

function GarminDetailScreen({ back }: { readonly back: () => void }) {
  const { state, action, connect, disconnect, retry } = useGarminDetail()
  const header = (
    <AppBar
      title="Garmin"
      leading={<IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={back} />}
    />
  )
  if (state._tag !== "Ready") {
    return (
      <Page scroll header={header}>
        {state._tag === "Loading" ? (
          <Skeleton width="100%" height={240} />
        ) : (
          <LoadFailedBanner reason={state.reason} onRetry={retry} />
        )}
      </Page>
    )
  }
  return (
    <Page scroll wide header={header}>
      <Columns
        split="5/7"
        main={
          <GarminCard
            garmin={state.value.garmin}
            zone={state.value.zone}
            action={action}
            onConnect={connect}
            onDisconnect={disconnect}
          />
        }
        side={<AboutIntegrations scope="garmin" />}
      />
    </Page>
  )
}

/** Root-Stack route: one provider's page (`strava`, `garmin`); anything else is not found. */
export default function ProviderScreen() {
  const router = useRouter()
  const { provider } = useLocalSearchParams<{ provider: string | string[] }>()
  // A direct load has no history to go back to.
  const back = () => (router.canGoBack() ? router.back() : router.replace("/settings/integrations"))
  if (provider === "strava") {
    return <StravaDetailScreen back={back} />
  }
  if (provider === "garmin") {
    return <GarminDetailScreen back={back} />
  }
  return (
    <Page
      scroll
      header={
        <AppBar
          title="Integration"
          leading={<IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={back} />}
        />
      }
    >
      <EmptyState
        title="Integration not found"
        body="Tanren connects to Strava and Garmin for now."
      />
    </Page>
  )
}
