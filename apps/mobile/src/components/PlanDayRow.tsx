import type { PlannedSessionId } from "@tanren/shared"
import { View } from "react-native"
import type { PlanDay } from "../hooks/usePlanWeek"
import { space, stroke, Text, useBreakpoint, useTheme } from "../ui"
import { PlannedSessionCard } from "./PlannedSessionCard"
import { formatDayDate, weekdayLabel } from "./planFormat"

interface PlanDayRowProps {
  readonly day: PlanDay
  readonly isToday: boolean
  readonly selectedSessionId?: PlannedSessionId
  /** Makes the session cards pressable. */
  readonly onSelectSession?: (id: PlannedSessionId) => void
  readonly showBlocks?: boolean
}

/** Date column width: 64 on phone, 96 from tablet up (design §5). */
const DATE_COLUMN = { phone: 64, tablet: 96, desktop: 96 } as const

/**
 * One day of the week as a grouped row with a hairline: weekday + date on the left (accent tone
 * and an `accentSoft` background when today), its session cards on the right.
 */
export function PlanDayRow({
  day,
  isToday,
  selectedSessionId,
  onSelectSession,
  showBlocks = true,
}: PlanDayRowProps) {
  const { colors } = useTheme()
  const breakpoint = useBreakpoint()
  const dateText = formatDayDate(day.date)
  const dayLabel = `${weekdayLabel(day.weekday)} ${dateText}${isToday ? ", today" : ""}`
  return (
    <View
      style={{
        flexDirection: "row",
        gap: space.md,
        paddingVertical: space.md,
        paddingHorizontal: space.sm,
        borderBottomWidth: stroke.hairline,
        borderBottomColor: colors.border,
        backgroundColor: isToday ? colors.accentSoft : "transparent",
      }}
    >
      <View
        accessible
        accessibilityLabel={dayLabel}
        style={{ width: DATE_COLUMN[breakpoint], paddingTop: space.xs }}
      >
        <Text variant="headline" tone={isToday ? "accent" : "default"}>
          {weekdayLabel(day.weekday)}
        </Text>
        <Text variant="subhead" tone="muted">
          {dateText}
        </Text>
      </View>
      <View style={{ flex: 1, gap: space.sm }}>
        {day.sessions.length === 0 ? (
          <Text tone="muted" style={{ paddingTop: space.xs }}>
            Rest
          </Text>
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
