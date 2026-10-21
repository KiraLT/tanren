import { View } from "react-native"
import type { PlanDay, PlannedExerciseBlock } from "../hooks/usePlanWeek"
import { Card, StatusPill, space, statusTone, Text } from "../ui"
import { formatBlockLine, sessionLabel, statusLabel } from "./planFormat"

/** One session of a plan day: the planned session, its status and its exercise blocks. */
export type PlanSessionItem = PlanDay["sessions"][number]

interface SessionBlocksProps {
  readonly blocks: ReadonlyArray<PlannedExerciseBlock>
}

/** The exercise lines of a session ("Back Squat · 3 × 5 @ 100 kg · rest 180 s"); reused by the aside. */
export function SessionBlocks({ blocks }: SessionBlocksProps) {
  if (blocks.length === 0) {
    return (
      <Text variant="subhead" tone="muted">
        No exercises planned yet
      </Text>
    )
  }
  return (
    <View style={{ gap: space.xs }}>
      {blocks.map((block) => (
        <Text key={block.exercise.id} variant="subhead" tone="muted">
          {formatBlockLine(block.exercise.name, block.sets)}
        </Text>
      ))}
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

/** Session name + status pill, then its exercise blocks. Pressable only when `onPress` is set. */
export function PlannedSessionCard({
  item,
  selected = false,
  onPress,
  showBlocks = true,
}: PlannedSessionCardProps) {
  const label = sessionLabel(item.plannedSession.name, item.status)
  const header = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: space.md,
      }}
    >
      <Text variant="title2" style={{ flexShrink: 1 }}>
        {item.plannedSession.name}
      </Text>
      <StatusPill label={statusLabel(item.status)} tone={statusTone[item.status]} />
    </View>
  )
  const blocks = showBlocks ? <SessionBlocks blocks={item.blocks} /> : null
  const cardStyle = { gap: space.sm }

  if (onPress !== undefined) {
    return (
      <Card onPress={onPress} accessibilityLabel={label} selected={selected} style={cardStyle}>
        {header}
        {blocks}
      </Card>
    )
  }
  return (
    <Card selected={selected} style={cardStyle}>
      <View accessible accessibilityLabel={label}>
        {header}
      </View>
      {blocks}
    </Card>
  )
}
