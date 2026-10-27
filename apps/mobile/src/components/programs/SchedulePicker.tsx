import type { ProgramSchedule, Weekday } from "@tanren/shared"
import { Array as Arr, Option } from "effect"
import { View } from "react-native"
import { SegmentedControl, space, Text, ToggleChip } from "../../ui"
import { PER_WEEK, scheduleCaption, WEEKDAYS } from "./programEdit"

const WEEKDAY_LABELS: { readonly [D in Weekday]: string } = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
}

export interface SchedulePickerProps {
  readonly schedule: ProgramSchedule
  readonly onPerWeek: (days: number) => void
  /** Applied to the stored schedule (two quick taps toggle twice), not to the rendered one. */
  readonly onToggleWeekday: (weekday: Weekday) => void
}

/**
 * "3–6 days per week" as a segmented control, or fixed weekdays as seven chips below it: choosing
 * in one replaces the other (a schedule is one or the other), and the active kind shows selected.
 * A schedule with no segment for it (1, 2 or 7 days a week) is named in a caption.
 */
export function SchedulePicker({ schedule, onPerWeek, onToggleWeekday }: SchedulePickerProps) {
  const perWeek = schedule.kind === "daysPerWeek" ? String(schedule.days) : ""
  const chosen = schedule.kind === "weekdays" ? schedule.weekdays : []
  return (
    <View style={{ gap: space.sm }}>
      <SegmentedControl
        accessibilityLabel="Days per week"
        value={perWeek}
        options={Arr.map(PER_WEEK, (days) => ({ value: String(days), label: `${days} days` }))}
        onChange={(value) => onPerWeek(Number(value))}
      />
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Or choose weekdays"
        style={{ flexDirection: "row", justifyContent: "space-between" }}
      >
        {Arr.map(WEEKDAYS, (weekday) => (
          <ToggleChip
            key={weekday}
            compact
            label={WEEKDAY_LABELS[weekday]}
            selected={chosen.includes(weekday)}
            onPress={() => onToggleWeekday(weekday)}
          />
        ))}
      </View>
      {Option.match(scheduleCaption(schedule), {
        onNone: () => null,
        onSome: (caption) => (
          <Text variant="caption" tone="muted">
            {caption}
          </Text>
        ),
      })}
    </View>
  )
}
