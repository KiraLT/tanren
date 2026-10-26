import { Option } from "effect"
import { useRouter } from "expo-router"
import { useIntegrationsOverview } from "../../hooks/useIntegrations"
import { ListRow } from "../../ui"
import { settingsSubtitle } from "./integrationsCopy"
import { SettingsSection } from "./SettingsSection"

/** Settings > Integrations: one row to the Integrations page, with Strava's state when known. */
export function IntegrationsSection() {
  const router = useRouter()
  const { state } = useIntegrationsOverview()
  const subtitle = settingsSubtitle(
    state._tag === "Ready" ? Option.some(state.value) : Option.none(),
  )
  return (
    <SettingsSection title="Integrations">
      <ListRow
        icon="swap"
        title="Integrations"
        subtitle={subtitle}
        chevron
        onPress={() => router.navigate("/settings/integrations")}
        accessibilityLabel={`Integrations, ${subtitle}`}
      />
    </SettingsSection>
  )
}
