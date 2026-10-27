import { findCatalogExercise, type ProgramItem } from "@tanren/shared"
import { Option } from "effect"
import { View } from "react-native"
import { Card, IconButton, space, Text, ToggleChip } from "../../ui"
import { CompactStepper, MoveButton } from "./ProgramFields"
import {
  RANGES,
  type StepRange,
  setsText,
  stepRest,
  stepSets,
  stepWork,
  withKind,
  workRange,
  workText,
  workValue,
} from "./programEdit"

export interface ItemCardProps {
  readonly item: ProgramItem
  readonly isFirst: boolean
  readonly isLast: boolean
  /** The day's only item: removing it would leave an empty day. */
  readonly isOnly: boolean
  /** A write is in flight: the position-based buttons (move, remove) are off until it lands. */
  readonly busy: boolean
  /** Queued: the change is applied to the stored item, not to the one rendered here. */
  readonly onChange: (change: (item: ProgramItem) => ProgramItem) => void
  readonly onMove: (direction: -1 | 1) => void
  readonly onRemove: () => void
}

/** The exercise's catalog name; an id the catalog does not know shows as written. */
export const itemName = (item: ProgramItem): string =>
  Option.match(findCatalogExercise(item.catalogId), {
    onNone: () => item.catalogId,
    onSome: (entry) => entry.name,
  })

const canStep = (value: number, range: StepRange) => ({
  canDecrement: value > range.min,
  canIncrement: value < range.max,
})

/**
 * One exercise of a day (programs-mcp.md §4): name + Timed / Reps, two steppers (work, rest), and
 * up / down / remove. 358 wide, 176 high at 390 (16 + 32 + 12 + 44 + 12 + 44 + 16).
 */
export function ItemCard({
  item,
  isFirst,
  isLast,
  isOnly,
  busy,
  onChange,
  onMove,
  onRemove,
}: ItemCardProps) {
  const name = itemName(item)
  return (
    <Card>
      <View style={{ gap: space.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", height: 32, gap: space.sm }}>
          <Text variant="headline" numberOfLines={1} style={{ flex: 1 }}>
            {name}
          </Text>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={`${name} mode`}
            style={{ flexDirection: "row", gap: space.xs }}
          >
            <ToggleChip
              compact
              label="Timed"
              selected={item.kind === "timed"}
              onPress={() => onChange((current) => withKind(current, "timed"))}
            />
            <ToggleChip
              compact
              label="Reps"
              selected={item.kind === "reps"}
              onPress={() => onChange((current) => withKind(current, "reps"))}
            />
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: space.md }}>
          <View style={{ flex: 1 }}>
            <CompactStepper
              label={item.kind === "timed" ? `${name} seconds` : `${name} reps`}
              valueText={workText(item)}
              {...canStep(workValue(item), workRange(item))}
              onDecrement={() => onChange((current) => stepWork(current, -1))}
              onIncrement={() => onChange((current) => stepWork(current, 1))}
            />
          </View>
          <View style={{ flex: 1 }}>
            <CompactStepper
              label={`${name} rest`}
              valueText={`${item.restSeconds} s rest`}
              {...canStep(item.restSeconds, RANGES.rest)}
              onDecrement={() => onChange((current) => stepRest(current, -1))}
              onIncrement={() => onChange((current) => stepRest(current, 1))}
            />
          </View>
        </View>
        {item.kind === "reps" ? (
          <View style={{ flexDirection: "row", gap: space.md }}>
            <View style={{ flex: 1 }}>
              <CompactStepper
                label={`${name} sets`}
                valueText={setsText(item.sets)}
                {...canStep(item.sets, RANGES.sets)}
                onDecrement={() => onChange((current) => stepSets(current, -1))}
                onIncrement={() => onChange((current) => stepSets(current, 1))}
              />
            </View>
            <View style={{ flex: 1 }} />
          </View>
        ) : null}
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: space.sm }}>
          <MoveButton
            direction="up"
            accessibilityLabel={`Move ${name} up`}
            disabled={isFirst || busy}
            onPress={() => onMove(-1)}
          />
          <MoveButton
            direction="down"
            accessibilityLabel={`Move ${name} down`}
            disabled={isLast || busy}
            onPress={() => onMove(1)}
          />
          <IconButton
            icon="trash"
            accessibilityLabel={`Remove ${name}`}
            disabled={isOnly || busy}
            onPress={onRemove}
          />
        </View>
      </View>
    </Card>
  )
}
