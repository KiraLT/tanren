import { Match } from "effect"
import { Pressable, StyleSheet, Text, View } from "react-native"
import type { PlanDay, PlannedExerciseBlock, PlannedSessionStatus } from "../hooks/usePlanWeek"
import { formatBlockLine, sessionLabel, statusLabel } from "./planFormat"
import { colors, radius, space } from "./theme"

/** One session of a plan day: the planned session, its status and its exercise blocks. */
export type PlanSessionItem = PlanDay["sessions"][number]

interface SessionBlocksProps {
  readonly blocks: ReadonlyArray<PlannedExerciseBlock>
}

/** The exercise lines of a session ("Back Squat · 3 × 5 @ 100 kg · rest 180 s"); reused by the aside. */
export function SessionBlocks({ blocks }: SessionBlocksProps) {
  if (blocks.length === 0) {
    return <Text style={styles.noBlocks}>No exercises planned yet</Text>
  }
  return (
    <View style={styles.blocks}>
      {blocks.map((block) => (
        <Text key={block.exercise.id} style={styles.block}>
          {formatBlockLine(block.exercise.name, block.sets)}
        </Text>
      ))}
    </View>
  )
}

interface StatusBadgeProps {
  readonly status: PlannedSessionStatus
}

const badgeStyle = Match.type<PlannedSessionStatus>().pipe(
  Match.when("done", () => ({ box: styles.badgeDone, text: styles.badgeTextDone })),
  Match.when("today", () => ({ box: styles.badgeToday, text: styles.badgeTextToday })),
  Match.when("upcoming", () => ({ box: styles.badgeUpcoming, text: styles.badgeTextMuted })),
  Match.when("missed", () => ({ box: styles.badgeMissed, text: styles.badgeTextMissed })),
  Match.exhaustive,
)

function StatusBadge({ status }: StatusBadgeProps) {
  const look = badgeStyle(status)
  return (
    <View style={[styles.badge, look.box]}>
      <Text style={[styles.badgeText, look.text]}>{statusLabel(status)}</Text>
    </View>
  )
}

interface PlannedSessionCardProps {
  readonly item: PlanSessionItem
  /** Rendered as a selected card (the aside shows its blocks). */
  readonly selected?: boolean
  /** Makes the card a button, e.g. to select it for the aside. */
  readonly onPress?: () => void
  /** Hide the inline exercise lines when the aside shows them. Default true. */
  readonly showBlocks?: boolean
}

/** Session name + status badge, then its exercise blocks. Pressable only when `onPress` is set. */
export function PlannedSessionCard({
  item,
  selected = false,
  onPress,
  showBlocks = true,
}: PlannedSessionCardProps) {
  const label = sessionLabel(item.plannedSession.name, item.status)
  const header = (
    <View style={styles.header}>
      <Text style={styles.name}>{item.plannedSession.name}</Text>
      <StatusBadge status={item.status} />
    </View>
  )
  const blocks = showBlocks ? <SessionBlocks blocks={item.blocks} /> : null
  const cardStyle = [styles.card, selected && styles.cardSelected]

  if (onPress !== undefined) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        style={cardStyle}
      >
        {header}
        {blocks}
      </Pressable>
    )
  }
  return (
    <View style={cardStyle}>
      <View accessible accessibilityLabel={label}>
        {header}
      </View>
      {blocks}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: "transparent",
    padding: space.md,
    gap: space.sm,
  },
  cardSelected: { borderColor: colors.accent },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  name: { flexShrink: 1, color: colors.text, fontSize: 20, fontWeight: "800" },
  blocks: { gap: 6 },
  block: { color: colors.textMuted, fontSize: 16, lineHeight: 22 },
  noBlocks: { color: colors.textMuted, fontSize: 16, fontStyle: "italic" },
  badge: {
    borderRadius: 999,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 14, fontWeight: "800" },
  badgeDone: { borderColor: colors.success },
  badgeTextDone: { color: colors.success },
  badgeToday: { backgroundColor: colors.accent, borderColor: colors.accent },
  badgeTextToday: { color: colors.onAccent },
  badgeUpcoming: { borderColor: colors.border },
  badgeTextMuted: { color: colors.textMuted },
  badgeMissed: { borderColor: colors.danger },
  badgeTextMissed: { color: colors.danger },
})
