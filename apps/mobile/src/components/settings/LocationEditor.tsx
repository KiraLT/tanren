import {
  type CatalogEquipment,
  EQUIPMENT_GROUP_LABEL,
  EQUIPMENT_GROUPS,
  EquipmentGroup,
  type Location,
} from "@tanren/shared"
import { Option } from "effect"
import { useEffect, useState } from "react"
import { TextInput, View } from "react-native"
import { facetLabel } from "../../library/catalogFormat"
import {
  Banner,
  Button,
  radius,
  StatusPill,
  sizes,
  space,
  stroke,
  Text,
  ToggleChip,
  type,
  useTheme,
} from "../../ui"
import { MAX_LOCATION_NAME } from "./locationsState"
import { SettingsSection } from "./SettingsSection"
import { useLocations } from "./useLocations"

export interface LocationEditorProps {
  readonly location: Location
  readonly active: boolean
  /** After Delete: leave the editor. */
  readonly onDeleted: () => void
}

/**
 * One location (equipment.md §6): name field (saved on blur/submit), six groups of toggle chips
 * in `EQUIPMENT_GROUPS` order, "Set active" and "Delete". Every change saves at once.
 */
export function LocationEditor({ location, active, onDeleted }: LocationEditorProps) {
  const { colors } = useTheme()
  const { apply, error, dismiss } = useLocations()
  const [name, setName] = useState(location.name)
  useEffect(() => setName(location.name), [location.name])
  const rename = () => apply({ _tag: "Rename", id: location.id, name })
  const toggle = (equipment: CatalogEquipment) =>
    apply({ _tag: "Toggle", id: location.id, equipment })
  return (
    <View style={{ gap: space.lg }}>
      <View style={{ gap: space.sm }}>
        <Text variant="caption" tone="muted">
          Name
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          onBlur={rename}
          onSubmitEditing={rename}
          maxLength={MAX_LOCATION_NAME}
          accessibilityLabel="Location name"
          placeholder="Home"
          placeholderTextColor={colors.textMuted}
          style={{
            ...type.body,
            minHeight: sizes.tap,
            borderRadius: radius.md,
            borderWidth: stroke.hairline,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            color: colors.text,
            paddingHorizontal: space.lg,
          }}
        />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm }}>
        {active ? (
          <StatusPill label="Active" tone="accent" />
        ) : (
          <Button
            label="Set active"
            accessibilityLabel="Set active"
            variant="primary"
            onPress={() => apply({ _tag: "SetActive", id: location.id })}
          />
        )}
        <Button
          label="Delete"
          accessibilityLabel={`Delete ${location.name}`}
          variant="destructive"
          onPress={() =>
            apply({ _tag: "Remove", id: location.id }).then((done) => (done ? onDeleted() : null))
          }
        />
      </View>
      {Option.match(error, {
        onNone: () => null,
        onSome: (message) => (
          <Banner tone="danger" title="Could not save" body={message} onDismiss={dismiss} />
        ),
      })}
      {EquipmentGroup.literals.map((group) => (
        <SettingsSection key={group} title={EQUIPMENT_GROUP_LABEL[group]}>
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, padding: space.md }}
          >
            {EQUIPMENT_GROUPS[group].map((equipment) => (
              <ToggleChip
                key={equipment}
                label={facetLabel(equipment)}
                selected={location.equipment.includes(equipment)}
                onPress={() => toggle(equipment)}
              />
            ))}
          </View>
        </SettingsSection>
      ))}
    </View>
  )
}
