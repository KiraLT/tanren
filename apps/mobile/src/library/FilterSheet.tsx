import { Modal, Pressable, ScrollView, View } from "react-native"
import { Button, radius, rhythm, space, Text, ToggleChip, useTheme } from "../ui"
import {
  EQUIPMENT_OPTIONS,
  equipmentFromValue,
  type FacetOption,
  KIND_OPTIONS,
  kindFromValue,
  segmentValue,
} from "./catalogFormat"
import { hasFilter, type SearchAction, type SearchState } from "./searchState"

/** Invisible extra tap area around a 32 px chip (the Pressable is 44 tall already). */
const CHIP_SLOP = 6

interface FacetWrapProps {
  readonly title: string
  readonly options: ReadonlyArray<FacetOption>
  readonly value: string
  readonly onChange: (value: string) => void
}

/** A titled, wrapping single-select chip group ("All" first). */
function FacetWrap({ title, options, value, onChange }: FacetWrapProps) {
  return (
    <View style={{ gap: rhythm.labelToGroup }}>
      <Text variant="headline" accessibilityRole="header">
        {title}
      </Text>
      <View
        accessibilityLabel={title}
        style={{ flexDirection: "row", flexWrap: "wrap", columnGap: rhythm.chipGap }}
      >
        {options.map((option) => (
          <ToggleChip
            key={option.value}
            label={option.label}
            hitSlop={CHIP_SLOP}
            selected={option.value === value}
            onPress={() => onChange(option.value)}
          />
        ))}
      </View>
    </View>
  )
}

export interface FilterSheetProps {
  readonly visible: boolean
  readonly state: SearchState
  readonly dispatch: (action: SearchAction) => void
  readonly onClose: () => void
}

/**
 * The equipment + kind facets in a bottom sheet. A transparent `Modal` with our own backdrop and
 * sheet (not `presentationStyle="pageSheet"`: react-native-web ignores it; `@expo/ui`'s
 * BottomSheet is not installed and has no web build).
 */
export function FilterSheet({ visible, state, dispatch, onClose }: FilterSheetProps) {
  const { colors } = useTheme()
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close filters"
          onPress={onClose}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: colors.overlay,
          }}
        />
        <View
          accessibilityViewIsModal
          style={{
            maxHeight: "85%",
            width: "100%",
            maxWidth: 600,
            alignSelf: "center",
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            borderCurve: "continuous",
            paddingTop: space.lg,
            paddingHorizontal: space.lg,
            paddingBottom: space.xl,
            gap: space.lg,
          }}
        >
          <View
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
          >
            <Text variant="title2" accessibilityRole="header">
              Filters
            </Text>
            <Button label="Done" variant="text" onPress={onClose} />
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: rhythm.groupToLabel }}
          >
            <FacetWrap
              title="Equipment"
              options={EQUIPMENT_OPTIONS}
              value={segmentValue(state.equipment)}
              onChange={(value) =>
                dispatch({ _tag: "Equipment", value: equipmentFromValue(value) })
              }
            />
            <FacetWrap
              title="Kind"
              options={KIND_OPTIONS}
              value={segmentValue(state.kind)}
              onChange={(value) => dispatch({ _tag: "Kind", value: kindFromValue(value) })}
            />
          </ScrollView>
          {hasFilter(state) ? (
            <Button
              label="Clear filters"
              variant="secondary"
              onPress={() => dispatch({ _tag: "Cleared" })}
            />
          ) : null}
        </View>
      </View>
    </Modal>
  )
}
