import { type Meal, type QuickAddItem, searchQuickAdd } from "@tanren/shared"
import { Option } from "effect"
import { useState } from "react"
import { Platform, TextInput, View, type ViewStyle } from "react-native"
import { useBreakpoint } from "../../hooks/useLayoutMode"
import {
  Banner,
  Button,
  Columns,
  EmptyState,
  ListGroup,
  ListRow,
  radius,
  Stepper,
  sizes,
  space,
  stroke,
  Text,
  type Theme,
  ToggleChip,
  type,
  useStyles,
  useTheme,
} from "../../ui"
import {
  editorAddLabel,
  gramsText,
  itemSubtitle,
  MEAL_OPTIONS,
  multiplierText,
  portionText,
  stepMultiplier,
} from "./quickAddMath"

export interface QuickAddSheetProps {
  readonly onAdd: (input: {
    readonly item: QuickAddItem
    readonly multiplier: number
    readonly meal: Meal
  }) => void
  readonly pending: boolean
  readonly error: Option.Option<string>
  readonly onDismissError: () => void
}

/** ToggleChip's Pressable is 44 tall around a 32 pill: pull each by 6 so the row pitch is 32 + 8. */
const CHIP_PULL = (sizes.tap - sizes.chip) / 2

const isSelected = (selected: Option.Option<QuickAddItem>, item: QuickAddItem): boolean =>
  Option.exists(selected, (current) => current.id === item.id)

/**
 * Quick-add (nutrition.md §6): search the local catalog, tap a row, set the multiplier and meal,
 * Add. Phone narrows the list to the chosen row (tap it again to choose another); desktop keeps the
 * full list and puts the editor in the side column.
 */
export function QuickAddSheet({ onAdd, pending, error, onDismissError }: QuickAddSheetProps) {
  const styles = useStyles(createStyles)
  const { colors } = useTheme()
  const desktop = useBreakpoint() === "desktop"
  const [query, setQuery] = useState("")
  const [focused, setFocused] = useState(false)
  const [selected, setSelected] = useState<Option.Option<QuickAddItem>>(Option.none())
  const [multiplier, setMultiplier] = useState(1)
  const [meal, setMeal] = useState<Meal>("snack")

  const select = (item: QuickAddItem) => {
    setSelected(Option.some(item))
    setMultiplier(1)
    setMeal(item.meal)
  }
  const toggle = (item: QuickAddItem) =>
    isSelected(selected, item) ? setSelected(Option.none()) : select(item)
  const matches = searchQuickAdd(query)
  const rows =
    desktop || Option.isNone(selected)
      ? matches
      : Option.match(selected, { onNone: () => matches, onSome: (item) => [item] })

  // The same 2 px `focus` ring the pressables draw (`usePressableInteraction` in src/ui/interaction.ts).
  const focusRing: ViewStyle =
    Platform.OS === "web" && focused
      ? {
          outlineColor: colors.focus,
          outlineStyle: "solid",
          outlineWidth: stroke.outline,
          outlineOffset: 2,
        }
      : {}

  const list =
    rows.length === 0 ? (
      <EmptyState title="No match" body="Try another name, like “shake” or “rice”." />
    ) : (
      <ListGroup>
        {rows.map((item) => (
          <ListRow
            key={item.id}
            title={item.name}
            subtitle={itemSubtitle(item)}
            // Two lines: "258 kcal · 34 g · 1 scoop + 300 ml 2 % milk" is 300+ px beside the chevron at 390.
            subtitleLines={2}
            chevron={!isSelected(selected, item)}
            selected={isSelected(selected, item)}
            accessibilityLabel={item.name}
            onPress={() => toggle(item)}
          />
        ))}
      </ListGroup>
    )

  const main = (
    <View style={styles.column}>
      <TextInput
        style={[styles.input, focusRing]}
        value={query}
        onChangeText={(text) => {
          setQuery(text)
          setSelected(Option.none())
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Search foods"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Search foods"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {list}
    </View>
  )

  const editor = Option.match(selected, {
    // Desktop keeps the side column: an empty pane reads unfinished (ui-polish); phones stack, so no hint.
    onNone: () =>
      desktop ? (
        // An unflexed wrapper: EmptyState's `flex: 1` would centre the hint in the full list height.
        <View>
          <EmptyState
            title="Pick a food"
            body="Set the portion and the meal here, then add it to today."
          />
        </View>
      ) : null,
    onSome: (item) => (
      <View style={styles.editor}>
        <View style={styles.head}>
          {desktop ? <Text variant="headline">{item.name}</Text> : null}
          <Text variant="caption" tone="muted">
            {portionText(item, multiplier)}
          </Text>
        </View>
        <Stepper
          label="Portions"
          size="lg"
          valueText={multiplierText(multiplier)}
          unit={gramsText(item, multiplier)}
          onDecrement={() => setMultiplier((n) => stepMultiplier(n, -1))}
          onIncrement={() => setMultiplier((n) => stepMultiplier(n, 1))}
        />
        <View accessibilityRole="radiogroup" accessibilityLabel="Meal" style={styles.chips}>
          {MEAL_OPTIONS.map((option) => {
            const on = option.value === meal
            return (
              <ToggleChip
                key={option.value}
                label={option.label}
                selected={on}
                variant={on ? "solid" : "outline"}
                style={styles.chip}
                onPress={() => setMeal(option.value)}
              />
            )
          })}
        </View>
        {Option.match(error, {
          onNone: () => null,
          onSome: (message) => <Banner tone="danger" title={message} onDismiss={onDismissError} />,
        })}
        <Button
          variant="primary"
          size="lg"
          label={editorAddLabel(item, multiplier)}
          loading={pending}
          disabled={pending}
          onPress={() => onAdd({ item, multiplier, meal })}
        />
      </View>
    ),
  })

  return <Columns main={main} side={editor} split="7/5" />
}

const createStyles = ({ colors }: Theme) => ({
  column: { gap: space.lg },
  input: {
    ...type.body,
    minHeight: sizes.control,
    borderRadius: radius.md,
    borderWidth: stroke.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: space.lg,
  },
  editor: { gap: space.lg },
  head: { gap: space.xs },
  // Pitch 40 = pill 32 + rowGap 8; the padding gives the pulled 44 tap boxes back at the edges.
  chips: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    columnGap: space.sm,
    rowGap: space.sm,
    paddingVertical: CHIP_PULL,
  },
  chip: { marginVertical: -CHIP_PULL },
})
