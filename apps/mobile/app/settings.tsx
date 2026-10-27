import { useRouter } from "expo-router"
import { View } from "react-native"
import { AboutSection } from "../src/components/settings/AboutSection"
import { AccountSection } from "../src/components/settings/AccountSection"
import { AppearanceSection } from "../src/components/settings/AppearanceSection"
import { DataSection } from "../src/components/settings/DataSection"
import { EquipmentSection } from "../src/components/settings/EquipmentSection"
import { IntegrationsSection } from "../src/components/settings/IntegrationsSection"
import { NutritionSection } from "../src/components/settings/NutritionSection"
import { AppBar, Columns, IconButton, Page, rhythm } from "../src/ui"

/** Root-Stack route reached from the Progress header: Account, Appearance, Units, Data, About. */
export default function SettingsScreen() {
  const router = useRouter()
  // A direct load has no history to go back to.
  const back = () => (router.canGoBack() ? router.back() : router.replace("/feed"))
  return (
    <Page
      scroll
      wide
      header={
        <AppBar
          title="Settings"
          leading={<IconButton icon="chevronLeft" accessibilityLabel="Back" onPress={back} />}
        />
      }
    >
      <Columns
        split="6/6"
        main={
          <View style={{ gap: rhythm.groupToLabel }}>
            <AccountSection />
            <IntegrationsSection />
            <EquipmentSection />
            <NutritionSection />
          </View>
        }
        side={
          <View style={{ gap: rhythm.groupToLabel }}>
            <AppearanceSection />
            <DataSection />
            <AboutSection />
          </View>
        }
      />
    </Page>
  )
}
