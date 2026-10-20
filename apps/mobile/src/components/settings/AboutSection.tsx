import Constants from "expo-constants"
import { Linking } from "react-native"
import { ListRow } from "../../ui"
import { SettingsSection } from "./SettingsSection"
import { aboutTitle, UNITS_NOTE } from "./settingsCopy"

const SITE = "https://tanren.me"

/** Settings > Units (kg only) and About (version, link to tanren.me). */
export function AboutSection() {
  return (
    <>
      <SettingsSection title="Units">
        <ListRow title="Weight" subtitle={UNITS_NOTE} />
      </SettingsSection>
      <SettingsSection title="About">
        <ListRow
          title={aboutTitle(Constants.expoConfig?.version)}
          subtitle="tanren.me"
          accessibilityLabel={`${aboutTitle(Constants.expoConfig?.version)}, open tanren.me`}
          onPress={() => {
            void Linking.openURL(SITE)
          }}
        />
      </SettingsSection>
    </>
  )
}
