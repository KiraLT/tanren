import type { Program, ProgramDay } from "@tanren/shared"
import { Array as Arr, Option } from "effect"
import { View } from "react-native"
import { ExerciseIllustration } from "../../library/ExerciseIllustration"
import { Button, Card, ListGroup, ListRow, ProgressRing, sizes, space, Text } from "../../ui"
import { exerciseName, itemAmount } from "../cues"
import {
  dayCardLine,
  dayDisc,
  dayMinutes,
  daysDone,
  dayTrailing,
  doneLabel,
  programProgress,
} from "../programDays"

/** "≈ 15 min" from the planned length. */
export const approxMinutes = (day: ProgramDay): string => `≈ ${dayMinutes(day)} min`

/** The program's first exercise, whose illustration stands for the program. */
const firstCatalogId = (program: Program) =>
  Option.flatMap(Arr.head(program.days), (day) =>
    Option.map(Arr.head(day.items), (item) => item.catalogId),
  )

interface EnrolCardProps {
  readonly program: Program
  readonly enrolling: boolean
  readonly onEnrol: () => void
}

/** No active enrollment: what the program is and one primary pill to start it. */
export function EnrolCard({ program, enrolling, onEnrol }: EnrolCardProps) {
  return (
    <Card>
      <View style={{ gap: space.lg }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          {Option.match(firstCatalogId(program), {
            onNone: () => null,
            onSome: (catalogId) => (
              <ExerciseIllustration catalogId={catalogId} size={sizes.illustrationSm} />
            ),
          })}
          <View style={{ flex: 1, gap: space.xs }}>
            <Text variant="title2" accessibilityRole="header">
              {program.name}
            </Text>
            <Text variant="subhead" tone="muted">
              {`${program.tagline} · ${program.days.length} days`}
            </Text>
          </View>
        </View>
        <Text>{program.description}</Text>
        <Button
          label={`Start ${program.name}`}
          accessibilityLabel={`Enrol in ${program.name}`}
          icon="zap"
          variant="primary"
          size="lg"
          onPress={onEnrol}
          loading={enrolling}
        />
      </View>
    </Card>
  )
}

interface DayCardProps {
  readonly program: Program
  readonly day: ProgramDay
  readonly onStart: () => void
}

/** The enrolled program: progress ring, name, "Day 2 of 30 · …" and the one primary pill. */
export function DayCard({ program, day, onStart }: DayCardProps) {
  const total = program.days.length
  return (
    <Card>
      <View style={{ gap: space.lg }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <ProgressRing
            size="md"
            progress={programProgress(day.dayNumber, total)}
            accessibilityLabel={`${program.name}, ${daysDone(day.dayNumber, total)} of ${total} days done`}
          />
          <View style={{ flex: 1, gap: space.xs }}>
            <Text variant="title2" accessibilityRole="header">
              {program.name}
            </Text>
            <Text variant="subhead" tone="muted">
              {dayCardLine(day, total)}
            </Text>
          </View>
        </View>
        <Button
          label={`Start day ${day.dayNumber}`}
          icon="zap"
          variant="primary"
          size="lg"
          onPress={onStart}
        />
      </View>
    </Card>
  )
}

interface DayItemsProps {
  readonly day: ProgramDay
}

/** Today's exercises as a grouped list: name left, reps or seconds right (phone only). */
export function DayItems({ day }: DayItemsProps) {
  return (
    <View style={{ gap: space.sm }}>
      <Text
        variant="caption"
        tone="muted"
        accessibilityRole="header"
        style={{ paddingLeft: space.lg }}
      >
        {`Day ${day.dayNumber} exercises`}
      </Text>
      <ListGroup>
        {Arr.map(day.items, (item, index) => (
          <ListRow
            key={`${item.catalogId}-${index}`}
            title={exerciseName(item.catalogId)}
            accessibilityLabel={`${exerciseName(item.catalogId)}, ${itemAmount(item)}`}
            trailing={
              <Text variant="subhead" tone="muted" style={{ fontVariant: ["tabular-nums"] }}>
                {itemAmount(item)}
              </Text>
            }
          />
        ))}
      </ListGroup>
    </View>
  )
}

interface DayListProps {
  readonly program: Program
  readonly currentDay: number
}

/** Every day of the program as disc rows (done / now / todo) with the done counter above. */
export function DayList({ program, currentDay }: DayListProps) {
  const total = program.days.length
  return (
    <View style={{ gap: space.sm }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          paddingHorizontal: space.lg,
        }}
      >
        <Text variant="caption" tone="muted" accessibilityRole="header">
          Days
        </Text>
        <Text variant="caption" tone="accent">
          {doneLabel(currentDay, total)}
        </Text>
      </View>
      <ListGroup>
        {Arr.map(program.days, (day) => {
          const disc = dayDisc(day.dayNumber, currentDay)
          return (
            <ListRow
              key={day.dayNumber}
              title={day.title}
              disc={disc}
              selected={disc.state === "now"}
              accessibilityLabel={`${day.title}, ${disc.state === "done" ? "done" : disc.state === "now" ? "up next" : "upcoming"}`}
              trailing={
                <Text variant="subhead" tone="muted" style={{ fontVariant: ["tabular-nums"] }}>
                  {dayTrailing(day)}
                </Text>
              }
            />
          )
        })}
      </ListGroup>
    </View>
  )
}

/** Past the last day. */
export function ProgramFinished({ program }: { readonly program: Program }) {
  return (
    <Card tone="success">
      <View style={{ gap: space.sm }}>
        <Text variant="title2">{`${program.name} complete`}</Text>
        <Text>{`All ${program.days.length} days done.`}</Text>
      </View>
    </Card>
  )
}
