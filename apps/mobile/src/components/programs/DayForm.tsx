import type { ProgramDay } from "@tanren/shared"
import { Array as Arr, Option } from "effect"
import { useState } from "react"
import { View } from "react-native"
import { Banner, Button, Card, Columns, rhythm, space, Text, useBreakpoint } from "../../ui"
import { ItemCard } from "./ItemCard"
import { CompactStepper, SectionLabel, TextField } from "./ProgramFields"
import {
  MAX_ITEMS,
  mapItem,
  moveItem,
  RANGES,
  removeItem,
  type StepRange,
  stepRestBetweenRounds,
  stepRounds,
} from "./programEdit"

type DayChange = (day: ProgramDay) => ProgramDay

export interface DayFormProps {
  readonly day: ProgramDay
  /** The program's only day: it cannot be removed. */
  readonly onlyDay: boolean
  readonly error: Option.Option<string>
  /** A write is in flight: remove, move and the confirm are off until it lands. */
  readonly busy: boolean
  /** Queued: each change is applied to the stored day (text, steppers, mode). */
  readonly onChange: (change: DayChange) => void
  /** Position-based (move, remove an item): ignored while a write is in flight. */
  readonly onChangeOnce: (change: DayChange) => void
  readonly onAddExercise: () => void
  readonly onRemoveDay: () => void
  readonly onDone: () => void
}

const group = { gap: rhythm.labelToGroup } as const

/** Width of the stepper beside a row label inside the Rounds / Rest card. */
const STEPPER_WIDTH = 168

interface StepRowProps {
  readonly label: string
  readonly valueText: string
  readonly value: number
  readonly range: StepRange
  readonly onStep: (direction: -1 | 1) => void
}

function StepRow({ label, valueText, value, range, onStep }: StepRowProps) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
      <Text variant="body" style={{ flex: 1 }}>
        {label}
      </Text>
      <View style={{ width: STEPPER_WIDTH }}>
        <CompactStepper
          label={label}
          valueText={valueText}
          canDecrement={value > range.min}
          canIncrement={value < range.max}
          onDecrement={() => onStep(-1)}
          onIncrement={() => onStep(1)}
        />
      </View>
    </View>
  )
}

/**
 * The day editor body (programs-mcp.md §4). Desktop: Title, Rounds / Rest and the footer on the
 * left, the exercises on the right (5/7); below that one column, footer last.
 */
export function DayForm({
  day,
  onlyDay,
  error,
  busy,
  onChange,
  onChangeOnce,
  onAddExercise,
  onRemoveDay,
  onDone,
}: DayFormProps) {
  const desktop = useBreakpoint() === "desktop"
  // `Alert.alert` is a no-op on web: removing a whole day is confirmed inline.
  const [confirmRemove, setConfirmRemove] = useState(false)
  const footer = (
    <View style={{ gap: space.sm }}>
      <Button variant="primary" size="lg" label="Done" onPress={onDone} />
      {onlyDay ? null : confirmRemove ? (
        <Button
          variant="destructive"
          label={`Remove ${day.title}? Tap again`}
          accessibilityLabel={`Confirm removing ${day.title}`}
          disabled={busy}
          onPress={onRemoveDay}
        />
      ) : (
        <Button
          variant="text"
          label="Remove day"
          accessibilityLabel={`Remove ${day.title}`}
          onPress={() => setConfirmRemove(true)}
        />
      )}
    </View>
  )
  const settings = (
    <View style={{ gap: rhythm.groupToLabel }}>
      {Option.match(error, {
        onNone: () => null,
        onSome: (message) => (
          <Banner tone="danger" title="Could not save this day" body={message} />
        ),
      })}
      <View style={group}>
        <SectionLabel>Title</SectionLabel>
        <TextField
          label="Day title"
          value={day.title}
          maxLength={80}
          onCommit={(text) => onChange((current) => ({ ...current, title: text }))}
        />
      </View>
      <Card>
        <View style={{ gap: space.sm }}>
          <StepRow
            label="Rounds"
            valueText={`${day.rounds}`}
            value={day.rounds}
            range={RANGES.rounds}
            onStep={(direction) => onChange((current) => stepRounds(current, direction))}
          />
          <StepRow
            label="Rest between rounds"
            valueText={`${day.restBetweenRoundsSeconds} s`}
            value={day.restBetweenRoundsSeconds}
            range={RANGES.restBetweenRounds}
            onStep={(direction) => onChange((current) => stepRestBetweenRounds(current, direction))}
          />
        </View>
      </Card>
      {desktop ? footer : null}
    </View>
  )
  const exercises = (
    <View style={{ gap: rhythm.groupToLabel }}>
      <View style={group}>
        <SectionLabel>Exercises</SectionLabel>
        {Arr.map(day.items, (item, index) => (
          <ItemCard
            // An item has no id and the list is reordered by position, so the position is its key.
            key={`${index}-${item.catalogId}`}
            item={item}
            isFirst={index === 0}
            isLast={index === day.items.length - 1}
            isOnly={day.items.length === 1}
            busy={busy}
            onChange={(change) => onChange((current) => mapItem(current, index, change))}
            onMove={(direction) =>
              onChangeOnce((current) => ({
                ...current,
                items: moveItem(current.items, index, direction),
              }))
            }
            onRemove={() => onChangeOnce((current) => removeItem(current, index))}
          />
        ))}
        <Button
          variant="secondary"
          icon="plus"
          label="Add exercise"
          disabled={day.items.length >= MAX_ITEMS}
          onPress={onAddExercise}
        />
      </View>
      {desktop ? null : footer}
    </View>
  )
  return <Columns split="5/7" main={settings} side={exercises} />
}
