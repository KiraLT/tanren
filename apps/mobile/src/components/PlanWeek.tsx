import type { LocalDate, PlannedSessionId } from "@tanren/shared"
import { Option } from "effect"
import { ScrollView, StyleSheet, Text, View } from "react-native"
import type { PlanWeekView } from "../hooks/usePlanWeek"
import { PlanDayRow } from "./PlanDayRow"
import { PlannedSessionCard } from "./PlannedSessionCard"
import { formatWeekRange } from "./planFormat"
import { colors, space } from "./theme"

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
 * weekday, never snapped to Monday), then sessions without a date.
 */
export function PlanWeek({
  view,
  today,
  selectedSessionId,
  onSelectSession,
  showBlocks = true,
}: PlanWeekProps) {
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
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          {view.plan.name}
        </Text>
        <Text style={styles.range}>{range}</Text>
        {Option.match(view.week.intent, {
          onNone: () => null,
          onSome: (intent) => <Text style={styles.intent}>{intent}</Text>,
        })}
      </View>
      {view.days.map((day) => (
        <PlanDayRow key={day.date} day={day} isToday={day.date === today} {...selection} />
      ))}
      {view.unscheduled.length === 0 ? null : (
        <View style={styles.unscheduled}>
          <Text style={styles.unscheduledTitle} accessibilityRole="header">
            Unscheduled
          </Text>
          {view.unscheduled.map((item) => (
            <PlannedSessionCard
              key={item.plannedSession.id}
              item={item}
              showBlocks={showBlocks}
              selected={selectedSessionId === item.plannedSession.id}
              {...(onSelectSession === undefined
                ? {}
                : { onPress: () => onSelectSession(item.plannedSession.id) })}
            />
          ))}
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { padding: space.md, paddingBottom: space.xl, gap: space.sm },
  header: { paddingBottom: space.sm, gap: 4 },
  title: { color: colors.text, fontSize: 32, fontWeight: "900" },
  range: { color: colors.accent, fontSize: 18, fontWeight: "800" },
  intent: { color: colors.textMuted, fontSize: 16 },
  unscheduled: { paddingTop: space.md, gap: space.sm },
  unscheduledTitle: { color: colors.text, fontSize: 20, fontWeight: "900" },
})
