import type { Location, LocationPreset } from "@tanren/shared"
import { Option } from "effect"
import { useRouter } from "expo-router"
import { View } from "react-native"
import { useProfile } from "../../hooks/useProfile"
import { Banner, Button, ListRow, StatusPill, space, Text } from "../../ui"
import { equipmentCountLabel } from "./locationsState"
import { SettingsSection } from "./SettingsSection"
import { useLocations } from "./useLocations"

const PRESET_BUTTONS: ReadonlyArray<{ readonly preset: LocationPreset; readonly label: string }> = [
  { preset: "commercialGym", label: "Add gym" },
  { preset: "home", label: "Add home" },
  { preset: "bodyweightOnly", label: "Add bodyweight" },
]

/**
 * Settings > Equipment & locations (equipment.md §6): one row per location (Active pill, Edit),
 * then preset buttons. Adding opens the new location's editor.
 */
export function EquipmentSection() {
  const router = useRouter()
  const profile = useProfile()
  const { addPreset, error, dismiss } = useLocations()
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
            title={location.name}
            subtitle={equipmentCountLabel(location)}
            accessibilityLabel={`Edit ${location.name}${isActive ? ", active" : ""}`}
            onPress={() => edit(location.id)}
            trailing={
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                {isActive ? <StatusPill label="Active" tone="accent" /> : null}
                <Text tone="muted">Edit</Text>
              </View>
            }
          />
        )
      })}
      <View style={{ gap: space.sm, padding: space.lg }}>
        {locations.length === 0 ? (
          <Text variant="subhead" tone="muted">
            Tell Tanren what your gym has; the Library then shows what you can do there.
          </Text>
        ) : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {PRESET_BUTTONS.map(({ preset, label }) => (
            <Button
              key={preset}
              label={label}
              accessibilityLabel={label}
              variant="secondary"
              icon="plus"
              onPress={() => add(preset)}
            />
          ))}
        </View>
        {Option.match(error, {
          onNone: () => null,
          onSome: (message) => (
            <Banner tone="danger" title="Could not save" body={message} onDismiss={dismiss} />
          ),
        })}
      </View>
    </SettingsSection>
  )
}
