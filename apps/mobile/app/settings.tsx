import { useRouter } from "expo-router"
import { AboutSection } from "../src/components/settings/AboutSection"
import { AccountSection } from "../src/components/settings/AccountSection"
import { AppearanceSection } from "../src/components/settings/AppearanceSection"
import { DataSection } from "../src/components/settings/DataSection"
import { AppBar, IconButton, Page } from "../src/ui"

/** Root-Stack route reached from the Progress header: Account, Appearance, Units, Data, About. */
export default function SettingsScreen() {
  const router = useRouter()
  // A direct load has no history to go back to.
  const back = () => (router.canGoBack() ? router.back() : router.replace("/today"))
  return (
    <Page
      scroll
      header={
        <AppBar
          title="Settings"
          leading={<IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={back} />}
        />
      }
    >
      <AccountSection />
      <AppearanceSection />
      <DataSection />
      <AboutSection />
    </Page>
  )
}
