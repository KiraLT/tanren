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
  Card,
  ListGroup,
  ListRow,
  StatusPill,
  sizes,
  space,
  Text,
  ToggleChip,
  type,
  useTheme,
} from "../../ui"
import { MAX_LOCATION_NAME } from "./locationsState"
import { SettingsSection } from "./SettingsSection"
import { equipmentGlyph } from "./settingsCopy"
import { useLocations } from "./useLocations"

export interface LocationEditorProps {
  readonly location: Location
  readonly active: boolean
  /** After Delete: leave the editor. */
  readonly onDeleted: () => void
}

/**
 * One location (equipment.md §6): name field in a card (saved on blur/submit), "Set active" (the
 * screen's one bold element), six groups of toggle chips in `EQUIPMENT_GROUPS` order and a
 * destructive "Delete" row. Every change saves at once.
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
    <View style={{ gap: space.xl }}>
      <View style={{ gap: space.sm }}>
        <Text variant="headline" accessibilityRole="header">
          Name
        </Text>
        <Card padding={0}>
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
              minHeight: sizes.control,
              color: colors.text,
              paddingHorizontal: space.lg,
            }}
          />
        </Card>
      </View>
      {active ? (
        <View style={{ alignItems: "flex-start" }}>
          <StatusPill label="Active" tone="accent" />
        </View>
      ) : (
        <Button
          label="Set active"
          accessibilityLabel="Set active"
          variant="primary"
          size="lg"
          icon="check"
          onPress={() => apply({ _tag: "SetActive", id: location.id })}
        />
      )}
      {Option.match(error, {
        onNone: () => null,
        onSome: (message) => (
          <Banner tone="danger" title="Could not save" body={message} onDismiss={dismiss} />
        ),
      })}
      {EquipmentGroup.literals.map((group) => (
        <SettingsSection key={group} title={EQUIPMENT_GROUP_LABEL[group]}>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              columnGap: space.sm,
              paddingHorizontal: space.lg,
              paddingVertical: space.sm,
            }}
          >
            {EQUIPMENT_GROUPS[group].map((equipment) => (
              <ToggleChip
                key={equipment}
                label={facetLabel(equipment)}
                selected={location.equipment.includes(equipment)}
                onPress={() => toggle(equipment)}
                {...Option.match(equipmentGlyph(equipment), {
                  onNone: () => ({}),
                  onSome: (icon) => ({ icon }),
                })}
              />
            ))}
          </View>
        </SettingsSection>
      ))}
      <ListGroup>
        <ListRow
          tone="danger"
          icon="trash"
          title="Delete location"
          accessibilityLabel={`Delete ${location.name}`}
          onPress={() =>
            apply({ _tag: "Remove", id: location.id }).then((done) => (done ? onDeleted() : null))
          }
        />
      </ListGroup>
    </View>
  )
}
