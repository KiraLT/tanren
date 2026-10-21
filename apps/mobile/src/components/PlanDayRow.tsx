import type { PlannedSessionId } from "@tanren/shared"
import { Pressable, View } from "react-native"
import type { PlanDay } from "../hooks/usePlanWeek"
import { radius, StatusPill, sizes, space, statusTone, Text, useBreakpoint, useTheme } from "../ui"
import { type PlanSessionItem, SessionBlocks } from "./PlannedSessionCard"
import { formatDayDate, sessionLabel, statusLabel, weekdayLabel } from "./planFormat"

interface PlanSessionRowProps {
  readonly item: PlanSessionItem
  readonly selected?: boolean
  /** Makes the session a button, e.g. to select it for the aside. */
  readonly onPress?: () => void
  readonly showBlocks?: boolean
}

/** A session inside a grouped plan list: `subhead` name, status pill, optional block lines. */
export function PlanSessionRow({
  item,
  selected = false,
  onPress,
  showBlocks = true,
}: PlanSessionRowProps) {
  const { colors } = useTheme()
  const label = sessionLabel(item.plannedSession.name, item.status)
  const content = (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <Text variant="subhead" style={{ flex: 1 }}>
          {item.plannedSession.name}
        </Text>
        <StatusPill label={statusLabel(item.status)} tone={statusTone[item.status]} />
      </View>
      {showBlocks ? <SessionBlocks blocks={item.blocks} /> : null}
    </>
  )
  const box = {
    flex: 1,
    gap: space.xs,
    borderRadius: radius.md,
    borderCurve: "continuous",
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
  } as const
  if (onPress === undefined) {
    return (
      <View
        accessible
        accessibilityLabel={label}
        style={[box, { backgroundColor: selected ? colors.accentSoft : "transparent" }]}
      >
        {content}
      </View>
    )
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        box,
        {
          minHeight: sizes.tap,
          backgroundColor: selected
            ? colors.accentSoft
            : pressed
              ? colors.surfaceRaised
              : "transparent",
        },
      ]}
    >
      {content}
    </Pressable>
  )
}

interface PlanDayRowProps {
  readonly day: PlanDay
  readonly isToday: boolean
  readonly selectedSessionId?: PlannedSessionId
  /** Makes the sessions pressable. */
  readonly onSelectSession?: (id: PlannedSessionId) => void
  readonly showBlocks?: boolean
}

/** Date column width: 72 on phone, 96 from tablet up. */
const DATE_COLUMN = { phone: 72, tablet: 96, desktop: 96 } as const

/**
 * One day of the week as a row of a grouped list (`PlanWeek` draws the surface and hairlines):
 * weekday `headline` (accent when today) over the date `subhead`, its sessions on the right.
 */
export function PlanDayRow({
  day,
  isToday,
  selectedSessionId,
  onSelectSession,
  showBlocks = true,
}: PlanDayRowProps) {
  const breakpoint = useBreakpoint()
  const dateText = formatDayDate(day.date)
  const dayLabel = `${weekdayLabel(day.weekday)} ${dateText}${isToday ? ", today" : ""}`
  return (
    <View
      style={{
        minHeight: sizes.controlLg,
        flexDirection: "row",
        alignItems: "flex-start",
        gap: space.md,
        paddingVertical: space.sm,
        paddingHorizontal: space.lg,
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
      <View style={{ flex: 1, gap: space.xs, justifyContent: "center", alignSelf: "stretch" }}>
        {day.sessions.length === 0 ? (
          <Text variant="subhead" tone="muted" style={{ paddingHorizontal: space.sm }}>
            Rest
          </Text>
        ) : (
          day.sessions.map((item) => (
            <PlanSessionRow
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
