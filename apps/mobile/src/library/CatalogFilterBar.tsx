import type { Location } from "@tanren/shared"
import { Option } from "effect"
import { type ReactNode, useState } from "react"
import { Pressable, ScrollView, TextInput, View } from "react-native"
import {
  Button,
  Icon,
  radius,
  rhythm,
  sizes,
  space,
  stroke,
  Text,
  ToggleChip,
  type,
  useBreakpoint,
  useTheme,
} from "../ui"
import {
  atLocationLabel,
  EQUIPMENT_OPTIONS,
  equipmentFromValue,
  type FacetOption,
  KIND_OPTIONS,
  kindFromValue,
  MUSCLE_OPTIONS,
  muscleFromValue,
  resultCount,
  segmentValue,
} from "./catalogFormat"
import { FilterSheet } from "./FilterSheet"
import {
  activeFilterCount,
  filterChipLabel,
  hasFilter,
  type SearchAction,
  type SearchState,
} from "./searchState"

/** Invisible extra tap area around a 32 px chip (the Pressable is 44 tall already). */
const CHIP_SLOP = 6
/** Height of the "291 exercises" row under the chips. */
const COUNT_ROW_HEIGHT = 32

interface FacetChipsProps {
  readonly accessibilityLabel: string
  readonly options: ReadonlyArray<FacetOption>
  readonly value: string
  readonly onChange: (value: string) => void
  /** Chips that lead the row before the facet's own (the "At <location>" toggle). */
  readonly leading?: ReactNode
  /** Phone: chips 8 apart with extra tap area; desktop keeps the original 4 / none. */
  readonly compact?: boolean
}

/** One horizontally scrolling row of single-select chips for a facet ("All" first). */
function FacetChips({
  accessibilityLabel,
  options,
  value,
  onChange,
  leading = null,
  compact = false,
}: FacetChipsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={accessibilityLabel}
      contentContainerStyle={{ gap: compact ? rhythm.chipGap : space.xs }}
    >
      {leading}
      {options.map((option) => (
        <ToggleChip
          key={option.value}
          label={option.label}
          selected={option.value === value}
          onPress={() => onChange(option.value)}
          {...(compact ? { hitSlop: CHIP_SLOP } : {})}
        />
      ))}
    </ScrollView>
  )
}

interface LocationChipProps {
  readonly label: string
  readonly selected: boolean
  readonly onPress: () => void
}

/**
 * The count row's "At <location>" toggle: an outlined pill (the ToggleChip's filled "on" state would
 * make it a second selection beside "All"). On = accent outline and pin, label in the 700 weight.
 * Same 32 px pill in a 44 px tap box as ToggleChip; the box is pulled into the 32 px count row.
 */
function LocationChip({ label, selected, onPress }: LocationChipProps) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      // react-native-web drops `accessibilityState.checked`; `aria-checked` reaches the DOM too.
      aria-checked={selected}
      hitSlop={CHIP_SLOP}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: sizes.tap,
          justifyContent: "center",
          marginVertical: -(sizes.tap - COUNT_ROW_HEIGHT) / 2,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View
        style={{
          height: sizes.chip,
          flexDirection: "row",
          alignItems: "center",
          gap: space.xs,
          paddingHorizontal: space.md,
          borderRadius: radius.full,
          borderWidth: stroke.hairline,
          borderColor: selected ? colors.accent : colors.border,
          backgroundColor: "transparent",
        }}
      >
        <Icon
          name="mapPin"
          size={sizes.iconXs}
          color={selected ? colors.accent : colors.textMuted}
        />
        <Text variant="caption" style={selected ? { fontWeight: "700" } : undefined}>
          {label}
        </Text>
      </View>
    </Pressable>
  )
}

export interface CatalogFilterBarProps {
  readonly state: SearchState
  readonly dispatch: (action: SearchAction) => void
  readonly count: number
  /** The profile's active location; `None` hides the "At <name>" chip (no filter applies). */
  readonly location: Option.Option<Location>
}

interface SearchFieldProps {
  readonly state: SearchState
  readonly dispatch: (action: SearchAction) => void
}

function SearchField({ state, dispatch }: SearchFieldProps) {
  const { colors } = useTheme()
  return (
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
          flex: 1,
          minHeight: sizes.control,
          paddingHorizontal: space.lg,
          borderRadius: radius.md,
          borderCurve: "continuous",
          backgroundColor: colors.surface,
          color: colors.text,
        },
      ]}
    />
  )
}

/** Phone and tablet: search + Filters chip, one muscle row, the count row (At-location chip right). Equipment and kind live in the sheet. */
function CollapsedFilterBar({ state, dispatch, count, location }: CatalogFilterBarProps) {
  const [open, setOpen] = useState(false)
  const filters = activeFilterCount(state)
  return (
    <View style={{ gap: rhythm.chipGap, paddingTop: space.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: rhythm.chipGap }}>
        <SearchField state={state} dispatch={dispatch} />
        <ToggleChip
          icon="filter"
          label={filterChipLabel(filters)}
          selected={filters > 0}
          hitSlop={CHIP_SLOP}
          onPress={() => setOpen(true)}
        />
      </View>
      <FacetChips
        compact
        accessibilityLabel="Muscle"
        options={MUSCLE_OPTIONS}
        value={segmentValue(state.muscle)}
        onChange={(value) => dispatch({ _tag: "Muscle", value: muscleFromValue(value) })}
      />
      <View
        style={{
          height: COUNT_ROW_HEIGHT,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text variant="subhead" tone="muted" tabular accessibilityLiveRegion="polite">
          {resultCount(count)}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          {hasFilter(state) ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear filters"
              hitSlop={space.md}
              onPress={() => dispatch({ _tag: "Cleared" })}
            >
              <Text variant="subhead" tone="accent">
                Clear filters
              </Text>
            </Pressable>
          ) : null}
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
        </View>
      </View>
      <FilterSheet
        visible={open}
        state={state}
        dispatch={dispatch}
        onClose={() => setOpen(false)}
      />
    </View>
  )
}

/**
 * Desktop (unchanged): the "At <location>" chip, search field, one scrolling chip row per facet
 * (muscle, equipment, kind), then the count.
 */
function ExpandedFilterBar({ state, dispatch, count, location }: CatalogFilterBarProps) {
  const { colors } = useTheme()
  return (
    <View style={{ gap: space.sm, paddingVertical: space.md }}>
      {Option.match(location, {
        onNone: () => null,
        onSome: (active) => (
          <ToggleChip
            style={{ alignSelf: "flex-start" }}
            icon="mapPin"
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
      <FacetChips
        accessibilityLabel="Muscle"
        options={MUSCLE_OPTIONS}
        value={segmentValue(state.muscle)}
        onChange={(value) => dispatch({ _tag: "Muscle", value: muscleFromValue(value) })}
      />
      <FacetChips
        accessibilityLabel="Equipment"
        options={EQUIPMENT_OPTIONS}
        value={segmentValue(state.equipment)}
        onChange={(value) => dispatch({ _tag: "Equipment", value: equipmentFromValue(value) })}
      />
      <FacetChips
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
            variant="text"
            onPress={() => dispatch({ _tag: "Cleared" })}
          />
        ) : null}
      </View>
    </View>
  )
}

/** Library filter block: collapsed below desktop (Filters sheet), the full chip stack at desktop. */
export function CatalogFilterBar(props: CatalogFilterBarProps) {
  return useBreakpoint() === "desktop" ? (
    <ExpandedFilterBar {...props} />
  ) : (
    <CollapsedFilterBar {...props} />
  )
}
