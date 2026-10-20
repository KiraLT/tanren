import { Array as Arr, Option } from "effect"
import { View } from "react-native"
import { SegmentedControl, space, Text, useThemePreference } from "../../ui"
import { SettingsSection } from "./SettingsSection"
import { APPEARANCE_OPTIONS } from "./settingsCopy"

/** Settings > Appearance: System / Light / Dark through the theme preference (persisted by D1). */
export function AppearanceSection() {
  const { preference, setPreference } = useThemePreference()
  const choose = (value: string) =>
    Option.map(
      Arr.findFirst(APPEARANCE_OPTIONS, (option) => option.value === value),
      (option) => setPreference(option.value),
    )
  return (
    <SettingsSection title="Appearance">
      <View style={{ gap: space.sm, padding: space.lg }}>
        <SegmentedControl
          accessibilityLabel="Appearance"
          options={APPEARANCE_OPTIONS}
          value={preference}
          onChange={choose}
        />
        <Text variant="subhead" tone="muted">
          System follows your device.
        </Text>
      </View>
    </SettingsSection>
  )
}
