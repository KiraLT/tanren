import type { ProgramDay } from "@tanren/shared"
import { Array as Arr, Option } from "effect"
import { useState } from "react"
import { View } from "react-native"
import { Banner, Button, Card, rhythm, space, Text } from "../../ui"
import { ItemCard } from "./ItemCard"
import { CompactStepper, SectionLabel, TextField } from "./ProgramFields"
import { MAX_ITEMS, moveItem, RANGES, removeItem, stepValue } from "./programEdit"

export interface DayFormProps {
  readonly day: ProgramDay
  /** The program's only day: it cannot be removed. */
  readonly onlyDay: boolean
  readonly error: Option.Option<string>
  /** Every change is one saved row; there is no draft to flush. */
  readonly onChange: (change: (day: ProgramDay) => ProgramDay) => void
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
  readonly range: { readonly min: number; readonly max: number; readonly step: number }
  readonly onStep: (next: number) => void
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
          onDecrement={() => onStep(stepValue(value, -1, range))}
          onIncrement={() => onStep(stepValue(value, 1, range))}
        />
      </View>
    </View>
  )
}

/** The day editor body (programs-mcp.md §4): title, rounds, rest between rounds, items, remove day. */
export function DayForm({
  day,
  onlyDay,
  error,
  onChange,
  onAddExercise,
  onRemoveDay,
  onDone,
}: DayFormProps) {
  // `Alert.alert` is a no-op on web: removing a whole day is confirmed inline.
  const [confirmRemove, setConfirmRemove] = useState(false)
  return (
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
            onStep={(rounds) => onChange((current) => ({ ...current, rounds }))}
          />
          <StepRow
            label="Rest between rounds"
            valueText={`${day.restBetweenRoundsSeconds} s`}
            value={day.restBetweenRoundsSeconds}
            range={RANGES.restBetweenRounds}
            onStep={(restBetweenRoundsSeconds) =>
              onChange((current) => ({ ...current, restBetweenRoundsSeconds }))
            }
          />
        </View>
      </Card>
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
            onChange={(next) =>
              onChange((current) => ({
                ...current,
                items: Arr.map(current.items, (existing, i) => (i === index ? next : existing)),
              }))
            }
            onMove={(direction) =>
              onChange((current) => ({
                ...current,
                items: moveItem(current.items, index, direction),
              }))
            }
            onRemove={() => onChange((current) => removeItem(current, index))}
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
      <View style={{ gap: space.sm }}>
        <Button variant="primary" size="lg" label="Done" onPress={onDone} />
        {onlyDay ? null : confirmRemove ? (
          <Button
            variant="destructive"
            label={`Remove ${day.title}? Tap again`}
            accessibilityLabel={`Confirm removing ${day.title}`}
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
    </View>
  )
}
