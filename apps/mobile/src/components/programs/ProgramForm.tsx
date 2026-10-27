import type { ProgramDay, ProgramSchedule } from "@tanren/shared"
import { Array as Arr, Option } from "effect"
import { View } from "react-native"
import {
  Banner,
  Button,
  Columns,
  IconButton,
  ListGroup,
  ListRow,
  rhythm,
  space,
  useBreakpoint,
} from "../../ui"
import { MoveButton, SectionLabel, TextField } from "./ProgramFields"
import { addDay, daySubtitle, MAX_DAYS, moveDay, toggleWeekday } from "./programEdit"
import { SchedulePicker } from "./SchedulePicker"
import type { DraftChange } from "./useProgramEditor"

export interface ProgramFormProps {
  readonly title: string
  readonly summary: string
  readonly schedule: ProgramSchedule
  readonly days: ReadonlyArray<ProgramDay>
  readonly error: Option.Option<string>
  /** A write is in flight: the move buttons are off until it lands. */
  readonly busy: boolean
  /** Queued: each change is applied to the stored row (version + 1); there is no draft to flush. */
  readonly onChange: (change: DraftChange) => void
  /** Position-based (move a day): ignored while a write is in flight. */
  readonly onChangeOnce: (change: DraftChange) => void
  readonly onOpenDay: (dayNumber: number) => void
  readonly onSave: () => void
}

const group = { gap: rhythm.labelToGroup } as const

/**
 * The program editor body. Desktop: Title, Summary, Schedule and Save on the left, the day list on
 * the right (5/7); below that one column with Save after the days.
 */
export function ProgramForm({
  title,
  summary,
  schedule,
  days,
  error,
  busy,
  onChange,
  onChangeOnce,
  onOpenDay,
  onSave,
}: ProgramFormProps) {
  const desktop = useBreakpoint() === "desktop"
  const save = <Button variant="primary" size="lg" label="Save" onPress={onSave} />
  const fields = (
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
          onPerWeek={(perWeek) =>
            onChange((draft) => ({ ...draft, schedule: { kind: "daysPerWeek", days: perWeek } }))
          }
          onToggleWeekday={(weekday) =>
            onChange((draft) => ({ ...draft, schedule: toggleWeekday(draft.schedule, weekday) }))
          }
        />
      </View>
      {desktop ? save : null}
    </View>
  )
  const dayList = (
    <View style={{ gap: rhythm.groupToLabel }}>
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
                disabled={index === 0 || busy}
                onPress={() =>
                  onChangeOnce((draft) => ({ ...draft, days: moveDay(draft.days, index, -1) }))
                }
              />
              <MoveButton
                direction="down"
                accessibilityLabel={`Move day ${day.dayNumber} down`}
                disabled={index === days.length - 1 || busy}
                onPress={() =>
                  onChangeOnce((draft) => ({ ...draft, days: moveDay(draft.days, index, 1) }))
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
      {desktop ? null : save}
    </View>
  )
  return <Columns split="5/7" main={fields} side={dayList} />
}
