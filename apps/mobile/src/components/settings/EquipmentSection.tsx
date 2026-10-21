import { LOCATION_PRESETS, type Location, type LocationPreset } from "@tanren/shared"
import { Option } from "effect"
import { useRouter } from "expo-router"
import { View } from "react-native"
import { useProfileState } from "../../hooks/useProfile"
import { Banner, ListRow, StatusPill, space, Text } from "../../ui"
import { equipmentCountLabel } from "./locationsState"
import { SettingsSection } from "./SettingsSection"
import { presetItemsLabel } from "./settingsCopy"
import { useLocations } from "./useLocations"

const PRESET_ROWS: ReadonlyArray<{ readonly preset: LocationPreset; readonly label: string }> = [
  { preset: "commercialGym", label: "Add gym" },
  { preset: "home", label: "Add home" },
  { preset: "bodyweightOnly", label: "Add bodyweight" },
]

/**
 * Settings > Equipment & locations (equipment.md §6): one row per location (Active pill, chevron),
 * then one row per preset with the `plus` glyph. Adding opens the new location's editor.
 */
export function EquipmentSection() {
  const router = useRouter()
  const state = useProfileState()
  const { addPreset, error, dismiss } = useLocations()
  const profile = state._tag === "Loaded" ? state.profile : Option.none()
  const locations: ReadonlyArray<Location> = Option.match(profile, {
    onNone: () => [],
    onSome: (found) => found.locations,
  })
  const active = Option.flatMap(profile, (found) => found.activeLocationId)
  const edit = (id: string) =>
    // biome-ignore lint/plugin/noMutation: expo-router push
    router.push({ pathname: "/settings/location/[id]", params: { id } })
  const add = (preset: LocationPreset) =>
    addPreset(preset).then((id) => Option.map(id, (created) => edit(created)))
  return (
    <SettingsSection title="Equipment & locations">
      {locations.map((location) => {
        const isActive = Option.contains(active, location.id)
        return (
          <ListRow
            key={location.id}
            icon="mapPin"
            title={location.name}
            subtitle={equipmentCountLabel(location)}
            accessibilityLabel={`Edit ${location.name}${isActive ? ", active" : ""}`}
            onPress={() => edit(location.id)}
            chevron
            trailing={isActive ? <StatusPill label="Active" tone="accent" /> : null}
          />
        )
      })}
      {state._tag === "Loaded" && locations.length === 0 ? (
        <View key="hint" style={{ padding: space.lg }}>
          <Text variant="subhead" tone="muted">
            Tell Tanren what your gym has; the Library then shows what you can do there.
          </Text>
        </View>
      ) : null}
      {PRESET_ROWS.map(({ preset, label }) => (
        <ListRow
          key={preset}
          icon="plus"
          title={label}
          subtitle={presetItemsLabel(LOCATION_PRESETS[preset].equipment.length)}
          accessibilityLabel={label}
          onPress={() => add(preset)}
        />
      ))}
      {Option.match(error, {
        onNone: () => null,
        onSome: (message) => (
          <View key="error" style={{ padding: space.lg }}>
            <Banner tone="danger" title="Could not save" body={message} onDismiss={dismiss} />
          </View>
        ),
      })}
    </SettingsSection>
  )
}
