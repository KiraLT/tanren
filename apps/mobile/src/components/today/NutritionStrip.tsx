import { Option } from "effect"
import { useRouter } from "expo-router"
import { Pressable, type StyleProp, View, type ViewStyle } from "react-native"
import { useNutritionDay } from "../../hooks/useNutritionDay"
import type { NutritionDay } from "../../services/NutritionRepo"
import { Icon, radius, space, Text, usePressableInteraction, useTheme } from "../../ui"
import { stripLines } from "../health/nutritionText"
import { localDateOf } from "../planFormat"

/** One caption line (nutrition.md §6: every row 18; 8 + 3 × 18 + 8 + 2 border = 72, 54 without an insight). */
const ROW_HEIGHT = 18
const GLYPH = 16
/** Rows 2 and 3 start under "Nutrition": glyph + the row-1 gap. */
const TEXT_INDENT = GLYPH + space.sm

export interface NutritionStripProps {
  readonly style?: StyleProp<ViewStyle>
}

/** Off and nothing logged today: the strip has nothing to say. */
const isSilent = ({ day }: NutritionDay): boolean =>
  Option.isNone(day.targets) && day.entries.length === 0

/**
 * Today's nutrition strip (nutrition.md §6 "Today strip"), directly under `HealthStrip`: fork,
 * "Nutrition", the kcal value; then "Eaten · Burned · Protein"; then the first insight. Opens
 * `/health`. Renders nothing while loading, on a failed read, and when nutrition is off and nothing
 * was logged today. `surfaceRaised` with a hairline border, like `HealthStrip`.
 */
export function NutritionStrip({ style }: NutritionStripProps) {
  const { colors } = useTheme()
  const router = useRouter()
  const { hovered, handlers, focusStyle } = usePressableInteraction()
  // The device's calendar day at render (same read as `HealthStrip`).
  const state = useNutritionDay(localDateOf(new Date()))
  if (state._tag !== "Ready" || isSilent(state.value)) {
    return null
  }
  const lines = stripLines(state.value)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={lines.accessibilityLabel}
      // biome-ignore lint/plugin/noMutation: Expo Router's navigation call, not an array push
      onPress={() => router.push("/health")}
      {...handlers}
      style={({ pressed }) => [
        {
          paddingVertical: space.sm,
          paddingHorizontal: space.md,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.md,
          backgroundColor: hovered || pressed ? colors.surface : colors.surfaceRaised,
        },
        focusStyle,
        style,
      ]}
    >
      <View
        style={{ height: ROW_HEIGHT, flexDirection: "row", alignItems: "center", gap: space.sm }}
      >
        <Icon name="fork" size={GLYPH} color={colors.accent} />
        <Text variant="label">Nutrition</Text>
        <View style={{ flex: 1 }} />
        <Text variant="caption" tone="accent" tabular numberOfLines={1}>
          {lines.value}
        </Text>
      </View>
      <Text variant="caption" tone="muted" numberOfLines={1} style={{ marginLeft: TEXT_INDENT }}>
        {lines.detail}
      </Text>
      {Option.match(lines.insight, {
        onNone: () => null,
        onSome: (text) => (
          <Text variant="caption" numberOfLines={1} style={{ marginLeft: TEXT_INDENT }}>
            {text}
          </Text>
        ),
      })}
    </Pressable>
  )
}
