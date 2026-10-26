import type { PlannedSessionId } from "@tanren/shared"
import type { ReactNode } from "react"
import { Pressable, View } from "react-native"
import type { PlanDay, PlannedExerciseBlock } from "../hooks/usePlanWeek"
import { radius, StatusPill, sizes, space, statusTone, Text, useBreakpoint, useTheme } from "../ui"
import { type PlanSessionItem, SessionBlocks } from "./PlannedSessionCard"
import {
  formatDayDate,
  formatDayShort,
  formatItemTarget,
  sessionLabel,
  statusLabel,
  weekdayLabel,
} from "./planFormat"

interface PlanSessionRowProps {
  readonly item: PlanSessionItem
  readonly selected?: boolean
  /** Makes the session a button, e.g. to select it for the aside. */
  readonly onPress?: () => void
  readonly showBlocks?: boolean
  /**
   * Phone day rows: the date column, placed before the title so the item lines below span the
   * full row width (ui-polish r1 review: names truncated in a 112 px slot).
   */
  readonly leading?: ReactNode
}

/**
 * Phone: one line per exercise, name left and "3 × 5 · 100 kg" tabular on the right (ui-polish §3
 * Plan 2); the rest time stays in the day card and on Today.
 */
function SessionItemLines({ blocks }: { readonly blocks: ReadonlyArray<PlannedExerciseBlock> }) {
  if (blocks.length === 0) {
    return (
      <Text variant="subhead" tone="muted">
        No exercises planned yet
      </Text>
    )
  }
  return (
    <View style={{ gap: space.xs }}>
      {blocks.map((block) => (
        <View
          key={block.exercise.id}
          style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}
        >
          <Text variant="subhead" numberOfLines={1} style={{ flex: 1 }}>
            {block.exercise.name}
          </Text>
          <Text
            variant="subhead"
            tone="muted"
            numberOfLines={1}
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {formatItemTarget(block.sets)}
          </Text>
        </View>
      ))}
    </View>
  )
}

/**
 * A session inside a grouped plan list: name (`headline` on phone, `subhead` above), status pill,
 * optional block lines (one line each on phone).
 */
export function PlanSessionRow({
  item,
  selected = false,
  onPress,
  showBlocks = true,
  leading,
}: PlanSessionRowProps) {
  const { colors } = useTheme()
  const phone = useBreakpoint() === "phone"
  const fullWidth = phone && leading !== undefined
  const label = sessionLabel(item.plannedSession.name, item.status)
  const titleRow = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
      <Text variant={phone ? "headline" : "subhead"} style={{ flex: 1 }}>
        {item.plannedSession.name}
      </Text>
      <StatusPill label={statusLabel(item.status)} tone={statusTone[item.status]} />
    </View>
  )
  const content = (
    <>
      {leading === undefined ? (
        titleRow
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          {leading}
          <View style={{ flex: 1 }}>{titleRow}</View>
        </View>
      )}
      {showBlocks ? (
        phone ? (
          <SessionItemLines blocks={item.blocks} />
        ) : (
          <SessionBlocks blocks={item.blocks} />
        )
      ) : null}
    </>
  )
  const box = {
    ...(fullWidth ? {} : { flex: 1 }),
    gap: fullWidth ? space.sm : space.xs,
    borderRadius: radius.md,
    borderCurve: "continuous",
    paddingVertical: space.xs,
    paddingHorizontal: fullWidth ? 0 : space.sm,
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
  if (breakpoint === "phone" && day.sessions.length === 0) {
    // Rest row, 52 high (16 + 20 + 16): "Mon 26" and "Rest" on one muted line (ui-polish §3 Plan 1).
    return (
      <View
        accessible
        accessibilityLabel={`${dayLabel}, rest`}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space.md,
          paddingVertical: space.lg,
          paddingHorizontal: space.lg,
        }}
      >
        <Text
          variant="subhead"
          tone={isToday ? "accent" : "muted"}
          style={{ width: DATE_COLUMN.phone, fontVariant: ["tabular-nums"] }}
        >
          {formatDayShort(day.weekday, day.date)}
        </Text>
        <Text variant="subhead" tone="muted" style={{ flex: 1 }}>
          Rest
        </Text>
      </View>
    )
  }
  if (breakpoint === "phone") {
    // Session day: the date sits beside the first title; the item lines span the full row width.
    return (
      <View style={{ gap: space.xs, paddingVertical: space.sm, paddingHorizontal: space.lg }}>
        {day.sessions.map((item, index) => (
          <PlanSessionRow
            key={item.plannedSession.id}
            item={item}
            showBlocks={showBlocks}
            selected={selectedSessionId === item.plannedSession.id}
            leading={
              index === 0 ? (
                <Text
                  variant="headline"
                  tone={isToday ? "accent" : "default"}
                  tabular
                  accessibilityLabel={dayLabel}
                  style={{ width: DATE_COLUMN.phone }}
                >
                  {formatDayShort(day.weekday, day.date)}
                </Text>
              ) : (
                <View style={{ width: DATE_COLUMN.phone }} />
              )
            }
            {...(onSelectSession === undefined
              ? {}
              : { onPress: () => onSelectSession(item.plannedSession.id) })}
          />
        ))}
      </View>
    )
  }
  return (
    <View
      style={{
        // desktop rest rows 64 (`rowTall`, measured 63 at r3); tablet keeps 56
        minHeight:
          breakpoint === "desktop" && day.sessions.length === 0 ? sizes.rowTall : sizes.controlLg,
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
