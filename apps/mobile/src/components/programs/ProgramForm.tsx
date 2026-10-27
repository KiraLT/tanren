import type { ProgramDay, ProgramSchedule } from "@tanren/shared"
import { Array as Arr, Option } from "effect"
import { View } from "react-native"
import { Banner, Button, IconButton, ListGroup, ListRow, rhythm, space } from "../../ui"
import { MoveButton, SectionLabel, TextField } from "./ProgramFields"
import { addDay, daySubtitle, MAX_DAYS, moveDay } from "./programEdit"
import { SchedulePicker } from "./SchedulePicker"
import type { DraftChange } from "./useProgramEditor"

export interface ProgramFormProps {
  readonly title: string
  readonly summary: string
  readonly schedule: ProgramSchedule
  readonly days: ReadonlyArray<ProgramDay>
  readonly error: Option.Option<string>
  /** Every change is one saved row (`version + 1`); there is no draft to flush. */
  readonly onChange: (change: DraftChange) => void
  readonly onOpenDay: (dayNumber: number) => void
  readonly onSave: () => void
}

const group = { gap: rhythm.labelToGroup } as const

/** The program editor body: title, summary, schedule, the day list, and Save. */
export function ProgramForm({
  title,
  summary,
  schedule,
  days,
  error,
  onChange,
  onOpenDay,
  onSave,
}: ProgramFormProps) {
  return (
    <View style={{ gap: rhythm.groupToLabel }}>
      {Option.match(error, {
        onNone: () => null,
        onSome: (message) => (
          <Banner tone="danger" title="Could not save this program" body={message} />
        ),
      })}
      <View style={group}>
        <SectionLabel>Title</SectionLabel>
        <TextField
          label="Program title"
          value={title}
          maxLength={80}
          onCommit={(text) => onChange((draft) => ({ ...draft, title: text }))}
        />
      </View>
      <View style={group}>
        <SectionLabel>Summary</SectionLabel>
        <TextField
          label="Program summary"
          value={summary}
          maxLength={500}
          multiline
          onCommit={(text) => onChange((draft) => ({ ...draft, summary: text }))}
        />
      </View>
      <View style={group}>
        <SectionLabel>Schedule</SectionLabel>
        <SchedulePicker
          schedule={schedule}
          onChange={(next) => onChange((draft) => ({ ...draft, schedule: next }))}
        />
      </View>
      <View style={group}>
        <SectionLabel>Days</SectionLabel>
        <ListGroup>
          {Arr.map(days, (day, index) => (
            // Siblings, not `trailing`: a button inside the row's own button is invalid DOM on web.
            <View
              key={day.dayNumber}
              style={{ flexDirection: "row", alignItems: "center", paddingRight: space.sm }}
            >
              <ListRow
                style={{ flex: 1 }}
                title={day.title}
                subtitle={daySubtitle(day)}
                accessibilityLabel={`${day.title}, ${daySubtitle(day)}`}
                onPress={() => onOpenDay(day.dayNumber)}
              />
              <MoveButton
                direction="up"
                accessibilityLabel={`Move day ${day.dayNumber} up`}
                disabled={index === 0}
                onPress={() =>
                  onChange((draft) => ({ ...draft, days: moveDay(draft.days, index, -1) }))
                }
              />
              <MoveButton
                direction="down"
                accessibilityLabel={`Move day ${day.dayNumber} down`}
                disabled={index === days.length - 1}
                onPress={() =>
                  onChange((draft) => ({ ...draft, days: moveDay(draft.days, index, 1) }))
                }
              />
              <IconButton
                icon="chevronRight"
                accessibilityLabel={`Edit day ${day.dayNumber}`}
                onPress={() => onOpenDay(day.dayNumber)}
              />
            </View>
          ))}
        </ListGroup>
        <Button
          variant="secondary"
          icon="plus"
          label="Add day"
          accessibilityLabel="Add day, a copy of the last day"
          disabled={days.length >= MAX_DAYS}
          onPress={() => onChange((draft) => ({ ...draft, days: addDay(draft.days) }))}
        />
      </View>
      <Button variant="primary" size="lg" label="Save" onPress={onSave} />
    </View>
  )
}
