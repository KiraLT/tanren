import type { PlannedSessionId } from "@tanren/shared"
import { StyleSheet, Text, View } from "react-native"
import type { PlanDay } from "../hooks/usePlanWeek"
import { PlannedSessionCard } from "./PlannedSessionCard"
import { formatDayDate, weekdayLabel } from "./planFormat"
import { colors, radius, space } from "./theme"

interface PlanDayRowProps {
  readonly day: PlanDay
  readonly isToday: boolean
  readonly selectedSessionId?: PlannedSessionId
  /** Makes the session cards pressable. */
  readonly onSelectSession?: (id: PlannedSessionId) => void
  readonly showBlocks?: boolean
}

/** One day of the week: weekday + date on the left (accent when today), its session cards right. */
export function PlanDayRow({
  day,
  isToday,
  selectedSessionId,
  onSelectSession,
  showBlocks = true,
}: PlanDayRowProps) {
  const dateText = formatDayDate(day.date)
  const dayLabel = `${weekdayLabel(day.weekday)} ${dateText}${isToday ? ", today" : ""}`
  return (
    <View style={[styles.row, isToday && styles.rowToday]}>
      <View accessible accessibilityLabel={dayLabel} style={styles.when}>
        <Text style={[styles.weekday, isToday && styles.weekdayToday]}>
          {weekdayLabel(day.weekday)}
        </Text>
        <Text style={styles.date}>{dateText}</Text>
      </View>
      <View style={styles.sessions}>
        {day.sessions.length === 0 ? (
          <Text style={styles.rest}>Rest</Text>
        ) : (
          day.sessions.map((item) => (
            <PlannedSessionCard
              key={item.plannedSession.id}
              item={item}
              showBlocks={showBlocks}
              selected={selectedSessionId === item.plannedSession.id}
              {...(onSelectSession === undefined
                ? {}
                : { onPress: () => onSelectSession(item.plannedSession.id) })}
            />
          ))
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    borderLeftWidth: 4,
    borderLeftColor: "transparent",
  },
  rowToday: { backgroundColor: colors.surfaceRaised, borderLeftColor: colors.accent },
  when: { width: 64, paddingTop: space.sm },
  weekday: { color: colors.text, fontSize: 20, fontWeight: "900" },
  weekdayToday: { color: colors.accent },
  date: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
  sessions: { flex: 1, gap: space.sm },
  rest: { color: colors.textMuted, fontSize: 16, paddingTop: space.md },
})
