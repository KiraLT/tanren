import { TextInput, View } from "react-native"
import { Button, radius, SegmentedControl, sizes, space, Text, type, useTheme } from "../ui"
import {
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
}

/** Search field, then one scrolling chip row per facet (muscle, equipment, kind), then the count. */
export function CatalogFilterBar({ state, dispatch, count }: CatalogFilterBarProps) {
  const { colors } = useTheme()
  return (
    <View style={{ gap: space.sm, paddingVertical: space.md }}>
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
