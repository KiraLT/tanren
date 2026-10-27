import type { ProgramSchedule, Weekday } from "@tanren/shared"
import { Array as Arr } from "effect"
import { View } from "react-native"
import { SegmentedControl, space, ToggleChip } from "../../ui"
import { toggleWeekday, WEEKDAYS } from "./programEdit"

const PER_WEEK = [3, 4, 5, 6] as const

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
  readonly onChange: (schedule: ProgramSchedule) => void
}

/**
 * "3–6 days per week" as a segmented control, or fixed weekdays as seven chips below it: choosing
 * in one replaces the other (a schedule is one or the other), and the active kind shows selected.
 */
export function SchedulePicker({ schedule, onChange }: SchedulePickerProps) {
  const perWeek = schedule.kind === "daysPerWeek" ? String(schedule.days) : ""
  const chosen = schedule.kind === "weekdays" ? schedule.weekdays : []
  return (
    <View style={{ gap: space.sm }}>
      <SegmentedControl
        accessibilityLabel="Days per week"
        value={perWeek}
        options={Arr.map(PER_WEEK, (days) => ({ value: String(days), label: `${days} days` }))}
        onChange={(value) => onChange({ kind: "daysPerWeek", days: Number(value) })}
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
            onPress={() => onChange(toggleWeekday(schedule, weekday))}
          />
        ))}
      </View>
    </View>
  )
}
