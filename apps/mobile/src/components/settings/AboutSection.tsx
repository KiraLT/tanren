import Constants from "expo-constants"
import { useRouter } from "expo-router"
import { Linking } from "react-native"
import { ListRow } from "../../ui"
import { ABOUT_LEGAL_ROWS } from "../legal/legalCopy"
import { SettingsSection } from "./SettingsSection"
import { aboutTitle, UNITS_NOTE } from "./settingsCopy"

const SITE = "https://tanren.me"

/** Settings > Units (kg only) and About (version, link to tanren.me, Privacy and Terms). */
export function AboutSection() {
  const router = useRouter()
  const openLegal = (href: "/privacy" | "/terms") => () => {
    // biome-ignore lint/plugin/noMutation: expo-router navigation, not Array.push
    router.push(href)
  }
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
          chevron
          onPress={() => {
            void Linking.openURL(SITE)
          }}
        />
        <ListRow
          icon="user"
          title={ABOUT_LEGAL_ROWS.privacy}
          chevron
          onPress={openLegal("/privacy")}
        />
        <ListRow icon="book" title={ABOUT_LEGAL_ROWS.terms} chevron onPress={openLegal("/terms")} />
      </SettingsSection>
    </>
  )
}
