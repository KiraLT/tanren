import type { PlannedSet, WorkoutSet } from "@tanren/shared"
import { Option } from "effect"
import { StyleSheet, Text, View } from "react-native"
import { buildSetRows, formatPlannedSet } from "./setRows"
import { formatKg } from "./stepMath"
import { colors, radius } from "./theme"

interface SetListProps {
  readonly plannedSets: ReadonlyArray<PlannedSet>
  readonly loggedSets: ReadonlyArray<WorkoutSet>
}

const formatLogged = (set: WorkoutSet): string =>
  `${formatKg(set.weightKg)} kg × ${set.reps}${Option.match(set.rpe, {
    onNone: () => "",
    onSome: (rpe) => ` · RPE ${rpe}`,
  })}`

/** Planned sets (target weight x reps, RPE); logged ones are ticked and show what was done. */
export function SetList({ plannedSets, loggedSets }: SetListProps) {
  const rows = buildSetRows(plannedSets, loggedSets)
  const nextPosition = loggedSets.length + 1
  return (
    <View style={styles.list}>
      {rows.map((row) => {
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
            style={[styles.row, next && styles.rowNext, done && styles.rowDone]}
          >
            <Text style={[styles.mark, done && styles.markDone]}>{done ? "✓" : row.position}</Text>
            <View style={styles.texts}>
              <Text style={[styles.planned, done && styles.plannedDone]}>{plannedText}</Text>
              {done ? <Text style={styles.logged}>{loggedText}</Text> : null}
            </View>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: "transparent",
  },
  rowNext: { borderColor: colors.accent },
  rowDone: { backgroundColor: colors.background, borderColor: colors.border },
  mark: {
    width: 32,
    textAlign: "center",
    color: colors.textMuted,
    fontSize: 22,
    fontWeight: "800",
  },
  markDone: { color: colors.success },
  texts: { flex: 1 },
  planned: { color: colors.text, fontSize: 22, fontWeight: "700" },
  plannedDone: { color: colors.textMuted, fontSize: 16, fontWeight: "600" },
  logged: { color: colors.success, fontSize: 22, fontWeight: "800" },
})
