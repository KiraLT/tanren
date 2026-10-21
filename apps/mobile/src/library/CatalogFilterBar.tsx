import type { Location } from "@tanren/shared"
import { Option } from "effect"
import { Pressable, TextInput, View } from "react-native"
import { Button, radius, SegmentedControl, sizes, space, stroke, Text, type, useTheme } from "../ui"
import {
  atLocationLabel,
  EQUIPMENT_OPTIONS,
  equipmentFromValue,
  KIND_OPTIONS,
  kindFromValue,
  MUSCLE_OPTIONS,
  muscleFromValue,
  resultCount,
  segmentValue,
} from "./catalogFormat"
import { hasFilter, type SearchAction, type SearchState } from "./searchState"

export interface CatalogFilterBarProps {
  readonly state: SearchState
  readonly dispatch: (action: SearchAction) => void
  readonly count: number
  /** The profile's active location; `None` hides the "At <name>" chip (no filter applies). */
  readonly location: Option.Option<Location>
}

interface LocationChipProps {
  readonly label: string
  readonly selected: boolean
  readonly onPress: () => void
}

/** Toggle chip: accent outline and tint while the location filter is on. */
function LocationChip({ label, selected, onPress }: LocationChipProps) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      onPress={onPress}
      style={{
        alignSelf: "flex-start",
        minHeight: sizes.tap,
        justifyContent: "center",
        paddingHorizontal: space.md,
        borderRadius: radius.full,
        borderWidth: stroke.hairline,
        borderColor: selected ? colors.accent : colors.border,
        backgroundColor: selected ? colors.accentSoft : colors.surfaceRaised,
      }}
    >
      <Text variant="subhead" style={{ color: selected ? colors.accent : colors.text }}>
        {label}
      </Text>
    </Pressable>
  )
}

/**
 * The "At <location>" chip (only with an active location), search field, one scrolling chip row
 * per facet (muscle, equipment, kind), then the count.
 */
export function CatalogFilterBar({ state, dispatch, count, location }: CatalogFilterBarProps) {
  const { colors } = useTheme()
  return (
    <View style={{ gap: space.sm, paddingVertical: space.md }}>
      {Option.match(location, {
        onNone: () => null,
        onSome: (active) => (
          <LocationChip
            label={atLocationLabel(active)}
            selected={state.atLocation}
            onPress={() => dispatch({ _tag: "AtLocation", value: !state.atLocation })}
          />
        ),
      })}
      <TextInput
        value={state.input}
        onChangeText={(text) => dispatch({ _tag: "Typed", text })}
        placeholder="Search exercises"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Search exercises"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
        style={[
          type.body,
          {
            minHeight: sizes.control,
            paddingHorizontal: space.lg,
            borderRadius: radius.md,
            borderCurve: "continuous",
            backgroundColor: colors.surface,
            color: colors.text,
          },
        ]}
      />
      <SegmentedControl
        accessibilityLabel="Muscle"
        options={MUSCLE_OPTIONS}
        value={segmentValue(state.muscle)}
        onChange={(value) => dispatch({ _tag: "Muscle", value: muscleFromValue(value) })}
      />
      <SegmentedControl
        accessibilityLabel="Equipment"
        options={EQUIPMENT_OPTIONS}
        value={segmentValue(state.equipment)}
        onChange={(value) => dispatch({ _tag: "Equipment", value: equipmentFromValue(value) })}
      />
      <SegmentedControl
        accessibilityLabel="Kind"
        options={KIND_OPTIONS}
        value={segmentValue(state.kind)}
        onChange={(value) => dispatch({ _tag: "Kind", value: kindFromValue(value) })}
      />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text variant="subhead" tone="muted" accessibilityLiveRegion="polite">
          {resultCount(count)}
        </Text>
        {hasFilter(state) ? (
          <Button
            label="Clear filters"
            variant="ghost"
            onPress={() => dispatch({ _tag: "Cleared" })}
          />
        ) : null}
      </View>
    </View>
  )
}
