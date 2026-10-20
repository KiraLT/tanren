import { Option } from "effect"
import type { ExerciseSummary, SessionSummary } from "../../hooks/useHistory"
import { ListRow, StatusPill, Text } from "../../ui"
import { formatE1Rm, formatLoggedDate, formatSetText, formatVolume } from "./progressFormat"

interface ExerciseRowProps {
  readonly summary: ExerciseSummary
  readonly selected: boolean
  readonly onPress: () => void
}

/** Name, best set and e1RM, and the day it was last logged. */
export function ExerciseRow({ summary, selected, onPress }: ExerciseRowProps) {
  const best = formatSetText(summary.best.weightKg, summary.best.reps)
  const e1Rm = formatE1Rm(summary.bestE1Rm)
  const last = formatLoggedDate(summary.lastLoggedAt)
  return (
    <ListRow
      title={summary.exercise.name}
      subtitle={`${best} · ${e1Rm}`}
      trailing={
        <Text variant="caption" tone="muted">
          {last}
        </Text>
      }
      selected={selected}
      onPress={onPress}
      accessibilityLabel={`${summary.exercise.name}, best set ${best}, ${e1Rm}, last logged ${last}`}
    />
  )
}

interface SessionRowProps {
  readonly summary: SessionSummary
}

/** Title, then `date · duration · sets · exercises · volume`, and a `PR ×n` pill when it set records. */
export function SessionRow({ summary }: SessionRowProps) {
  const date = formatLoggedDate(summary.session.startedAt)
  const parts = [
    date,
    ...Option.match(summary.durationMinutes, {
      onNone: () => [],
      onSome: (minutes) => [`${minutes} min`],
    }),
    `${summary.sets} ${summary.sets === 1 ? "set" : "sets"}`,
    `${summary.exercises} ${summary.exercises === 1 ? "exercise" : "exercises"}`,
    ...(summary.volumeKg > 0 ? [formatVolume(summary.volumeKg)] : []),
  ]
  const detail = parts.join(" · ")
  return (
    <ListRow
      title={summary.title}
      subtitle={detail}
      trailing={
        summary.prs > 0 ? <StatusPill label={`PR ×${summary.prs}`} tone="accent" /> : undefined
      }
      accessibilityLabel={`${summary.title}, ${detail}${summary.prs > 0 ? `, ${summary.prs} personal records` : ""}`}
    />
  )
}
