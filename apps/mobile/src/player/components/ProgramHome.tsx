import type { Program, ProgramDay } from "@tanren/shared"
import { Array as Arr, Option } from "effect"
import { useState } from "react"
import { Pressable, View, type ViewStyle } from "react-native"
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
  type RowDisc,
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
  programProgress,
  weekWindow,
} from "../programDays"

/** Height of a desktop section-label row ("Program" / "Days"): 28, so both columns align. */
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
    // Desktop: a "Program" eyebrow (same 28-px slot as the "Days" label on the right) so both
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

interface DayCardProps {
  readonly program: Program
  readonly day: ProgramDay
  readonly onStart: () => void
  /** A paused enrollment shows the "Paused" pill and "Resume" in place of "Start day N". */
  readonly paused: boolean
  readonly onResume: () => void
  /** The Resume pill: primary on the detail hero (default), secondary in the tab's list. */
  readonly resumeVariant?: ButtonVariant
  /** When given, the header (ring + name) opens the current day's read-only preview. */
  readonly onOpenDay?: () => void
}

/** The enrolled program: progress ring, name, "Day 2 of 30 · …" and the one primary pill. */
export function DayCard({
  program,
  day,
  onStart,
  paused,
  onResume,
  resumeVariant = "primary",
  onOpenDay,
}: DayCardProps) {
  const total = program.days.length
  const headerContent = (
    <>
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
        {paused ? <StatusPill tone="muted" label="Paused" /> : null}
      </View>
    </>
  )
  const headerStyle: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: sizes.tap,
  }
  return (
    <Card>
      <View style={{ gap: space.lg }}>
        {onOpenDay === undefined ? (
          <View style={headerStyle}>{headerContent}</View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Preview day ${day.dayNumber} of ${program.name}`}
            onPress={onOpenDay}
            style={headerStyle}
          >
            {headerContent}
          </Pressable>
        )}
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
  /** A row press opens the read-only day preview (`/programs/[programId]/day/[n]`). */
  readonly onPreview: (dayNumber: number) => void
  /** Not enrolled: the header reads "Days" and the "0 of N done" counter is hidden. */
  readonly enrolled: boolean
}

/**
 * Day rows (done / now / todo) with the done counter above. The desktop aside lists every day
 * ("Days"); a phone or tablet shows "This week", the 7 days around the current one. The current
 * row is bold (headline, the rest body) with a chevron, no filled background.
 */
export function DayList({ program, currentDay, onPreview, enrolled }: DayListProps) {
  const total = program.days.length
  const wide = useBreakpoint() === "desktop"
  // Phone / tablet: the week window until "Show all N days" expands it to every day.
  const [expanded, setExpanded] = useState(false)
  const all = wide || expanded
  const days = all ? program.days : weekWindow(program.days, currentDay)
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
          {all || !enrolled ? "Days" : "This week"}
        </Text>
        {enrolled ? (
          <Text variant="caption" tone="accent">
            {doneLabel(currentDay, total)}
          </Text>
        ) : null}
      </View>
      <ListGroup>
        {Arr.map(days, (day) => {
          // Not enrolled: every row is neutral (`currentDay` is a fallback of 1, not "up next").
          const disc: RowDisc = enrolled
            ? dayDisc(day.dayNumber, currentDay)
            : { state: "todo", index: day.dayNumber }
          const current = disc.state === "now"
          return (
            <ListRow
              key={day.dayNumber}
              title={day.title}
              titleVariant={current ? "headline" : "body"}
              disc={disc}
              accessibilityLabel={`Preview day ${day.dayNumber}, ${dayStateLabel(disc.state)}`}
              onPress={() => onPreview(day.dayNumber)}
              chevron
              trailing={
                <Text variant="subhead" tone="muted" style={{ fontVariant: ["tabular-nums"] }}>
                  {dayTrailing(day)}
                </Text>
              }
            />
          )
        })}
      </ListGroup>
      {all || days.length >= total ? null : (
        <Button
          label={`Show all ${total} days`}
          variant="text"
          size="md"
          onPress={() => setExpanded(true)}
        />
      )}
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
