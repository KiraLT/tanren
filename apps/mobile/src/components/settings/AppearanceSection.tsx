import { Array as Arr, Option } from "effect"
import { View } from "react-native"
import { ListRow, SegmentedControl, space, useTheme, useThemePreference } from "../../ui"
import { SettingsSection } from "./SettingsSection"
import { APPEARANCE_OPTIONS } from "./settingsCopy"

/** Settings > Appearance: System / Light / Dark through the theme preference (persisted by D1). */
export function AppearanceSection() {
  const { preference, setPreference } = useThemePreference()
  const { scheme } = useTheme()
  const choose = (value: string) =>
    Option.map(
      Arr.findFirst(APPEARANCE_OPTIONS, (option) => option.value === value),
      (option) => setPreference(option.value),
    )
  return (
    <SettingsSection title="Appearance">
      <View style={{ paddingBottom: space.md }}>
        <ListRow
          icon={scheme === "dark" ? "moon" : "sun"}
          title="Theme"
          subtitle="System follows your device."
        />
        <SegmentedControl
          inset
          accessibilityLabel="Appearance"
          options={APPEARANCE_OPTIONS}
          value={preference}
          onChange={choose}
        />
      </View>
    </SettingsSection>
  )
}
