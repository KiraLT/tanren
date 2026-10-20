import type { PlannedSet, WorkoutSet } from "@tanren/shared"
import { Option } from "effect"
import { View } from "react-native"
import { Card, Icon, space, stroke, Text, useTheme } from "../ui"
import { buildSetRows, formatPlannedSet } from "./setRows"
import { formatKg } from "./stepMath"

interface SetListProps {
  readonly plannedSets: ReadonlyArray<PlannedSet>
  readonly loggedSets: ReadonlyArray<WorkoutSet>
}

const formatLogged = (set: WorkoutSet): string =>
  `${formatKg(set.weightKg)} kg × ${set.reps}${Option.match(set.rpe, {
    onNone: () => "",
    onSome: (rpe) => ` · RPE ${rpe}`,
  })}`

/**
 * Planned sets (target weight x reps, RPE) as one grouped list with hairlines; the next set is
 * the only accented row, logged ones show a check and what was done.
 */
export function SetList({ plannedSets, loggedSets }: SetListProps) {
  const { colors } = useTheme()
  const rows = buildSetRows(plannedSets, loggedSets)
  const nextPosition = loggedSets.length + 1
  return (
    <Card padding={0} style={{ overflow: "hidden" }}>
      {rows.map((row, index) => {
        const done = Option.isSome(row.logged)
        const next = !done && row.position === nextPosition
        const plannedText = Option.match(row.planned, {
          onNone: () => "Extra set",
          onSome: formatPlannedSet,
        })
        const loggedText = Option.match(row.logged, { onNone: () => "", onSome: formatLogged })
        return (
          <View
            key={row.position}
            accessible
            accessibilityLabel={`Set ${row.position}, planned ${plannedText}${
              done ? `, logged ${loggedText}` : ""
            }`}
            style={{
              minHeight: 56,
              flexDirection: "row",
              alignItems: "center",
              gap: space.md,
              paddingHorizontal: space.lg,
              paddingVertical: space.sm,
              backgroundColor: next ? colors.accentSoft : "transparent",
              borderBottomWidth: index === rows.length - 1 ? 0 : stroke.hairline,
              borderBottomColor: colors.border,
            }}
          >
            <View style={{ width: 28, alignItems: "center" }}>
              {done ? (
                <Icon name="check" color={colors.success} />
              ) : (
                <Text variant="headline" tone={next ? "accent" : "muted"}>
                  {row.position}
                </Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              {done ? (
                <>
                  <Text variant="headline" tone="success">
                    {loggedText}
                  </Text>
                  <Text variant="subhead" tone="muted">
                    {plannedText}
                  </Text>
                </>
              ) : (
                <Text variant="headline">{plannedText}</Text>
              )}
            </View>
          </View>
        )
      })}
    </Card>
  )
}
