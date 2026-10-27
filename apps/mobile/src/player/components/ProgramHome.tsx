import type { Program, ProgramDay } from "@tanren/shared"
import { Array as Arr, Option } from "effect"
import { View } from "react-native"
import { useBreakpoint } from "../../hooks/useLayoutMode"
import { ExerciseIllustration } from "../../library/ExerciseIllustration"
import {
  Button,
  type ButtonVariant,
  Card,
  gutter,
  ListGroup,
  ListRow,
  ProgressRing,
  rhythm,
  StatRow,
  StatusPill,
  sizes,
  space,
  stepperSizeFor,
  Text,
  useColumns,
} from "../../ui"
import { exerciseName, itemAmount } from "../cues"
import {
  dayCardLine,
  dayDisc,
  dayMinutes,
  dayStateLabel,
  daysDone,
  dayTrailing,
  doneLabel,
  insideRows,
  programProgress,
  weekWindow,
} from "../programDays"

/** Height of a desktop section-label row ("Program" / "What's inside"): 28, so both columns align. */
const SECTION_LABEL_HEIGHT = sizes.labelRow

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
  /** "Start program" (default) or "Start alongside" when another program runs. */
  readonly startLabel?: string
  /** The caption under the title: "30 days · 4–18 min" (`summarySubtitle`, as on the tab row). */
  readonly meta: string
}

/** No active enrollment: what the program is and one primary pill to start it. */
export function EnrolCard({
  program,
  enrolling,
  onEnrol,
  startLabel = "Start program",
  meta,
}: EnrolCardProps) {
  const desktop = useBreakpoint() === "desktop"
  return (
    // Desktop: a "Program" eyebrow (same 28-px slot as "What's inside" on the right) so both
    // columns' first card starts at the same y.
    <View style={{ gap: desktop ? rhythm.labelToGroup : 0 }}>
      {desktop ? (
        <Text
          variant="caption"
          tone="muted"
          headingLevel={2}
          style={{ paddingHorizontal: space.lg, minHeight: SECTION_LABEL_HEIGHT }}
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
              <Text variant={desktop ? "display" : "title2"} headingLevel={2}>
                {program.name}
              </Text>
              <Text variant="caption" tone="muted">
                {meta}
              </Text>
              <Text variant="subhead" tone="muted">
                {program.tagline}
              </Text>
            </View>
          </View>
          <Text>{program.description}</Text>
          <Button
            label={startLabel}
            accessibilityLabel={`${startLabel}: ${program.name}`}
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
export function ProgramInside({ program }: { readonly program: Program }) {
  return (
    // The Page's section gap is 16; the card -> label gap is 24 (rhythm.groupToLabel).
    <View
      style={{
        gap: rhythm.labelToGroup,
        marginTop: rhythm.groupToLabel - space.lg,
      }}
    >
      <Text
        variant="caption"
        tone="muted"
        headingLevel={2}
        style={{ paddingHorizontal: space.lg, minHeight: SECTION_LABEL_HEIGHT }}
      >
        What's inside
      </Text>
      <ListGroup>
        {Arr.map(insideRows(program.days), (row) => (
          <ListRow
            key={row.dayNumber}
            title={row.title}
            titleVariant="body"
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

interface DayCardProps {
  readonly program: Program
  readonly day: ProgramDay
  readonly onStart: () => void
  /** A paused enrollment shows the "Paused" pill and "Resume" in place of "Start day N". */
  readonly paused: boolean
  readonly onResume: () => void
  /** The Resume pill: primary on the detail hero (default), secondary in the tab's list. */
  readonly resumeVariant?: ButtonVariant
}

/** The enrolled program: progress ring, name, "Day 2 of 30 · …" and the one primary pill. */
export function DayCard({
  program,
  day,
  onStart,
  paused,
  onResume,
  resumeVariant = "primary",
}: DayCardProps) {
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
            <Text variant="title2" headingLevel={2}>
              {program.name}
            </Text>
            <Text variant="subhead" tone="muted">
              {dayCardLine(day, total)}
            </Text>
            {paused ? (
              // The pill's `surface` fill vanishes on the card: pull its text onto the text edge.
              <StatusPill tone="neutral" label="Paused" style={{ marginLeft: -space.sm }} />
            ) : null}
          </View>
        </View>
        {paused ? (
          <Button
            label="Resume"
            accessibilityLabel={`Resume ${program.name}`}
            icon="play"
            variant={resumeVariant}
            size="lg"
            onPress={onResume}
          />
        ) : (
          <Button
            label={`Start day ${day.dayNumber}`}
            accessibilityLabel={`Start day ${day.dayNumber} of ${program.name}`}
            icon="zap"
            variant="primary"
            size="lg"
            onPress={onStart}
          />
        )}
      </View>
    </Card>
  )
}

interface DayStatsProps {
  readonly program: Program
  readonly day: ProgramDay
}

/**
 * Desktop only, enrolled, between the day card and the exercises: the one stat-row rule (in-card
 * tiles) as "Done 2/30 · Today 15 min · Exercises 7". Dense in the 404 column of a 900 window.
 */
export function DayStats({ program, day }: DayStatsProps) {
  const { main } = useColumns()
  const dense = stepperSizeFor(main - 2 * gutter.desktop) === "xl"
  return (
    <StatRow
      variant="tile"
      dense={dense}
      items={[
        {
          label: "Done",
          value: `${daysDone(day.dayNumber, program.days.length)}/${program.days.length}`,
        },
        { label: "Today", value: dayTrailing(day) },
        { label: "Exercises", value: String(day.items.length) },
      ]}
    />
  )
}

interface DayItemsProps {
  readonly day: ProgramDay
}

/** Today's exercises as a grouped list: name left, reps or seconds right (phone only). */
export function DayItems({ day }: DayItemsProps) {
  return (
    <View style={{ gap: rhythm.labelToGroup }}>
      <Text variant="caption" tone="muted" headingLevel={2} style={{ paddingLeft: space.lg }}>
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
        <Text variant="caption" tone="muted" headingLevel={2}>
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
