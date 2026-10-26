import { Option } from "effect"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useEffect, useState } from "react"
import { View } from "react-native"
import { AboutIntegrations, ProviderList } from "../../../src/components/integrations/ProviderList"
import { LoadFailedBanner, StatusBanner } from "../../../src/components/integrations/StatusBanner"
import { type ReturnBanner, returnBanner } from "../../../src/components/settings/integrationsCopy"
import { useIntegrationsOverview } from "../../../src/hooks/useIntegrations"
import { AppBar, Columns, IconButton, Page, Skeleton, space } from "../../../src/ui"

/** Reads `?connected=` / `?error=` once, then clears them so the banner does not come back. */
const useReturnBanner = () => {
  const router = useRouter()
  const { connected, error } = useLocalSearchParams<{ connected?: string; error?: string }>()
  const [banner, setBanner] = useState<Option.Option<ReturnBanner>>(Option.none())
  useEffect(() => {
    const incoming = returnBanner({ connected, error })
    if (Option.isSome(incoming)) {
      setBanner(incoming)
      // `router.setParams` merges, so the keys are set to undefined to drop them.
      router.setParams({ connected: undefined, error: undefined })
    }
  }, [connected, error, router])
  return { banner, dismiss: () => setBanner(Option.none()) }
}

/** Root-Stack route: Settings > Integrations (Strava and the Apple Health placeholder). */
export default function IntegrationsScreen() {
  const router = useRouter()
  const { state, retry } = useIntegrationsOverview()
  const { banner, dismiss } = useReturnBanner()
  // A direct load (the provider's redirect) has no history to go back to.
  const back = () => (router.canGoBack() ? router.back() : router.replace("/settings"))
  const header = (
    <AppBar
      title="Integrations"
      leading={<IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={back} />}
    />
  )
  const bannerView = Option.match(banner, {
    onNone: () => null,
    onSome: ({ tone, title }) => <StatusBanner tone={tone} title={title} onDismiss={dismiss} />,
  })
  if (state._tag !== "Ready") {
    return (
      <Page scroll header={header}>
        <View style={{ gap: space.lg }}>
          {bannerView}
          {state._tag === "Loading" ? (
            <Skeleton width="100%" height={128} />
          ) : (
            <LoadFailedBanner reason={state.reason} onRetry={retry} />
          )}
        </View>
      </Page>
    )
  }
  return (
    <Page scroll wide header={header}>
      <Columns
        split="5/7"
        main={
          <View style={{ gap: space.lg }}>
            {bannerView}
            <ProviderList
              strava={state.value.strava}
              zone={state.value.zone}
              onOpen={() => router.navigate("/settings/integrations/strava")}
            />
          </View>
        }
        side={<AboutIntegrations />}
      />
    </Page>
  )
}
