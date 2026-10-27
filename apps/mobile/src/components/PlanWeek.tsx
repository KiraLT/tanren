import type { LocalDate, PlannedSessionId } from "@tanren/shared"
import { Option } from "effect"
import { View } from "react-native"
import type { PlanWeekView } from "../hooks/usePlanWeek"
import { ListGroup, rhythm, StatRow, space, Text, useBreakpoint } from "../ui"

import { PlanDayRow, PlanSessionRow } from "./PlanDayRow"
import { formatWeekRange, weekLoggedLine, weekStats, weekSummary } from "./planFormat"

/**
 * The week stat row and, when the week has logged sets, one caption under it ("Logged 18 sets ·
 * 1,240 kg"). The line sits outside the tiles, so their height does not change.
 */
export function WeekStats({
  view,
  variant = "bare",
}: {
  readonly view: PlanWeekView
  readonly variant?: "bare" | "tile"
}) {
  const summary = weekSummary(view)
  return (
    <View style={{ gap: space.xs }}>
      <StatRow
        items={weekStats(summary)}
        {...(variant === "tile" ? { variant, direction: "column" as const } : {})}
      />
      {Option.match(weekLoggedLine(summary), {
        onNone: () => null,
        onSome: (line) => (
          <Text variant="caption" tone="muted" tabular>
            {line}
          </Text>
        ),
      })}
    </View>
  )
}

interface PlanWeekProps {
  readonly view: PlanWeekView
  /** Today's local date; the matching day row is highlighted. */
  readonly today: LocalDate
  readonly selectedSessionId?: PlannedSessionId
  /** Makes the session cards pressable (the wide layout selects one for the aside). */
  readonly onSelectSession?: (id: PlannedSessionId) => void
  readonly showBlocks?: boolean
}

/**
 * The current week: plan name, week range, the seven days exactly as given (`weekStart` is any
 * weekday, never snapped to Monday), then sessions without a date. Scrolling belongs to the
 * enclosing `Page scroll`.
 */
export function PlanWeek({
  view,
  today,
  selectedSessionId,
  onSelectSession,
  showBlocks = true,
}: PlanWeekProps) {
  const phone = useBreakpoint() === "phone"
  const first = view.days[0]
  const last = view.days[view.days.length - 1]
  const range =
    first !== undefined && last !== undefined ? formatWeekRange(first.date, last.date) : ""
  const selection = {
    ...(selectedSessionId === undefined ? {} : { selectedSessionId }),
    ...(onSelectSession === undefined ? {} : { onSelectSession }),
    showBlocks,
  }
  return (
    <View>
      <View style={{ paddingBottom: space.md, gap: space.xs }}>
        <Text variant="title" accessibilityRole="header">
          {view.plan.name}
        </Text>
        <Text variant="subhead" tone="muted">
          {range}
        </Text>
        {Option.match(view.week.intent, {
          onNone: () => null,
          onSome: (intent) => <Text tone="muted">{intent}</Text>,
        })}
      </View>
      {phone ? (
        <View style={{ marginBottom: rhythm.heroToSection }}>
          <WeekStats view={view} />
        </View>
      ) : null}
      <ListGroup>
        {view.days.map((day) => (
          <PlanDayRow key={day.date} day={day} isToday={day.date === today} {...selection} />
        ))}
      </ListGroup>
      {view.unscheduled.length === 0 ? null : (
        <View style={{ paddingTop: rhythm.groupToLabel, gap: rhythm.labelToGroup }}>
          <Text variant="caption" tone="muted" accessibilityRole="header">
            Unscheduled
          </Text>
          <ListGroup>
            {view.unscheduled.map((item) => (
              <View
                key={item.plannedSession.id}
                style={{ flexDirection: "row", padding: space.sm, paddingHorizontal: space.md }}
              >
                <PlanSessionRow
                  item={item}
                  showBlocks={showBlocks}
                  selected={selectedSessionId === item.plannedSession.id}
                  {...(onSelectSession === undefined
                    ? {}
                    : { onPress: () => onSelectSession(item.plannedSession.id) })}
                />
              </View>
            ))}
          </ListGroup>
        </View>
      )}
    </View>
  )
}
