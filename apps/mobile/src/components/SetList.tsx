import type { PlannedSet, WorkoutSet } from "@tanren/shared"
import { Option } from "effect"
import { type DiscState, ListGroup, ListRow, Text } from "../ui"
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
 * Planned sets as one grouped card (§5): a disc per row (done check, the next set accented,
 * the rest outlined), "Set N" as the title and what was done, or the target, on the right.
 */
export function SetList({ plannedSets, loggedSets }: SetListProps) {
  const rows = buildSetRows(plannedSets, loggedSets)
  const nextPosition = loggedSets.length + 1
  return (
    <ListGroup>
      {rows.map((row) => {
        const done = Option.isSome(row.logged)
        const state: DiscState = done ? "done" : row.position === nextPosition ? "now" : "todo"
        const plannedText = Option.match(row.planned, {
          onNone: () => "Extra set",
          onSome: formatPlannedSet,
        })
        const loggedText = Option.match(row.logged, { onNone: () => "", onSome: formatLogged })
        return (
          <ListRow
            key={row.position}
            title={`Set ${row.position}`}
            disc={{ state, index: row.position }}
            accessibilityLabel={`Set ${row.position}, planned ${plannedText}${
              done ? `, logged ${loggedText}` : ""
            }`}
            trailing={
              <Text variant="subhead" tone="muted">
                {done ? loggedText : plannedText}
              </Text>
            }
          />
        )
      })}
    </ListGroup>
  )
}
