import type { Program, ProgramDay } from "@tanren/shared"
import { Array as Arr, Option } from "effect"
import { View } from "react-native"
import { useBreakpoint } from "../../hooks/useLayoutMode"
import { ExerciseIllustration } from "../../library/ExerciseIllustration"
import {
  Button,
  Card,
  ListGroup,
  ListRow,
  ProgressRing,
  rhythm,
  StatRow,
  sizes,
  space,
  Text,
} from "../../ui"
import { exerciseName, itemAmount } from "../cues"
import {
  dayCardLine,
  dayDisc,
  dayMinutes,
  dayStateLabel,
  daySubtitle,
  daysDone,
  dayTrailing,
  doneLabel,
  insideRows,
  programProgress,
  programStats,
  weekWindow,
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
  const desktop = useBreakpoint() === "desktop"
  return (
    // Desktop: a "Program" eyebrow (same 28-px slot as "What's inside" on the right) so both
    // columns' first card starts at the same y.
    <View style={{ gap: desktop ? rhythm.labelToGroup : 0 }}>
      {desktop ? (
        <Text
          variant="caption"
          tone="muted"
          accessibilityRole="header"
          style={{ paddingHorizontal: space.lg, minHeight: space.xl + space.xs }}
        >
          Program
        </Text>
      ) : null}
      <Card>
        <View style={{ gap: space.lg }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: desktop ? space.lg : space.md,
            }}
          >
            <ExerciseIllustration
              catalogId={firstCatalogId(program)}
              size={desktop ? sizes.illustrationLg : sizes.illustrationSm}
            />
            <View style={{ flex: 1, gap: space.xs }}>
              <Text variant={desktop ? "display" : "title2"} accessibilityRole="header">
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
    </View>
  )
}

/**
 * Not enrolled, phone: "What's inside", the first week of days (name left, minutes right) under
 * the enrol card, so the page is not half empty.
 */
export function ProgramInside({
  program,
  flush = false,
}: {
  readonly program: Program
  /** Desktop side column: nothing above it, so no card -> label offset. */
  readonly flush?: boolean
}) {
  return (
    // The Page's section gap is 16; the card -> label gap is 24 (rhythm.groupToLabel).
    <View
      style={{
        gap: rhythm.labelToGroup,
        marginTop: flush ? 0 : rhythm.groupToLabel - space.lg,
      }}
    >
      <Text
        variant="caption"
        tone="muted"
        accessibilityRole="header"
        style={{ paddingHorizontal: space.lg, minHeight: space.xl + space.xs }}
      >
        What's inside
      </Text>
      <ListGroup>
        {Arr.map(insideRows(program.days), (row, index) => (
          <ListRow
            key={row.dayNumber}
            title={row.title}
            titleVariant="body"
            // Desktop only (390/768 unchanged): 64-high rows with the routine size as subtitle.
            {...(flush
              ? {
                  subtitle: Option.match(Arr.get(program.days, index), {
                    onNone: () => "",
                    onSome: daySubtitle,
                  }),
                  style: { minHeight: sizes.rowTall },
                }
              : {})}
            accessibilityLabel={`${row.title}, ${row.trailing}`}
            trailing={
              <Text variant="subhead" tone="muted" style={{ fontVariant: ["tabular-nums"] }}>
                {row.trailing}
              </Text>
            }
          />
        ))}
      </ListGroup>
    </View>
  )
}

/** Not enrolled, desktop right column: "What's inside" (first week) and the three program stats. */
export function ProgramPreview({ program }: { readonly program: Program }) {
  return (
    <View style={{ gap: rhythm.groupToLabel }}>
      <ProgramInside program={program} flush />
      <StatRow variant="tile" items={programStats(program.days)} />
    </View>
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
            stroke={3}
            progress={programProgress(day.dayNumber, total)}
            accessibilityLabel={`${program.name}, ${daysDone(day.dayNumber, total)} of ${total} days done`}
          >
            <Text variant="headline" tabular>
              {String(day.dayNumber)}
            </Text>
          </ProgressRing>
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
    <View style={{ gap: rhythm.labelToGroup }}>
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
            titleVariant="body"
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

/**
 * Day rows (done / now / todo) with the done counter above. The desktop aside lists every day
 * ("Days"); a phone or tablet shows "This week", the 7 days around the current one. The current
 * row is bold (headline, the rest body) with a chevron, no filled background.
 */
export function DayList({ program, currentDay }: DayListProps) {
  const total = program.days.length
  const wide = useBreakpoint() === "desktop"
  const days = wide ? program.days : weekWindow(program.days, currentDay)
  return (
    <View style={{ gap: rhythm.labelToGroup }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          paddingHorizontal: space.lg,
        }}
      >
        <Text variant="caption" tone="muted" accessibilityRole="header">
          {wide ? "Days" : "This week"}
        </Text>
        <Text variant="caption" tone="accent">
          {doneLabel(currentDay, total)}
        </Text>
      </View>
      <ListGroup>
        {Arr.map(days, (day) => {
          const disc = dayDisc(day.dayNumber, currentDay)
          const current = disc.state === "now"
          return (
            <ListRow
              key={day.dayNumber}
              title={day.title}
              titleVariant={current ? "headline" : "body"}
              disc={disc}
              accessibilityLabel={`${day.title}, ${dayStateLabel(disc.state)}`}
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
