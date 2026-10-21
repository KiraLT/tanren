import Constants from "expo-constants"
import { Linking } from "react-native"
import { ListRow } from "../../ui"
import { Chevron, SettingsSection } from "./SettingsSection"
import { aboutTitle, UNITS_NOTE } from "./settingsCopy"

const SITE = "https://tanren.me"

/** Settings > Units (kg only) and About (version, link to tanren.me). */
export function AboutSection() {
  return (
    <>
      <SettingsSection title="Units">
        <ListRow icon="dumbbell" title="Weight" subtitle={UNITS_NOTE} />
      </SettingsSection>
      <SettingsSection title="About">
        <ListRow
          icon="info"
          title={aboutTitle(Constants.expoConfig?.version)}
          subtitle="tanren.me"
          accessibilityLabel={`${aboutTitle(Constants.expoConfig?.version)}, open tanren.me`}
          trailing={<Chevron />}
          onPress={() => {
            void Linking.openURL(SITE)
          }}
        />
      </SettingsSection>
    </>
  )
}
