import { dayDurationSeconds, type Program, type ProgramDay } from "@tanren/shared"
import { Array as Arr } from "effect"
import { View } from "react-native"
import { Button, Card, ListRow, StatusPill, space, Text, type Tone } from "../../ui"
import { exerciseName, itemAmount } from "../cues"

/** "≈ 15 min" from the planned length. */
export const approxMinutes = (day: ProgramDay): string =>
  `≈ ${Math.round(dayDurationSeconds(day) / 60)} min`

interface EnrolCardProps {
  readonly program: Program
  readonly enrolling: boolean
  readonly onEnrol: () => void
}

/** No active enrollment: what the program is and one button to start it. */
export function EnrolCard({ program, enrolling, onEnrol }: EnrolCardProps) {
  return (
    <Card>
      <View style={{ gap: space.md }}>
        <Text variant="title">{program.name}</Text>
        <Text tone="muted">{program.tagline}</Text>
        <Text>{program.description}</Text>
        <Text variant="caption" tone="muted">
          {`${program.days.length} days`}
        </Text>
        <Button
          label={`Start ${program.name}`}
          accessibilityLabel={`Enrol in ${program.name}`}
          onPress={onEnrol}
          loading={enrolling}
          size="lg"
        />
      </View>
    </Card>
  )
}

interface DayCardProps {
  readonly program: Program
  readonly day: ProgramDay
  /** Hidden in two columns, where the aside lists the days instead. */
  readonly showItems?: boolean
  readonly onStart: () => void
}

/** Today's day: title, rounds, ≈ minutes, the items and "Start". */
export function DayCard({ program, day, showItems = true, onStart }: DayCardProps) {
  return (
    <Card>
      <View style={{ gap: space.md }}>
        <Text variant="caption" tone="muted">
          {`${program.name} · Day ${day.dayNumber} of ${program.days.length}`}
        </Text>
        <Text variant="title">{day.title}</Text>
        <Text tone="muted">
          {`${day.items.length} exercises · ${day.rounds} ${day.rounds === 1 ? "round" : "rounds"} · ${approxMinutes(day)}`}
        </Text>
        {showItems ? (
          <View accessibilityRole="list" style={{ gap: space.xs }}>
            {Arr.map(day.items, (item, index) => (
              <View
                key={`${item.catalogId}-${index}`}
                accessible
                accessibilityLabel={`${exerciseName(item.catalogId)}, ${itemAmount(item)}`}
                style={{ flexDirection: "row", justifyContent: "space-between" }}
              >
                <Text>{exerciseName(item.catalogId)}</Text>
                <Text tone="muted">{itemAmount(item)}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <Button
          label="Start"
          accessibilityLabel={`Start day ${day.dayNumber}`}
          icon="play"
          onPress={onStart}
          size="xl"
        />
      </View>
    </Card>
  )
}

type DayStatus = "done" | "today" | "upcoming"

const statusOf = (dayNumber: number, currentDay: number): DayStatus =>
  dayNumber < currentDay ? "done" : dayNumber === currentDay ? "today" : "upcoming"

const statusTone: { readonly [S in DayStatus]: Tone } = {
  done: "success",
  today: "accent",
  upcoming: "neutral",
}

const statusLabel: { readonly [S in DayStatus]: string } = {
  done: "Done",
  today: "Today",
  upcoming: "Upcoming",
}

interface DayListProps {
  readonly program: Program
  readonly currentDay: number
}

/** Every day of the program with done / today / upcoming (the two-column aside). */
export function DayList({ program, currentDay }: DayListProps) {
  return (
    <View accessibilityRole="list" accessibilityLabel={`${program.name} days`} style={{ gap: 2 }}>
      {Arr.map(program.days, (day) => {
        const status = statusOf(day.dayNumber, currentDay)
        return (
          <ListRow
            key={day.dayNumber}
            title={day.title}
            subtitle={approxMinutes(day)}
            selected={status === "today"}
            accessibilityLabel={`${day.title}, ${statusLabel[status]}`}
            trailing={<StatusPill label={statusLabel[status]} tone={statusTone[status]} />}
          />
        )
      })}
    </View>
  )
}

/** Past the last day. */
export function ProgramFinished({ program }: { readonly program: Program }) {
  return (
    <Card tone="success">
      <View style={{ gap: space.sm }}>
        <Text variant="title">{`${program.name} complete`}</Text>
        <Text>{`All ${program.days.length} days done.`}</Text>
      </View>
    </Card>
  )
}
